import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { appConfigSchema, type AppConfig } from './contracts.js';
import { MultiAgentError } from './errors.js';

export async function loadAppConfig(path = process.env['MULTI_AGENT_CONFIG'] ?? 'config/default.json'): Promise<AppConfig> {
  try {
    const raw: unknown = JSON.parse(await readFile(resolve(path), 'utf8'));
    return appConfigSchema.parse(raw);
  } catch (error) {
    throw new MultiAgentError('CONFIG', `Unable to load configuration from ${path}`, { path }, { cause: error });
  }
}
