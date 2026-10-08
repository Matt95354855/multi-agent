import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadAppConfig } from '../../src/config.js';
import { runBenchmark } from '../../src/evaluation/benchmark.js';
import { benchmarkCorpus } from '../../src/evaluation/corpus.js';
import { QueueModel } from '../helpers.js';

test('runs a simulated benchmark and labels its measurements', async () => {
  const base = await loadAppConfig('config/default.json'); const config = { ...base, runsDir: await mkdtemp(join(tmpdir(), 'benchmark-runs-')), workspace: { ...base.workspace, sandbox: { mode: 'host' as const } } };
  const planner = new QueueModel([{ summary: 'tax', tasks: [{ id: '1', description: 'fix', files: ['src/index.js'], acceptanceCriteria: ['tests pass'] }], risks: [], testCommands: ['npm test'] }]);
  const coder = new QueueModel([{ rationale: 'correct formula', changes: [{ path: 'src/index.js', content: 'export const addTax=(price,rate)=>price+price*rate/100;\n', reason: 'fix' }] }]);
  const reviewer = new QueueModel([{ verdict: 'approve', summary: 'ok', findings: [] }]);
  const report = await runBenchmark(config, ['collaboration'], { models: { planner, coder, reviewer } }, benchmarkCorpus.slice(0, 1));
  assert.equal(report.simulated, true); assert.equal(report.taskCount, 1); assert.equal(report.results[0]?.hiddenPassed, true); assert.equal(report.summary['collaboration']?.successRate, 1);
});
