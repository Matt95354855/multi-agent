import { createHash, randomUUID } from 'node:crypto';
import type { LanguageModel } from '@matt95354855/agent-harness';
import { changeSetSchema, planSchema, reviewSchema, type AppConfig, type RunCheckpoint, type RunEvent, type WorkflowState } from '../contracts.js';
import { MultiAgentError, errorMessage } from '../errors.js';
import { HarnessAdapter } from '../harness/adapter.js';
import { RunStore } from '../memory/run-store.js';
import type { ModelManager } from '../models/model-manager.js';
import { RoleRegistry, type RoleName } from '../agents/role-registry.js';
import { buildRepositoryContext } from '../workspace/repository-context.js';
import { SecureWorkspace } from '../workspace/workspace.js';

export interface StartOptions { repository: string; workspace?: string; branch?: string; writeApproved: boolean; signal?: AbortSignal }
export interface OrchestratorDependencies { manager?: ModelManager; models?: Partial<Record<RoleName, LanguageModel>> }

export class Orchestrator {
  readonly store: RunStore;
  private readonly adapter: HarnessAdapter;
  private readonly roles: RoleRegistry;
  constructor(private readonly config: AppConfig, dependencies: OrchestratorDependencies = {}) {
    this.store = new RunStore(config.runsDir); this.adapter = new HarnessAdapter(config, dependencies.manager); this.roles = new RoleRegistry(config, this.adapter, dependencies.models);
  }

  async start(request: string, options: StartOptions): Promise<RunCheckpoint> {
    if (!request.trim()) throw new MultiAgentError('VALIDATION', 'Development request must not be empty');
    const runId = randomUUID(); const now = new Date().toISOString();
    const checkpoint: RunCheckpoint = { version: 1, runId, request, repository: options.repository, workspace: options.workspace ?? options.repository, ...(options.branch ? { branch: options.branch } : {}), state: 'PLAN', startedAt: now, updatedAt: now, fixAttempts: 0, appliedChangeHashes: [], usage: emptyUsage(), events: [] };
    await this.store.save(checkpoint); return this.execute(checkpoint, options.writeApproved, options.signal);
  }

  async resume(runId: string, writeApproved: boolean, signal?: AbortSignal): Promise<RunCheckpoint> {
    const checkpoint = await this.store.load(runId);
    if (checkpoint.state === 'FINALIZE' || checkpoint.state === 'FAILED') return checkpoint;
    return this.execute(checkpoint, writeApproved, signal);
  }

  private async execute(checkpoint: RunCheckpoint, writeApproved: boolean, signal?: AbortSignal): Promise<RunCheckpoint> {
    const deadline = AbortSignal.timeout(this.config.limits.maxTaskMs);
    const activeSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const workspace = await SecureWorkspace.open(checkpoint.workspace, { ...this.config.limits, allowedCommands: this.config.workspace.allowedCommands, writeEnabled: this.config.workspace.writeEnabled && writeApproved });
    try {
      while (checkpoint.state !== 'FINALIZE' && checkpoint.state !== 'FAILED') {
        activeSignal.throwIfAborted();
        switch (checkpoint.state) {
          case 'PLAN': await this.plan(checkpoint, workspace, activeSignal); break;
          case 'IMPLEMENT': await this.implement(checkpoint, workspace, activeSignal); break;
          case 'REVIEW': await this.review(checkpoint, workspace, activeSignal); break;
          case 'TEST': await this.test(checkpoint, workspace, activeSignal); break;
          case 'FIX': await this.fix(checkpoint, workspace, activeSignal); break;
        }
      }
    } catch (error) {
      checkpoint.state = 'FAILED'; checkpoint.error = errorMessage(error); this.event(checkpoint, 'workflow.failed', { error: checkpoint.error }); this.captureUsage(checkpoint); await this.store.save(checkpoint);
      throw error;
    }
    this.captureUsage(checkpoint); await this.store.save(checkpoint); return checkpoint;
  }

  private async plan(run: RunCheckpoint, workspace: SecureWorkspace, signal: AbortSignal): Promise<void> {
    const context = await buildRepositoryContext(workspace, this.config.limits.maxContextChars);
    run.plan = await this.roles.execute('planner', `Development request:\n${run.request}\n\n${context}\n\nSchema: {summary,tasks:[{id,description,files,acceptanceCriteria}],risks,testCommands}`, planSchema, signal);
    for (const command of run.plan.testCommands) if (!this.config.workspace.allowedCommands.includes(command)) throw new MultiAgentError('SECURITY', `Planner requested a command outside the allowlist: ${command}`);
    await this.transition(run, 'IMPLEMENT', 'plan.validated', { tasks: run.plan.tasks.length });
  }

