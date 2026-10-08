import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadAppConfig } from '../../src/config.js';
import { Orchestrator } from '../../src/orchestrator/orchestrator.js';
import { QueueModel, seedRepository } from '../helpers.js';

test('executes PLAN -> IMPLEMENT -> REVIEW -> TEST -> FINALIZE with simulated models', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orchestrator-')); await seedRepository(root); const base = await loadAppConfig('config/default.json');
  const config = { ...base, runsDir: join(root, '.runs'), limits: { ...base.limits, maxTaskMs: 60000 }, workspace: { ...base.workspace, sandbox: { mode: 'host' as const } } };
  const planner = new QueueModel([{ summary: 'fix', tasks: [{ id: '1', description: 'fix value', files: ['src/index.js'], acceptanceCriteria: ['tests pass'] }], risks: [], testCommands: ['npm test'] }]);
  const coder = new QueueModel([{ rationale: 'fix value', changes: [{ path: 'src/index.js', content: 'export const value = 2;\n', reason: 'test expects 2' }] }]);
  const reviewer = new QueueModel([{ verdict: 'approve', summary: 'ok', findings: [] }]);
  const run = await new Orchestrator(config, { models: { planner, coder, reviewer } }).start('Fix the failing test', { repository: root, workspace: root, writeApproved: true });
  assert.equal(run.state, 'FINALIZE'); assert.equal(run.validation?.passed, true); assert.equal(run.appliedChangeHashes.length, 1);
  assert.deepEqual(run.events.map(event => event.type), ['plan.validated', 'changes.proposed', 'changes.applied', 'review.completed', 'validation.completed']);
});

test('persists checkpoints and resumes a planned run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resume-')); await seedRepository(root); const base = await loadAppConfig('config/default.json'); const config = { ...base, runsDir: join(root, '.runs'), workspace: { ...base.workspace, sandbox: { mode: 'host' as const } } };
  const models = { planner: new QueueModel([]), coder: new QueueModel([{ rationale: 'fix', changes: [{ path: 'src/index.js', content: 'export const value = 2;\n', reason: 'fix' }] }]), reviewer: new QueueModel([{ verdict: 'approve', summary: 'ok', findings: [] }]) };
  const orchestrator = new Orchestrator(config, { models }); const now = new Date().toISOString(); const runId = '12345678-1234-1234-1234-123456789abc';
  await orchestrator.store.save({ version: 1, runId, request: 'fix', repository: root, workspace: root, state: 'IMPLEMENT', startedAt: now, updatedAt: now, plan: { summary: 'fix', tasks: [{ id: '1', description: 'fix', files: ['src/index.js'], acceptanceCriteria: ['pass'] }], risks: [], testCommands: ['npm test'] }, fixAttempts: 0, appliedChangeHashes: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, modelSwitches: 0 }, events: [] });
  const run = await orchestrator.resume(runId, true); assert.equal(run.state, 'FINALIZE'); assert.equal(run.validation?.passed, true);
});

test('routes a requested change through FIX and re-reviews it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fix-loop-')); await seedRepository(root); const base = await loadAppConfig('config/default.json'); const config = { ...base, runsDir: join(root, '.runs'), workspace: { ...base.workspace, sandbox: { mode: 'host' as const } } };
  const planner = new QueueModel([{ summary: 'fix', tasks: [{ id: '1', description: 'fix', files: ['src/index.js'], acceptanceCriteria: ['pass'] }], risks: [], testCommands: ['npm test'] }]);
  const coder = new QueueModel([
    { rationale: 'first', changes: [{ path: 'src/index.js', content: 'export const value = 1;\n', reason: 'first' }] },
    { rationale: 'corrected', changes: [{ path: 'src/index.js', content: 'export const value = 2;\n', reason: 'review' }] },
  ]);
  const reviewer = new QueueModel([{ verdict: 'request_changes', summary: 'wrong value', findings: [{ severity: 'high', message: 'expected 2', required: true }] }, { verdict: 'approve', summary: 'fixed', findings: [] }]);
  const run = await new Orchestrator(config, { models: { planner, coder, reviewer } }).start('fix', { repository: root, workspace: root, writeApproved: true });
  assert.equal(run.state, 'FINALIZE'); assert.equal(run.fixAttempts, 1); assert.equal(run.events.filter(event => event.type === 'review.completed').length, 2);
});

test('stops when the correction budget is exhausted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'budget-')); await seedRepository(root); const base = await loadAppConfig('config/default.json'); const config = { ...base, runsDir: join(root, '.runs'), limits: { ...base.limits, maxFixAttempts: 0 }, workspace: { ...base.workspace, sandbox: { mode: 'host' as const } } };
  const planner = new QueueModel([{ summary: 'fix', tasks: [{ id: '1', description: 'fix', files: ['src/index.js'], acceptanceCriteria: ['pass'] }], risks: [], testCommands: ['npm test'] }]);
  const coder = new QueueModel([{ rationale: 'bad', changes: [{ path: 'src/index.js', content: 'export const value = 1;\n', reason: 'bad' }] }]);
  const reviewer = new QueueModel([{ verdict: 'request_changes', summary: 'no', findings: [{ severity: 'high', message: 'bad', required: true }] }]);
  await assert.rejects(() => new Orchestrator(config, { models: { planner, coder, reviewer } }).start('fix', { repository: root, workspace: root, writeApproved: true }), /Maximum correction attempts/);
});
