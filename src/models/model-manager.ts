import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import type { AppConfig, ModelProfile } from '../contracts.js';
import { MultiAgentError, errorMessage } from '../errors.js';
import { probeResources, type ResourceSnapshot } from './resource-probe.js';

export interface ModelMetrics { name: string; startedAt: string; loadMs: number; healthChecks: number; unexpectedExit: boolean; resourceAtStart: ResourceSnapshot }
export interface ManagedModel { name: string; endpoint: string; metrics: ModelMetrics }
export interface ModelProcess { stop(signal?: AbortSignal): Promise<void>; exited: Promise<number | null> }
export interface ModelProcessFactory { start(file: string, args: readonly string[], onOutput: (line: string) => void): ModelProcess }

class NodeProcess implements ModelProcess {
  readonly exited: Promise<number | null>;
  constructor(private readonly child: ChildProcess) { this.exited = new Promise(resolve => child.once('exit', resolve)); }
  async stop(signal?: AbortSignal): Promise<void> {
    if (this.child.exitCode !== null) return;
    this.child.kill('SIGTERM');
    await Promise.race([this.exited, new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.child.kill('SIGKILL'); resolve(); }, 5000);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    })]);
  }
}

export const nodeProcessFactory: ModelProcessFactory = { start(file, args, onOutput) {
  const child = spawn(file, [...args], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', (chunk: Buffer) => onOutput(chunk.toString('utf8')));
  child.stderr?.on('data', (chunk: Buffer) => onOutput(chunk.toString('utf8')));
  return new NodeProcess(child);
} };

export class ModelManager {
  private active: { profile: ModelProfile; process: ModelProcess | undefined; model: ManagedModel; stopping: boolean } | undefined;
  readonly history: ModelMetrics[] = [];
  constructor(private readonly config: AppConfig, private readonly factory: ModelProcessFactory = nodeProcessFactory, private readonly fetcher: typeof fetch = fetch) {}

  get current(): ManagedModel | undefined { return this.active?.model; }

  async start(name: string, signal?: AbortSignal): Promise<ManagedModel> {
    if (this.active?.model.name === name && await this.healthy(this.active.profile, signal)) return this.active.model;
    if (this.active && !this.config.resources.allowConcurrentModels) await this.stop(signal);
    const profile = this.config.models[name];
    if (!profile) throw new MultiAgentError('CONFIG', `Unknown model profile: ${name}`);
    const resourceAtStart = await probeResources();
    this.assertResources(resourceAtStart);
    const started = performance.now();
    let childProcess: ModelProcess | undefined;
    if (profile.kind === 'managed') {
      if (await portInUse(profile.port)) throw new MultiAgentError('MODEL', `Port ${profile.port} is already in use; choose another port or configure an external server`, { port: profile.port });
      const modelPath = processEnv(profile.modelPathEnv!);
      const executable = globalThis.process.env['LLAMA_SERVER_PATH'] ?? profile.executable!;
      const args = ['--model', modelPath, '--host', '127.0.0.1', '--port', String(profile.port), '--ctx-size', String(profile.contextSize), '--n-gpu-layers', String(profile.gpuLayers ?? 0), '--threads', String(profile.threads ?? 8), ...(profile.extraArgs ?? [])];
      childProcess = this.factory.start(executable, args, () => undefined);
    }
    const model: ManagedModel = { name, endpoint: profile.endpoint, metrics: { name, startedAt: new Date().toISOString(), loadMs: 0, healthChecks: 0, unexpectedExit: false, resourceAtStart } };
    this.active = { profile, process: childProcess, model, stopping: false };
    if (childProcess) void childProcess.exited.then(code => { if (this.active?.process === childProcess && !this.active.stopping) { model.metrics.unexpectedExit = true; this.active = undefined; if (code !== 0) console.error(`Model ${name} exited unexpectedly (${String(code)})`); } });
    try {
      await this.waitUntilHealthy(profile, signal);
      model.metrics.loadMs = performance.now() - started;
      this.history.push(structuredClone(model.metrics));
      return model;
    } catch (error) {
      await this.stop().catch(() => undefined);
      throw new MultiAgentError('MODEL', `Model ${name} failed to become healthy: ${errorMessage(error)}`, { name }, { cause: error });
    }
  }

  async stop(signal?: AbortSignal): Promise<void> {
    const active = this.active;
    if (!active) return;
    active.stopping = true;
    try { await active.process?.stop(signal); } finally { if (this.active === active) this.active = undefined; }
  }

  async switchTo(name: string, signal?: AbortSignal): Promise<ManagedModel> { return this.start(name, signal); }

  async healthy(profile: ModelProfile, signal?: AbortSignal): Promise<boolean> {
    if (this.active) this.active.model.metrics.healthChecks++;
    try {
      const response = await this.fetcher(`${profile.endpoint}/models`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000), redirect: 'error' });
      return response.ok;
    } catch { return false; }
  }

  private async waitUntilHealthy(profile: ModelProfile, signal?: AbortSignal): Promise<void> {
    const timeout = AbortSignal.timeout(profile.startupTimeoutMs ?? 180000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    while (!combined.aborted) {
      if (await this.healthy(profile, combined)) return;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    combined.throwIfAborted();
  }

  private assertResources(snapshot: ResourceSnapshot): void {
    if (snapshot.ram.freeMiB < this.config.resources.minimumFreeRamMiB) throw new MultiAgentError('RESOURCE', 'Insufficient free RAM for configured safety threshold', { availableMiB: snapshot.ram.freeMiB, requiredMiB: this.config.resources.minimumFreeRamMiB });
    if (snapshot.gpu && snapshot.gpu.freeMiB < this.config.resources.minimumFreeVramMiB) throw new MultiAgentError('RESOURCE', 'Insufficient free VRAM for configured safety threshold', { availableMiB: snapshot.gpu.freeMiB, requiredMiB: this.config.resources.minimumFreeVramMiB });
  }
}

function processEnv(name: string): string { const value = process.env[name]; if (!value) throw new MultiAgentError('CONFIG', `Required environment variable ${name} is not set`); return value; }
async function portInUse(port: number): Promise<boolean> { return new Promise(resolve => { const socket = createConnection({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); socket.setTimeout(500, () => { socket.destroy(); resolve(false); }); }); }
