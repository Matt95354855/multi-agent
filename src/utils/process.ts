import { spawn } from 'node:child_process';
import { MultiAgentError } from '../errors.js';

export interface ProcessResult { command: string; exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number }
export interface RunProcessOptions { cwd?: string; timeoutMs?: number; signal?: AbortSignal; maxOutputBytes?: number; env?: NodeJS.ProcessEnv }

export async function runProcess(file: string, args: readonly string[], options: RunProcessOptions = {}): Promise<ProcessResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120000);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const max = options.maxOutputBytes ?? 200_000;
  try {
    return await new Promise<ProcessResult>((resolve, reject) => {
      const child = spawn(file, [...args], { cwd: options.cwd, env: options.env, shell: false, windowsHide: true, signal });
      let stdout = ''; let stderr = ''; let size = 0;
      const collect = (chunk: Buffer, target: 'stdout' | 'stderr'): void => {
        size += chunk.byteLength;
        if (size > max) { controller.abort(); return; }
        if (target === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
      };
      child.stdout.on('data', (chunk: Buffer) => collect(chunk, 'stdout'));
      child.stderr.on('data', (chunk: Buffer) => collect(chunk, 'stderr'));
      child.once('error', error => { if (signal.aborted) return; reject(error); });
      child.once('close', code => resolve({ command: [file, ...args].join(' '), exitCode: code, stdout, stderr, timedOut: controller.signal.aborted, durationMs: performance.now() - started }));
    });
  } catch (error) {
    if (signal.aborted) return { command: [file, ...args].join(' '), exitCode: null, stdout: '', stderr: sizeError(error), timedOut: controller.signal.aborted, durationMs: performance.now() - started };
    throw new MultiAgentError('WORKSPACE', `Failed to run ${file}`, { file }, { cause: error });
  } finally { clearTimeout(timeout); }
}

function sizeError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
