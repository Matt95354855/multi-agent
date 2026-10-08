import { MultiAgentError } from '../errors.js';

export interface ApprovedCommand { display: string; file: string; args: string[] }
const SAFE_TOKEN = /^[A-Za-z0-9_./:@=-]+$/;

export class CommandPolicy {
  private readonly approved: Map<string, ApprovedCommand>;
  constructor(commands: readonly string[]) { this.approved = new Map(commands.map(command => [command, parse(command)])); }
  authorize(command: string): ApprovedCommand {
    const approved = this.approved.get(command);
    if (!approved) throw new MultiAgentError('SECURITY', `Command is not allowlisted: ${command}`, { command });
    return approved;
  }
}
function parse(command: string): ApprovedCommand {
  const tokens = command.trim().split(/\s+/);
  if (tokens.length === 0 || tokens.some(token => !SAFE_TOKEN.test(token))) throw new MultiAgentError('CONFIG', `Unsafe command in allowlist: ${command}`);
  return { display: command, file: tokens[0]!, args: tokens.slice(1) };
}
