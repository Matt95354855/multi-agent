import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GitWorktreeManager } from '../../src/workspace/git-worktree.js';
import { seedRepository } from '../helpers.js';

test('creates an isolated branch and leaves the source checkout unchanged', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'repo-')); await seedRepository(repository); const manager = new GitWorktreeManager();
  const worktree = await manager.create(repository, 'abcdef1234567890', 'test/isolated');
  assert.equal(worktree.branch, 'test/isolated'); assert.equal(await manager.status(repository), ''); assert.equal(await manager.status(worktree.path), '');
});
