#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadAppConfig } from '../config.js';
import { runBenchmark, type BenchmarkStrategy } from '../evaluation/benchmark.js';
import { HARNESS_COMMIT } from '../harness/adapter.js';
import { ModelManager } from '../models/model-manager.js';
import { probeResources } from '../models/resource-probe.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { runProcess } from '../utils/process.js';
import { GitWorktreeManager } from '../workspace/git-worktree.js';

async function main(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0] ?? 'help'; const config = await loadAppConfig(value(argv, '--config'));
  if (command === 'doctor') return doctor();
  if (command === 'run') {
    const repository = required(argv, '--repo'); const request = required(argv, '--request'); const approved = argv.includes('--approve-write');
    if (!approved) throw new Error('run requires --approve-write because it creates a branch and edits an isolated worktree');
    const manager = new GitWorktreeManager(); const runId = crypto.randomUUID(); const worktree = await manager.create(repository, runId, value(argv, '--branch'));
    const models = new ModelManager(config); const orchestrator = new Orchestrator(config, { manager: models });
    try { const result = await orchestrator.start(request, { repository, workspace: worktree.path, branch: worktree.branch, writeApproved: approved }); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); }
    finally { await models.stop(); }
    return;
  }
  if (command === 'resume') {
    const runId = required(argv, '--run-id'); const approved = argv.includes('--approve-write'); const models = new ModelManager(config); const orchestrator = new Orchestrator(config, { manager: models });
    try { process.stdout.write(`${JSON.stringify(await orchestrator.resume(runId, approved), null, 2)}\n`); } finally { await models.stop(); }
    return;
  }
  if (command === 'benchmark') {
    const strategies = (value(argv, '--strategies') ?? 'gpt-oss,qwen,collaboration').split(',') as BenchmarkStrategy[];
    const limit = Number(value(argv, '--limit') ?? '50'); const output = resolve(value(argv, '--output') ?? `benchmark-results/report-${Date.now()}.json`);
    const models = new ModelManager(config);
    try {
      const report = await runBenchmark(config, strategies, { manager: models }, (await import('../evaluation/corpus.js')).benchmarkCorpus.slice(0, limit));
      await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2)); process.stdout.write(`${output}\n`);
    } finally { await models.stop(); }
    return;
  }
  if (command === 'publish') {
    if (!argv.includes('--approve-external')) throw new Error('publish requires --approve-external; it pushes a branch and opens a pull request but never merges it');
    const workspace = required(argv, '--workspace'); const branch = required(argv, '--branch'); const title = required(argv, '--title');
    await checked('git', ['push', '-u', 'origin', branch], workspace);
    const result = await checked('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body', value(argv, '--body') ?? 'Created by Classcale Multi-Agent. Human review and merge are required.'], workspace);
    process.stdout.write(result.stdout); return;
  }
  process.stdout.write('Classcale Multi-Agent\n\nCommands:\n  doctor [--config path]\n  run --repo path --request text --approve-write [--branch name]\n  resume --run-id id --approve-write\n  benchmark [--strategies gpt-oss,qwen,collaboration] [--limit 50] [--output file]\n  publish --workspace path --branch name --title text --approve-external\n');
}

async function doctor(): Promise<void> {
  const [resources, node, git, harness] = await Promise.all([probeResources(), runProcess(process.execPath, ['--version']), runProcess('git', ['--version']), runProcess('git', ['rev-parse', 'HEAD'], { cwd: 'vendor/harness' })]);
  const checks = { node: node.stdout.trim(), git: git.stdout.trim(), harnessExpected: HARNESS_COMMIT, harnessActual: harness.stdout.trim(), harnessPinned: harness.stdout.trim() === HARNESS_COMMIT, resources };
  process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`); if (!checks.harnessPinned) process.exitCode = 1;
}
function value(argv: string[], key: string): string | undefined { const index = argv.indexOf(key); return index >= 0 ? argv[index + 1] : undefined; }
function required(argv: string[], key: string): string { const found = value(argv, key); if (!found) throw new Error(`Missing required option ${key}`); return found; }
async function checked(file: string, args: string[], cwd: string) { const result = await runProcess(file, args, { cwd, timeoutMs: 120000 }); if (result.exitCode !== 0) throw new Error(`${file} failed: ${result.stderr}`); return result; }

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
