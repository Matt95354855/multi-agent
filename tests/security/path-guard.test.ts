import assert from 'node:assert/strict';
import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PathGuard } from '../../src/security/path-guard.js';

test('blocks traversal, absolute paths, and symbolic-link escapes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guard-')); const outside = await mkdtemp(join(tmpdir(), 'outside-')); await writeFile(join(outside, 'secret'), 'secret'); await symlink(outside, join(root, 'link'));
  const guard = await PathGuard.create(root);
  await assert.rejects(() => guard.resolve('../secret'), /escapes/);
  await assert.rejects(() => guard.resolve(join(outside, 'secret')), /relative/);
  await assert.rejects(() => guard.resolve('link/secret'), /escapes|Symbolic/);
});
