import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LanguageModel, LLMRequest, LLMResponse } from '@matt95354855/agent-harness';
import { runProcess } from '../src/utils/process.js';

export class QueueModel implements LanguageModel {
  constructor(private readonly values: unknown[]) {}
  async complete(_request: LLMRequest): Promise<LLMResponse> { const value = this.values.shift(); if (value === undefined) throw new Error('No scripted response'); return { content: JSON.stringify(value), model: 'mock', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 } }; }
}
export async function seedRepository(root: string): Promise<void> {
  await mkdir(join(root, 'src'), { recursive: true }); await mkdir(join(root, 'test'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node --test' } }));
  await writeFile(join(root, 'src/index.js'), 'export const value = 1;\n');
  await writeFile(join(root, 'test/index.test.js'), "import test from 'node:test';import assert from 'node:assert/strict';import {value} from '../src/index.js';test('value',()=>assert.equal(value,2));\n");
  await runProcess('git', ['init', '-q'], { cwd: root }); await runProcess('git', ['add', '.'], { cwd: root }); await runProcess('git', ['-c', 'user.name=Test', '-c', 'user.email=test@invalid', 'commit', '-qm', 'seed'], { cwd: root });
}
