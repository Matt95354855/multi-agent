import assert from 'node:assert/strict';
import test from 'node:test';
import { CommandPolicy } from '../../src/security/command-policy.js';

test('allows only exact configured commands without shell parsing', () => {
  const policy = new CommandPolicy(['npm test']);
  assert.deepEqual(policy.authorize('npm test'), { display: 'npm test', file: 'npm', args: ['test'] });
  assert.throws(() => policy.authorize('npm test && echo stolen'), /not allowlisted/);
});
test('rejects shell syntax inside configuration', () => assert.throws(() => new CommandPolicy(['npm test; whoami']), /Unsafe command/));
