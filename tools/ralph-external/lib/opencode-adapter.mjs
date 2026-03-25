/**
 * OpenCode CLI Provider Adapter for External Ralph Loop
 *
 * Provides support for OpenCode as a provider for
 * autonomous task execution in Ralph loops.
 *
 * OpenCode CLI differences from Claude:
 * - Binary: `opencode` instead of `claude`
 * - Headless mode: `opencode run` subcommand
 * - Format flag: `--format json` instead of `--output-format stream-json`
 * - No --dangerously-skip-permissions (no permission bypass needed)
 * - No --print flag (run subcommand is already non-interactive)
 * - No --append-system-prompt (inject into main prompt)
 * - No --max-budget-usd flag
 * - No --max-turns flag
 * - No --mcp-config flag
 * - Session resume via -s/--session instead of --session-id
 * - Model format: provider/model (e.g., anthropic/claude-sonnet-4-5-20250514)
 * - Agent flag: --agent
 *
 * @implements Plan: Multi-Provider Support for External Ralph Loop
 */

import { ProviderAdapter, registerProvider } from './provider-adapter.mjs';

/** Model mapping from generic names to OpenCode-specific models */
const MODEL_MAP = {
  'opus': 'anthropic/claude-opus-4-5-20251101',
  'sonnet': 'anthropic/claude-sonnet-4-5-20250929',
  'haiku': 'anthropic/claude-haiku-4-5-20251001',
};

export class OpenCodeAdapter extends ProviderAdapter {
  /** @returns {string} */
  getBinary() {
    return 'opencode';
  }

  /** @returns {string} */
  getName() {
    return 'opencode';
  }

  /**
   * OpenCode has limited capabilities compared to Claude.
   * Supports session resume, model selection, agent mode, and JSON output.
   * @returns {import('./provider-adapter.mjs').ProviderCapabilities}
   */
  getCapabilities() {
    return {
      streamJson: false,
      sessionResume: true,
      budgetControl: false,
      systemPrompt: false,
      agentMode: true,
      mcpConfig: false,
      maxTurns: false,
    };
  }

  /**
   * Build args for the main headless session.
   *
   * OpenCode uses `opencode run --format json` for headless operation.
   *
   * @param {import('./provider-adapter.mjs').SessionArgs} options
   * @returns {string[]}
   */
  buildSessionArgs(options) {
    const args = [
      'run',
      '--format', 'json',
    ];

    // Model selection (map generic to OpenCode provider/model format)
    if (options.model) {
      args.push('-m', this.mapModel(options.model));
    }

    // Session resume via -s flag
    if (options.sessionId) {
      args.push('-s', options.sessionId);
    }

    // Budget control not supported
    if (options.budget) {
      this.warnUnsupported('budgetControl', 'Budget control (--max-budget-usd)');
    }

    // Max turns not supported
    if (options.maxTurns) {
      this.warnUnsupported('maxTurns', 'Max turns (--max-turns)');
    }

    // MCP configuration not supported
    if (options.mcpConfig) {
      this.warnUnsupported('mcpConfig', 'MCP configuration (--mcp-config)');
    }

    // System prompt: OpenCode doesn't support --append-system-prompt,
    // so we prepend it to the main prompt
    let prompt = options.prompt;
    if (options.systemPrompt) {
      prompt = `[System Context]\n${options.systemPrompt}\n\n[Task]\n${prompt}`;
    }

    // The prompt itself (must be last)
    args.push(prompt);

    return args;
  }

  /**
   * Build args for short analysis calls (spawnSync).
   *
   * @param {import('./provider-adapter.mjs').AnalysisArgs} options
   * @returns {string[]}
   */
  buildAnalysisArgs(options) {
    const args = [
      'run',
      '--format', 'json',
    ];

    // Model selection
    if (options.model) {
      args.push('-m', this.mapModel(options.model));
    }

    // Agent flag supported by OpenCode
    if (options.agent) {
      args.push('--agent', options.agent);
    }

    // The analysis prompt (must be last)
    args.push(options.prompt);

    return args;
  }

  /**
   * Map generic model names to OpenCode provider/model format.
   *
   * @param {string} genericModel
   * @returns {string}
   */
  mapModel(genericModel) {
    const mapped = MODEL_MAP[genericModel.toLowerCase()];
    if (mapped) return mapped;
    // Pass through if already an OpenCode model name or unknown
    return genericModel;
  }

  /**
   * Environment overrides for headless OpenCode sessions.
   * @returns {Object<string, string>}
   */
  getEnvOverrides() {
    return {
      CI: 'true',
    };
  }

  /**
   * OpenCode does not store session transcripts in a known location.
   * @returns {null}
   */
  getTranscriptPath() {
    return null;
  }

  /**
   * Parse OpenCode output — JSON format returns structured data.
   *
   * @param {string} stdout
   * @returns {Object|null}
   */
  parseOutput(stdout) {
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

// Self-register on import
registerProvider('opencode', () => new OpenCodeAdapter());

export default OpenCodeAdapter;
