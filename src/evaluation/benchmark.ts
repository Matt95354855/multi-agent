import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AppConfig } from '../contracts.js';
import { Orchestrator, type OrchestratorDependencies } from '../orchestrator/orchestrator.js';
import { runProcess } from '../utils/process.js';
import { benchmarkCorpus, type BenchmarkTask } from './corpus.js';
import { probeResources, type ResourceSnapshot } from '../models/resource-probe.js';
import type { ModelMetrics } from '../models/model-manager.js';

export type BenchmarkStrategy = 'gpt-oss' | 'qwen' | 'collaboration';
export interface TaskResult { taskId: string; strategy: BenchmarkStrategy; workflowPassed: boolean; hiddenPassed: boolean; regression: boolean; attempts: number; durationMs: number; tokens: number; modelSwitches: number; error?: string }
export interface BenchmarkReport { generatedAt: string; simulated: boolean; strategies: BenchmarkStrategy[]; taskCount: number; resourceBefore: ResourceSnapshot; resourceAfter: ResourceSnapshot; modelLoads: ModelMetrics[]; results: TaskResult[]; summary: Record<string, { successRate: number; regressionRate: number; averageDurationMs: number; averageAttempts: number }> }

export async function runBenchmark(config: AppConfig, strategies: BenchmarkStrategy[], dependencies: OrchestratorDependencies = {}, tasks: BenchmarkTask[] = benchmarkCorpus): Promise<BenchmarkReport> {
  const resourceBefore = await probeResources();
  const results: TaskResult[] = [];
  for (const strategy of strategies) for (const task of tasks) results.push(await runTask(configFor(config, strategy), strategy, task, dependencies));
  const summary = Object.fromEntries(strategies.map(strategy => { const rows = results.filter(row => row.strategy === strategy); return [strategy, { successRate: ratio(rows.filter(row => row.hiddenPassed).length, rows.length), regressionRate: ratio(rows.filter(row => row.regression).length, rows.length), averageDurationMs: average(rows.map(row => row.durationMs)), averageAttempts: average(rows.map(row => row.attempts)) }]; }));
  return { generatedAt: new Date().toISOString(), simulated: Boolean(dependencies.models), strategies, taskCount: tasks.length, resourceBefore, resourceAfter: await probeResources(), modelLoads: dependencies.manager?.history ?? [], results, summary };
}

async function runTask(config: AppConfig, strategy: BenchmarkStrategy, task: BenchmarkTask, dependencies: OrchestratorDependencies): Promise<TaskResult> {
  const root = await mkdtemp(join(tmpdir(), 'classcale-benchmark-')); const started = performance.now();
  try {
    for (const [path, content] of Object.entries(task.seed)) { const target = join(root, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, content); }
    await runProcess('git', ['init', '-q'], { cwd: root }); await runProcess('git', ['add', '.'], { cwd: root }); await runProcess('git', ['-c', 'user.name=Benchmark', '-c', 'user.email=benchmark@invalid', 'commit', '-qm', 'seed'], { cwd: root });
    const orchestrator = new Orchestrator({ ...config, runsDir: join(root, '.runs'), workspace: { ...config.workspace, writeEnabled: true } }, dependencies);
    const run = await orchestrator.start(task.request, { repository: root, workspace: root, writeApproved: true });
    const files: Record<string, string> = {};
    for (const path of Object.keys(task.seed)) { try { files[path] = await readFile(join(root, path), 'utf8'); } catch { /* absent */ } }
    try { files['src/validate.js'] = await readFile(join(root, 'src/validate.js'), 'utf8'); } catch { /* optional */ }
    const publicTest = await runProcess('npm', ['test'], { cwd: root, timeoutMs: 60000 }); const hiddenPassed = publicTest.exitCode === 0 && task.hiddenAccept(files);
    return { taskId: task.id, strategy, workflowPassed: run.state === 'FINALIZE', hiddenPassed, regression: publicTest.exitCode !== 0, attempts: run.fixAttempts, durationMs: performance.now() - started, tokens: run.usage.totalTokens, modelSwitches: run.usage.modelSwitches };
  } catch (error) { return { taskId: task.id, strategy, workflowPassed: false, hiddenPassed: false, regression: true, attempts: 0, durationMs: performance.now() - started, tokens: 0, modelSwitches: 0, error: error instanceof Error ? error.message : String(error) }; }
  finally { await rm(root, { recursive: true, force: true }); }
}
function configFor(config: AppConfig, strategy: BenchmarkStrategy): AppConfig { const single = strategy === 'gpt-oss' ? 'gpt-oss' : 'qwen'; return { ...config, roles: strategy === 'collaboration' ? config.roles : { planner: single, coder: single, reviewer: single } }; }
function ratio(value: number, count: number): number { return count === 0 ? 0 : value / count; }
function average(values: number[]): number { return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length; }
