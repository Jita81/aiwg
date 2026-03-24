/**
 * Ollama API client for AIWG eval suite
 * Implements GenerationModel interface for use with AiwgEvalRunner (@matric/eval-client)
 */

import type { GenerationModel, GenerationOptions, GenerationResult } from './types.js';

const DEFAULT_URL = 'http://localhost:11434';

interface OllamaGenerateResponse {
  response: string;
  eval_count?: number;
  total_duration?: number;
  prompt_eval_duration?: number;
}

interface OllamaTagsResponse {
  models: Array<{ name: string; size: number }>;
}

export class OllamaModel implements GenerationModel {
  private baseUrl: string;

  constructor(
    public readonly name: string,
    baseUrl?: string
  ) {
    this.baseUrl = baseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_URL;
  }

  async generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model: this.name,
      prompt,
      stream: false,
    };

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.maxTokens !== undefined) body.num_predict = options.maxTokens;
    if (options?.stopSequences !== undefined) body.stop = options.stopSequences;

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Ollama generate failed: ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaGenerateResponse;
    const totalTime = Date.now() - startTime;

    return {
      text: data.response,
      tokensGenerated: data.eval_count ?? 0,
      totalTime,
      timeToFirstToken: data.prompt_eval_duration
        ? data.prompt_eval_duration / 1_000_000
        : undefined,
    };
  }

  static async listModels(baseUrl?: string): Promise<string[]> {
    const url = baseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_URL;
    const response = await fetch(`${url}/api/tags`);
    if (!response.ok) throw new Error(`Failed to list models: ${response.statusText}`);
    const data = (await response.json()) as OllamaTagsResponse;
    return data.models.map((m) => m.name);
  }
}
