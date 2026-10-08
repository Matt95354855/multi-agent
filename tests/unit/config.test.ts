import assert from 'node:assert/strict';
import test from 'node:test';
import { appConfigSchema } from '../../src/contracts.js';
import { loadAppConfig } from '../../src/config.js';

test('default configuration is valid and bounded', async () => {
  const config = await loadAppConfig('config/default.json');
  assert.equal(appConfigSchema.safeParse(config).success, true);
  assert.equal(config.limits.maxFixAttempts, 3);
  assert.equal(config.resources.allowConcurrentModels, false);
});
