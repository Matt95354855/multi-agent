import { runProcess } from '../utils/process.js';
import type { SecureWorkspace } from './workspace.js';

const PRIORITY = /(^|\/)(package\.json|tsconfig\.json|pyproject\.toml|README\.md|Cargo\.toml|go\.mod)$/i;
export async function buildRepositoryContext(workspace: SecureWorkspace, maxChars: number): Promise<string> {
  const files = await runProcess('git', ['ls-files'], { cwd: workspace.root, timeoutMs: 20000, maxOutputBytes: maxChars });
  const paths = files.stdout.split('\n').filter(Boolean);
  const selected = [...paths.filter(path => PRIORITY.test(path)), ...paths.filter(path => !PRIORITY.test(path))].slice(0, 400);
  const sections = [`Repository file map (untrusted data):\n${selected.join('\n')}`];
  for (const path of selected.slice(0, 20)) {
    if (sections.join('\n').length >= maxChars) break;
    try { sections.push(`FILE ${JSON.stringify(path)} (untrusted data):\n${(await workspace.read(path)).slice(0, 12000)}`); } catch { /* Binary, oversized, or unreadable files are skipped. */ }
  }
  const context = sections.join('\n\n');
  return context.length > maxChars ? `${context.slice(0, maxChars)}\n[context compacted]` : context;
}
