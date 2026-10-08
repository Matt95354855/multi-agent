import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAppConfig } from '../../src/config.js';
import { ModelManager } from '../../src/models/model-manager.js';

test('uses an already-running external server without launching a process', async () => {
  const base = await loadAppConfig('config/default.json');
  const config = { ...base, models: { local: { kind: 'external' as const, endpoint: 'http://127.0.0.1:9090/v1', port: 9090, contextSize: 2048 } }, roles: { planner: 'local', coder: 'local', reviewer: 'local' }, resources: { ...base.resources, minimumFreeRamMiB: 0 } };
  let launched = false;
  const manager = new ModelManager(config, { start() { launched = true; throw new Error('must not launch'); } }, async () => new Response('{}', { status: 200 }));
  const model = await manager.start('local');
  assert.equal(model.endpoint, 'http://127.0.0.1:9090/v1'); assert.equal(launched, false); assert.equal(model.metrics.healthChecks > 0, true);
});

test('reports a bounded startup failure and stops the managed process', async () => {
  const base = await loadAppConfig('config/default.json'); process.env['TEST_MODEL_PATH'] = '/missing/model.gguf';
  const config = { ...base, models: { local: { kind: 'managed' as const, endpoint: 'http://127.0.0.1:48123/v1', port: 48123, contextSize: 2048, executable: 'fake', modelPathEnv: 'TEST_MODEL_PATH', startupTimeoutMs: 1000 } }, roles: { planner: 'local', coder: 'local', reviewer: 'local' }, resources: { ...base.resources, minimumFreeRamMiB: 0 } };
  let stopped = false;
  const manager = new ModelManager(config, { start() { return { exited: new Promise(() => undefined), async stop() { stopped = true; } }; } }, async () => { throw new TypeError('offline'); });
  await assert.rejects(() => manager.start('local'), /failed to become healthy/); assert.equal(stopped, true); delete process.env['TEST_MODEL_PATH'];
});
