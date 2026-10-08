import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { MultiAgentError } from '../errors.js';

export class PathGuard {
  private constructor(readonly root: string) {}
  static async create(root: string): Promise<PathGuard> { return new PathGuard(await realpath(root)); }

  async resolve(relativePath: string, forWrite = false): Promise<string> {
    if (!relativePath || isAbsolute(relativePath) || relativePath.includes('\0')) throw new MultiAgentError('SECURITY', 'Path must be non-empty and relative', { path: relativePath });
    const candidate = resolve(this.root, relativePath);
    this.assertInside(candidate);
    let current = candidate;
    if (forWrite) {
      for (;;) { try { await lstat(current); break; } catch { const parent = dirname(current); if (parent === current) throw new MultiAgentError('SECURITY', 'No existing parent for path', { path: relativePath }); current = parent; } }
    }
    try {
      const resolved = await realpath(current);
      this.assertInside(resolved);
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new MultiAgentError('SECURITY', 'Symbolic links are not permitted for workspace operations', { path: relativePath });
    } catch (error) {
      if (!forWrite || error instanceof MultiAgentError) throw error;
    }
    return candidate;
  }

  private assertInside(path: string): void { const rel = relative(this.root, path); if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new MultiAgentError('SECURITY', 'Path escapes the workspace', { path }); }
}
