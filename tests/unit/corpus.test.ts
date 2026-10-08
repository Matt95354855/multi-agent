import assert from 'node:assert/strict';
import test from 'node:test';
import { benchmarkCorpus } from '../../src/evaluation/corpus.js';

test('contains 50 reproducible tasks across required categories', () => {
  assert.equal(benchmarkCorpus.length, 50); assert.equal(new Set(benchmarkCorpus.map(task => task.id)).size, 50);
  for (const category of ['bugfix', 'refactor', 'tests', 'feature', 'multi-file', 'error-handling', 'security', 'incomplete']) assert.equal(benchmarkCorpus.some(task => task.category === category), true);
});