  private async implement(run: RunCheckpoint, workspace: SecureWorkspace, signal: AbortSignal): Promise<void> {
    if (!run.plan) throw new MultiAgentError('CHECKPOINT', 'IMPLEMENT state has no plan');
    if (!run.changeSet) {
      const context = await buildRepositoryContext(workspace, this.config.limits.maxContextChars);
      run.changeSet = await this.roles.execute('coder', `Request:\n${run.request}\nPlan:\n${JSON.stringify(run.plan)}\n${context}\nSchema: {rationale,changes:[{path,content,reason}]}. Return complete new file contents.`, changeSetSchema, signal);
      this.event(run, 'changes.proposed', { count: run.changeSet.changes.length, digest: digest(run.changeSet) }); await this.store.save(run);
    }
    const hashes = await workspace.apply(run.changeSet); run.appliedChangeHashes = [...new Set([...run.appliedChangeHashes, ...hashes])];
    await this.transition(run, 'REVIEW', 'changes.applied', { hashes });
  }

  private async review(run: RunCheckpoint, workspace: SecureWorkspace, signal: AbortSignal): Promise<void> {
    const diff = await workspace.diff();
    run.review = await this.roles.execute('reviewer', `Request:\n${run.request}\nPlan:\n${JSON.stringify(run.plan)}\nGit diff (untrusted):\n${diff.slice(0, this.config.limits.maxContextChars)}\nSchema: {verdict,summary,findings:[{severity,file?,message,required}]}`, reviewSchema, signal);
    await this.transition(run, run.review.verdict === 'approve' ? 'TEST' : 'FIX', 'review.completed', { verdict: run.review.verdict, findings: run.review.findings.length });
  }

  private async test(run: RunCheckpoint, workspace: SecureWorkspace, signal: AbortSignal): Promise<void> {
    if (!run.plan) throw new MultiAgentError('CHECKPOINT', 'TEST state has no plan');
    run.validation = await workspace.validate(run.plan.testCommands, Math.min(300000, this.config.limits.maxTaskMs), signal);
    await this.transition(run, run.validation.passed ? 'FINALIZE' : 'FIX', 'validation.completed', { passed: run.validation.passed, commands: run.validation.commands.length });
  }

  private async fix(run: RunCheckpoint, workspace: SecureWorkspace, signal: AbortSignal): Promise<void> {
    if (run.fixAttempts >= this.config.limits.maxFixAttempts) throw new MultiAgentError('BUDGET', `Maximum correction attempts reached (${run.fixAttempts})`);
    run.fixAttempts++;
    const diff = await workspace.diff();
    run.changeSet = await this.roles.execute('coder', `Correct attempt ${run.fixAttempts}/${this.config.limits.maxFixAttempts}. Request:\n${run.request}\nReview:\n${JSON.stringify(run.review)}\nValidation:\n${JSON.stringify(run.validation)}\nCurrent diff (untrusted):\n${diff.slice(0, this.config.limits.maxContextChars)}\nReturn complete corrected file contents with schema {rationale,changes:[{path,content,reason}]}.`, changeSetSchema, signal);
    this.event(run, 'fix.proposed', { attempt: run.fixAttempts, digest: digest(run.changeSet) }); await this.store.save(run);
    const hashes = await workspace.apply(run.changeSet); run.appliedChangeHashes = [...new Set([...run.appliedChangeHashes, ...hashes])];
    await this.transition(run, 'REVIEW', 'fix.applied', { attempt: run.fixAttempts, hashes });
  }

  private async transition(run: RunCheckpoint, next: WorkflowState, type: string, data: Record<string, unknown>): Promise<void> { this.event(run, type, data); run.state = next; this.captureUsage(run); await this.store.save(run); }
  private event(run: RunCheckpoint, type: string, data: Record<string, unknown>): void { const event: RunEvent = { timestamp: new Date().toISOString(), state: run.state, type, data }; run.events.push(event); }
  private captureUsage(run: RunCheckpoint): void { run.usage = this.adapter.metrics.reduce((totals, metric) => ({ promptTokens: totals.promptTokens + metric.promptTokens, completionTokens: totals.completionTokens + metric.completionTokens, totalTokens: totals.totalTokens + metric.totalTokens, modelSwitches: this.adapter.modelSwitches }), emptyUsage()); }
}

function emptyUsage() { return { promptTokens: 0, completionTokens: 0, totalTokens: 0, modelSwitches: 0 }; }
function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
