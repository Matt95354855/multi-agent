import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { RunCheckpoint } from '../contracts.js';
import { MultiAgentError } from '../errors.js';
import { redact } from '../security/redaction.js';

export class RunStore {
  constructor(readonly directory: string) {}
  path(runId: string): string { if (!/^[a-f0-9-]{16,64}$/i.test(runId)) throw new MultiAgentError('CHECKPOINT', 'Invalid run identifier'); return resolve(join(this.directory, `${runId}.json`)); }
  async save(checkpoint: RunCheckpoint): Promise<void> {
    const path = this.path(checkpoint.runId); await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    checkpoint.updatedAt = new Date().toISOString();
    await writeFile(temp, JSON.stringify(redact(checkpoint), null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temp, path);
  }
  async load(runId: string): Promise<RunCheckpoint> {
    try { const value = JSON.parse(await readFile(this.path(runId), 'utf8')) as RunCheckpoint; if (value.version !== 1 || value.runId !== runId) throw new Error('Unsupported or mismatched checkpoint'); return value; }
    catch (error) { throw new MultiAgentError('CHECKPOINT', `Unable to load run ${runId}`, { runId }, { cause: error }); }
  }
}
