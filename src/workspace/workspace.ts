import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import type { ChangeSet, Validation } from '../contracts.js';
import { MultiAgentError } from '../errors.js';
import { CommandPolicy } from '../security/command-policy.js';
import { PathGuard } from '../security/path-guard.js';
import { redactText } from '../security/redaction.js';
import { runProcess } from '../utils/process.js';

export interface WorkspaceOptions { maxFileBytes: number; maxPatchBytes: number; maxCommandOutputBytes: number; allowedCommands: string[]; writeEnabled: boolean; sandbox: { mode: 'host' } | { mode: 'docker'; image: string; memory: string; cpus: number; pidsLimit: number } }
export class SecureWorkspace {
  private constructor(readonly root: string, private readonly guard: PathGuard, private readonly options: WorkspaceOptions, private readonly policy: CommandPolicy) {}
  static async open(root: string, options: WorkspaceOptions): Promise<SecureWorkspace> { const guard = await PathGuard.create(root); return new SecureWorkspace(guard.root, guard, options, new CommandPolicy(options.allowedCommands)); }

  async read(path: string): Promise<string> {
    const target = await this.guard.resolve(path);
    const info = await stat(target);
    if (!info.isFile() || info.size > this.options.maxFileBytes) throw new MultiAgentError('WORKSPACE', `File cannot be read safely: ${path}`, { size: info.size });
    return readFile(target, 'utf8');
  }

  async apply(changes: ChangeSet): Promise<string[]> {
    if (!this.options.writeEnabled) throw new MultiAgentError('SECURITY', 'Workspace writes require explicit human approval (--approve-write)');
    const bytes = Buffer.byteLength(JSON.stringify(changes));
    if (bytes > this.options.maxPatchBytes) throw new MultiAgentError('SECURITY', 'Change set exceeds configured size limit', { bytes });
    const hashes: string[] = [];
    for (const change of changes.changes) {
      if (Buffer.byteLength(change.content) > this.options.maxFileBytes) throw new MultiAgentError('SECURITY', `File content exceeds limit: ${change.path}`);
      const target = await this.guard.resolve(change.path, true);
      await mkdir(dirname(target), { recursive: true });
      const hash = createHash('sha256').update(`${change.path}\0${change.content}`).digest('hex');
      const temp = `${target}.classcale-${hash.slice(0, 10)}.tmp`;
      await writeFile(temp, change.content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temp, target).catch(async error => { await rm(temp, { force: true }); throw error; });
      hashes.push(hash);
    }
    return hashes;
  }

  async validate(commands: readonly string[], timeoutMs: number, signal?: AbortSignal): Promise<Validation> {
    const results: Validation['commands'] = [];
    for (const command of commands) {
      const approved = this.policy.authorize(command);
      const result = this.options.sandbox.mode === 'docker'
        ? await runProcess('docker', ['run', '--rm', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', String(this.options.sandbox.pidsLimit), '--memory', this.options.sandbox.memory, '--cpus', String(this.options.sandbox.cpus), '--volume', `${this.root}:/workspace:rw`, '--workdir', '/workspace', this.options.sandbox.image, approved.file, ...approved.args], { timeoutMs, maxOutputBytes: this.options.maxCommandOutputBytes, ...(signal ? { signal } : {}), env: safeEnvironment() })
        : await runProcess(approved.file, approved.args, { cwd: this.root, timeoutMs, maxOutputBytes: this.options.maxCommandOutputBytes, ...(signal ? { signal } : {}), env: safeEnvironment() });
      results.push({ command, exitCode: result.exitCode, timedOut: result.timedOut, output: redactText(`${result.stdout}\n${result.stderr}`).slice(0, this.options.maxCommandOutputBytes), durationMs: result.durationMs });
      if (result.exitCode !== 0 || result.timedOut) break;
    }
    const failed = results.filter(result => result.exitCode !== 0 || result.timedOut);
    return { passed: failed.length === 0 && results.length === commands.length, commands: results, diagnostics: failed.map(result => `${result.command}: ${result.timedOut ? 'timed out' : `exit ${String(result.exitCode)}`}`) };
  }

  async diff(): Promise<string> {
    const result = await runProcess('git', ['diff', '--no-ext-diff', '--'], { cwd: this.root, timeoutMs: 30000, maxOutputBytes: this.options.maxCommandOutputBytes, env: safeEnvironment() });
    if (result.exitCode !== 0) throw new MultiAgentError('WORKSPACE', 'Unable to read Git diff', { stderr: result.stderr });
    return redactText(result.stdout);
  }

  relative(path: string): string { return relative(this.root, path); }
}

function safeEnvironment(): NodeJS.ProcessEnv {
  const keep = ['PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'COMSPEC', 'NODE_OPTIONS'];
  return Object.fromEntries(keep.flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
}
