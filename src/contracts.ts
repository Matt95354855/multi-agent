import { z } from 'zod';

export const modelProfileSchema = z.object({
  kind: z.enum(['managed', 'external']), endpoint: z.string().url(), port: z.number().int().min(1).max(65535), contextSize: z.number().int().min(512).max(131072),
  executable: z.string().min(1).optional(), modelPathEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/).optional(), gpuLayers: z.number().int().min(0).max(200).optional(),
  threads: z.number().int().min(1).max(256).optional(), extraArgs: z.array(z.string()).max(32).optional(), startupTimeoutMs: z.number().int().min(1000).max(600000).optional(),
}).superRefine((value, context) => {
  if (value.kind === 'managed' && (!value.executable || !value.modelPathEnv)) context.addIssue({ code: 'custom', message: 'Managed models require executable and modelPathEnv' });
});
export type ModelProfile = z.infer<typeof modelProfileSchema>;

export const appConfigSchema = z.object({
  models: z.record(z.string().min(1), modelProfileSchema),
  roles: z.object({ planner: z.string(), coder: z.string(), reviewer: z.string() }),
  limits: z.object({ maxFixAttempts: z.number().int().min(0).max(10), maxTaskMs: z.number().int().min(1000), maxOutputTokens: z.number().int().min(128), maxContextChars: z.number().int().min(1000), maxFileBytes: z.number().int().min(1024), maxPatchBytes: z.number().int().min(1024), maxCommandOutputBytes: z.number().int().min(1024) }),
  resources: z.object({ minimumFreeVramMiB: z.number().nonnegative(), minimumFreeRamMiB: z.number().nonnegative(), allowConcurrentModels: z.boolean() }),
  workspace: z.object({ allowedCommands: z.array(z.string().min(1)).min(1), writeEnabled: z.boolean() }),
  runsDir: z.string().min(1),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

export const planSchema = z.object({ summary: z.string().min(1), tasks: z.array(z.object({ id: z.string().min(1), description: z.string().min(1), files: z.array(z.string()), acceptanceCriteria: z.array(z.string()).min(1) })).min(1), risks: z.array(z.string()), testCommands: z.array(z.string()).min(1) });
export type Plan = z.infer<typeof planSchema>;
export const changeSetSchema = z.object({ rationale: z.string().min(1), changes: z.array(z.object({ path: z.string().min(1), content: z.string(), reason: z.string().min(1) })).min(1) });
export type ChangeSet = z.infer<typeof changeSetSchema>;
export const reviewSchema = z.object({ verdict: z.enum(['approve', 'request_changes']), summary: z.string().min(1), findings: z.array(z.object({ severity: z.enum(['low', 'medium', 'high', 'critical']), file: z.string().optional(), message: z.string().min(1), required: z.boolean() })) });
export type Review = z.infer<typeof reviewSchema>;
export const validationSchema = z.object({ passed: z.boolean(), commands: z.array(z.object({ command: z.string(), exitCode: z.number().int().nullable(), timedOut: z.boolean(), output: z.string(), durationMs: z.number().nonnegative() })), diagnostics: z.array(z.string()) });
export type Validation = z.infer<typeof validationSchema>;

export type WorkflowState = 'PLAN' | 'IMPLEMENT' | 'REVIEW' | 'TEST' | 'FIX' | 'FINALIZE' | 'FAILED';
export const workflowStateSchema = z.enum(['PLAN', 'IMPLEMENT', 'REVIEW', 'TEST', 'FIX', 'FINALIZE', 'FAILED']);
export interface UsageTotals { promptTokens: number; completionTokens: number; totalTokens: number; modelSwitches: number }
export interface RunEvent { timestamp: string; state: WorkflowState; type: string; data: Record<string, unknown> }
export interface RunCheckpoint {
  version: 1; runId: string; request: string; repository: string; workspace: string; branch?: string; state: WorkflowState; startedAt: string; updatedAt: string;
  plan?: Plan; changeSet?: ChangeSet; review?: Review; validation?: Validation; fixAttempts: number; appliedChangeHashes: string[]; usage: UsageTotals; events: RunEvent[]; error?: string;
}
