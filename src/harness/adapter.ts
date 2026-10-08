import { Agent, LLMClient, type AgentConfig, type LanguageModel, type LLMResponse } from '@matt95354855/agent-harness';
import type { AppConfig } from '../contracts.js';
import { MultiAgentError } from '../errors.js';
import type { ModelManager } from '../models/model-manager.js';

export const HARNESS_COMMIT = '70388c956cbed66927bfc8c54e539b20b898fed5';

export interface CompletionMetrics { model: string; latencyMs: number; promptTokens: number; completionTokens: number; totalTokens: number; tokensPerSecond?: number }
export class HarnessAdapter {
  private lastModel?: string;
  readonly metrics: CompletionMetrics[] = [];
  constructor(private readonly config: AppConfig, private readonly manager?: ModelManager, private readonly apiKey = process.env['LLM_API_KEY']) {}

  async model(name: string, signal?: AbortSignal): Promise<LanguageModel> {
    const profile = this.config.models[name];
    if (!profile) throw new MultiAgentError('CONFIG', `Role references unknown model ${name}`);
    if (this.manager) await this.manager.switchTo(name, signal);
    this.lastModel = name;
    const client = new LLMClient({ endpoint: profile.endpoint, model: 'harness-local', ...(this.apiKey ? { apiKey: this.apiKey } : {}), timeoutMs: 180000, maxRetries: 1 });
    return { complete: async request => this.measure(name, () => client.complete(request)) };
  }

  async agent(name: string, rolePrompt: string, overrides: Partial<AgentConfig> = {}, signal?: AbortSignal): Promise<Agent> {
    const llm = await this.model(name, signal);
    return new Agent({ name: `classcale-${name}`, model: 'harness-local', systemPrompt: rolePrompt, maxIterations: 4, maxToolCalls: 8, maxTokens: this.config.limits.maxOutputTokens, runTimeoutMs: this.config.limits.maxTaskMs, ...overrides }, { llm });
  }

  get modelSwitches(): number { return new Set(this.metrics.map(metric => metric.model)).size > 1 ? this.metrics.reduce((count, metric, index, all) => count + (index > 0 && all[index - 1]?.model !== metric.model ? 1 : 0), 0) : 0; }

  private async measure(name: string, complete: () => Promise<LLMResponse>): Promise<LLMResponse> {
    const started = performance.now(); const response = await complete(); const latencyMs = performance.now() - started;
    this.metrics.push({ model: name, latencyMs, promptTokens: response.usage.promptTokens, completionTokens: response.usage.completionTokens, totalTokens: response.usage.totalTokens, ...(response.usage.completionTokens > 0 ? { tokensPerSecond: response.usage.completionTokens / (latencyMs / 1000) } : {}) });
    return response;
  }
}
