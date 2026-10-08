import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SecureWorkspace } from '../../src/workspace/workspace.js';

test('requires explicit write approval and enforces size limits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workspace-')); await writeFile(join(root, 'a.txt'), 'a');
  const workspace = await SecureWorkspace.open(root, { maxFileBytes: 8, maxPatchBytes: 1000, maxCommandOutputBytes: 1000, allowedCommands: ['npm test'], writeEnabled: false, sandbox: { mode: 'host' } });
  await assert.rejects(() => workspace.apply({ rationale: 'x', changes: [{ path: 'a.txt', content: 'b', reason: 'x' }] }), /approval/);
});
