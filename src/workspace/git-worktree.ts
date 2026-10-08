import { mkdir, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { MultiAgentError } from '../errors.js';
import { runProcess } from '../utils/process.js';

export interface Worktree { repository: string; path: string; branch: string }
export class GitWorktreeManager {
  async verify(repository: string): Promise<string> {
    const root = await realpath(repository);
    const result = await runProcess('git', ['rev-parse', '--show-toplevel'], { cwd: root, timeoutMs: 10000 });
    if (result.exitCode !== 0 || resolve(result.stdout.trim()) !== resolve(root)) throw new MultiAgentError('WORKSPACE', 'Target must be the root of a Git repository', { repository });
    return root;
  }

  async create(repository: string, runId: string, branch = `classcale/run-${runId.slice(0, 8)}`): Promise<Worktree> {
    const root = await this.verify(repository);
    const base = join(dirname(root), '.classcale-worktrees', basename(root));
    await mkdir(base, { recursive: true });
    const path = join(base, runId);
    const result = await runProcess('git', ['worktree', 'add', '-b', branch, path, 'HEAD'], { cwd: root, timeoutMs: 60000 });
    if (result.exitCode !== 0) throw new MultiAgentError('WORKSPACE', 'Unable to create isolated Git worktree', { stderr: result.stderr, branch });
    return { repository: root, path, branch };
  }

  async status(path: string): Promise<string> {
    const result = await runProcess('git', ['status', '--short'], { cwd: path, timeoutMs: 10000 });
    if (result.exitCode !== 0) throw new MultiAgentError('WORKSPACE', 'Unable to inspect worktree');
    return result.stdout;
  }

  async prepareCommit(path: string, message: string, approved: boolean): Promise<string> {
    if (!approved) throw new MultiAgentError('SECURITY', 'Commit creation requires explicit human approval');
    const add = await runProcess('git', ['add', '--all'], { cwd: path, timeoutMs: 30000 });
    if (add.exitCode !== 0) throw new MultiAgentError('WORKSPACE', 'Unable to stage changes', { stderr: add.stderr });
    const commit = await runProcess('git', ['commit', '-m', message], { cwd: path, timeoutMs: 60000 });
    if (commit.exitCode !== 0) throw new MultiAgentError('WORKSPACE', 'Unable to create commit', { stderr: commit.stderr });
    return commit.stdout.trim();
  }
}
