import { freemem, totalmem } from 'node:os';
import { runProcess } from '../utils/process.js';

export interface ResourceSnapshot { ram: { freeMiB: number; totalMiB: number }; gpu?: { freeMiB: number; totalMiB: number; name: string }; measuredAt: string }

export async function probeResources(): Promise<ResourceSnapshot> {
  const snapshot: ResourceSnapshot = { ram: { freeMiB: Math.floor(freemem() / 1048576), totalMiB: Math.floor(totalmem() / 1048576) }, measuredAt: new Date().toISOString() };
  try {
    const result = await runProcess('nvidia-smi', ['--query-gpu=name,memory.free,memory.total', '--format=csv,noheader,nounits'], { timeoutMs: 3000, maxOutputBytes: 10_000 });
    const line = result.stdout.trim().split('\n')[0];
    if (result.exitCode === 0 && line) {
      const parts = line.split(',').map(value => value.trim());
      if (parts.length >= 3) snapshot.gpu = { name: parts[0]!, freeMiB: Number(parts[1]), totalMiB: Number(parts[2]) };
    }
  } catch { /* NVIDIA tooling is optional; RAM remains an actual measurement. */ }
  return snapshot;
}
