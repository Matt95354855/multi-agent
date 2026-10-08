export type ErrorCode = 'CONFIG' | 'MODEL' | 'RESOURCE' | 'WORKSPACE' | 'SECURITY' | 'VALIDATION' | 'BUDGET' | 'CHECKPOINT';

export class MultiAgentError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly details: Readonly<Record<string, unknown>> = {}, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MultiAgentError';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
