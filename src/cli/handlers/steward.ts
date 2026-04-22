/**
 * Steward Command Handler
 *
 * Provider capability awareness and command routing intelligence for the AIWG Steward.
 * Reads the canonical capability matrix and answers:
 *   - What does my current provider support natively?
 *   - What command should I use for feature X?
 *   - Which providers support feature Y?
 *
 * Subcommands:
 *   aiwg steward capabilities --provider <name>   Show capabilities for a provider
 *   aiwg steward capabilities --feature <name>    Show provider support for a feature
 *   aiwg steward capabilities --all               Full capability matrix
 *   aiwg steward find --capability <name>         Routing advice for current provider
 *
 * @source @src/cli/router.ts
 * @issue #599
 */

import path from 'path';
import { fileURLToPath } from 'url';
import type { CommandHandler, HandlerContext, HandlerResult } from './types.js';
import { AiwgError, EXIT_CODES, handlerResultFromError } from '../errors.js';

const _scriptDir = path.dirname(fileURLToPath(import.meta.url));
const AIWG_ROOT = process.env.AIWG_ROOT || path.resolve(_scriptDir, '../../../');

const MATRIX_PATH = path.join(
  AIWG_ROOT,
  'agentic/code/providers/capability-matrix.yaml'
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface CapabilityEntry {
  native: boolean;
  native_tool: string | null;
  aiwg_command: string | null;
  routing: string;
  notes?: string;
}

interface ProviderEntry {
  display_name: string;
  capabilities: Record<string, CapabilityEntry>;
}

interface FeatureEntry {
  description: string;
  aiwg_fallback: string;
  related_issues?: string[];
}

interface CapabilityMatrix {
  version: string;
  updated: string;
  baseline: string;
  features: Record<string, FeatureEntry>;
  providers: Record<string, ProviderEntry>;
}

// ── YAML loader (no external deps) ────────────────────────────────────────────

/**
 * Minimal YAML parser sufficient for the flat capability-matrix.yaml structure.
 * Delegates to js-yaml if available, falls back to manual parsing for the known shape.
 */
async function loadMatrix(): Promise<CapabilityMatrix> {
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(MATRIX_PATH, 'utf-8');

  const yaml = await import('js-yaml').catch(() => null);
  if (yaml) {
    return yaml.load(raw) as CapabilityMatrix;
  }

  throw new AiwgError({
    code: 'ERR_DEPS_MISSING',
    message: 'Cannot parse capability-matrix.yaml: js-yaml not available',
    hint: 'Reinstall: npm install -g aiwg@latest',
    exitCode: EXIT_CODES.GENERAL,
  });
}

// ── Detect current provider ────────────────────────────────────────────────────

function detectProvider(): string | null {
  if (process.env.CLAUDE_CODE_VERSION || process.env.ANTHROPIC_API_KEY) return 'claude-code';
  if (process.env.OPENAI_API_KEY && !process.env.CURSOR_TRACE_ID) return 'codex';
  if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_VERSION) return 'cursor';
  if (process.env.WINDSURF_VERSION) return 'windsurf';
  if (process.env.WARP_SESSION_ID || process.env.WARP_TERMINAL) return 'warp';
  if (process.env.COPILOT_AGENT || process.env.GITHUB_COPILOT_TOKEN) return 'copilot';
  if (process.env.OPENCLAW_VERSION) return 'openclaw';
  if (process.env.FACTORY_AGENT_ID) return 'factory';
  if (process.env.OPENCODE_VERSION) return 'opencode';
  return null;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const NATIVE_MARK = '✓ native';
const EMULATED_MARK = '~ emulated';

function formatProvider(id: string, provider: ProviderEntry, features: Record<string, FeatureEntry>): string {
  const lines: string[] = [];
  lines.push(`\n  Provider: ${provider.display_name} (${id})`);
  lines.push(`  ${'─'.repeat(50)}`);

  for (const [featureId, cap] of Object.entries(provider.capabilities)) {
    const feat = features[featureId];
    const status = cap.native ? NATIVE_MARK : EMULATED_MARK;
    const tool = cap.native ? `  tool: ${cap.native_tool}` : `  fallback: ${cap.aiwg_command ?? 'n/a'}`;
    lines.push(`\n  ${featureId} — ${status}`);
    if (feat) lines.push(`    ${feat.description}`);
    lines.push(`    ${tool}`);
    lines.push(`    route: ${cap.routing.replace(/\s+/g, ' ').trim()}`);
    if (cap.notes) lines.push(`    note: ${cap.notes}`);
  }
  return lines.join('\n');
}

function printFullMatrix(matrix: CapabilityMatrix): void {
  const { providers, features } = matrix;
  const providerIds = Object.keys(providers);
  const featureIds = Object.keys(features);

  console.log(`\n  Provider Capability Matrix (v${matrix.version}, updated ${matrix.updated})`);
  console.log(`  Baseline: ${matrix.baseline}`);
  console.log(`  ✓ = native   ~ = AIWG emulation   - = not supported\n`);

  // Header
  const featureColW = 18;
  const provColW = 16;
  const header = '  ' + 'Feature'.padEnd(featureColW) + providerIds.map(p => p.padEnd(provColW)).join('');
  console.log(header);
  console.log('  ' + '─'.repeat(featureColW + providerIds.length * provColW));

  for (const featureId of featureIds) {
    const feat = features[featureId];
    let row = '  ' + featureId.padEnd(featureColW);
    for (const providerId of providerIds) {
      const cap = providers[providerId]?.capabilities[featureId];
      const mark = !cap ? '-' : cap.native ? '✓' : '~';
      row += mark.padEnd(provColW);
    }
    console.log(row);
    console.log('  ' + ' '.repeat(featureColW) + feat.description);
    console.log('');
  }
}

// ── Main execution ─────────────────────────────────────────────────────────────

async function handleSteward(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === 'help') {
    console.log(`
  aiwg steward — Provider capability awareness and command routing

  Usage:
    aiwg steward capabilities --provider <name>   Capabilities for a specific provider
    aiwg steward capabilities --feature <name>    Provider support matrix for a feature
    aiwg steward capabilities --all               Full matrix (all providers x features)
    aiwg steward find --capability <name>         Routing advice for your current provider

  Providers:
    claude-code, codex, copilot, cursor, factory, opencode, warp, windsurf, openclaw

  Features:
    scheduler, agent-teams, mission-control, behaviors, mcp
`);
    return;
  }

  const matrix = await loadMatrix();

  if (subcommand === 'capabilities') {
    const providerFlag = args.indexOf('--provider');
    const featureFlag = args.indexOf('--feature');
    const allFlag = args.includes('--all');

    if (allFlag) {
      printFullMatrix(matrix);
      return;
    }

    if (providerFlag >= 0) {
      const providerId = args[providerFlag + 1];
      if (!providerId) throw new AiwgError({
        code: 'ERR_USAGE_MISSING_VALUE',
        message: '--provider requires a provider name',
        hint: 'Example: aiwg steward capabilities --provider claude',
        exitCode: EXIT_CODES.USAGE,
      });
      const provider = matrix.providers[providerId];
      if (!provider) {
        const known = Object.keys(matrix.providers).join(', ');
        throw new AiwgError({
          code: 'ERR_USAGE_UNKNOWN_PROVIDER',
          message: `Unknown provider: ${providerId}`,
          hint: `Known providers: ${known}`,
          exitCode: EXIT_CODES.USAGE,
        });
      }
      console.log(formatProvider(providerId, provider, matrix.features));
      return;
    }

    if (featureFlag >= 0) {
      const featureId = args[featureFlag + 1];
      if (!featureId) throw new AiwgError({
        code: 'ERR_USAGE_MISSING_VALUE',
        message: '--feature requires a feature name',
        hint: "Example: aiwg steward capabilities --feature cron",
        exitCode: EXIT_CODES.USAGE,
      });
      const feat = matrix.features[featureId];
      if (!feat) {
        const known = Object.keys(matrix.features).join(', ');
        throw new AiwgError({
          code: 'ERR_USAGE_UNKNOWN_FEATURE',
          message: `Unknown feature: ${featureId}`,
          hint: `Known features: ${known}`,
          exitCode: EXIT_CODES.USAGE,
        });
      }

      console.log(`\n  Feature: ${featureId}`);
      console.log(`  ${feat.description}`);
      if (feat.related_issues?.length) {
        console.log(`  Related: ${feat.related_issues.join(', ')}`);
      }
      console.log(`  AIWG fallback: ${feat.aiwg_fallback}`);
      console.log(`\n  Provider support:\n`);

      for (const [, provider] of Object.entries(matrix.providers)) {
        const cap = provider.capabilities[featureId];
        if (!cap) continue;
        const status = cap.native ? `✓ native (${cap.native_tool})` : `~ emulated (${cap.aiwg_command})`;
        console.log(`    ${provider.display_name.padEnd(20)} ${status}`);
        console.log(`      ${cap.routing.replace(/\s+/g, ' ').trim()}`);
        if (cap.notes) console.log(`      note: ${cap.notes}`);
        console.log('');
      }
      return;
    }

    // No flag — show current provider
    const detected = detectProvider();
    if (!detected) {
      console.log(`  Could not detect active provider. Specify with --provider <name>.`);
      console.log(`  Run 'aiwg runtime-info' to verify provider detection.`);
      return;
    }
    const provider = matrix.providers[detected];
    if (!provider) {
      console.log(`  Detected provider ${detected} not found in capability matrix.`);
      return;
    }
    console.log(`  (Detected provider: ${detected})`);
    console.log(formatProvider(detected, provider, matrix.features));
    return;
  }

  if (subcommand === 'find') {
    const capFlag = args.indexOf('--capability');
    if (capFlag < 0) throw new AiwgError({
      code: 'ERR_USAGE_MISSING_FLAG',
      message: "'aiwg steward find' requires --capability <name>",
      hint: 'Example: aiwg steward find --capability cron',
      exitCode: EXIT_CODES.USAGE,
    });

    const capabilityId = args[capFlag + 1];
    if (!capabilityId) throw new AiwgError({
      code: 'ERR_USAGE_MISSING_VALUE',
      message: '--capability requires a feature name',
      hint: 'Example: aiwg steward find --capability cron',
      exitCode: EXIT_CODES.USAGE,
    });

    const feat = matrix.features[capabilityId];
    if (!feat) {
      const known = Object.keys(matrix.features).join(', ');
      throw new AiwgError({
        code: 'ERR_USAGE_UNKNOWN_CAPABILITY',
        message: `Unknown capability: ${capabilityId}`,
        hint: `Known capabilities: ${known}`,
        exitCode: EXIT_CODES.USAGE,
      });
    }

    const detected = detectProvider() ?? matrix.baseline;
    const provider = matrix.providers[detected];
    const cap = provider?.capabilities[capabilityId];

    console.log(`\n  Routing advice for: ${capabilityId}`);
    console.log(`  Provider: ${provider?.display_name ?? detected}`);
    console.log('');

    if (!cap) {
      console.log(`  No capability data for ${capabilityId} on ${detected}.`);
      console.log(`  Fallback: ${feat.aiwg_fallback}`);
      return;
    }

    if (cap.native) {
      console.log(`  ✓ Native support available`);
      console.log(`  Tool:    ${cap.native_tool}`);
    } else {
      console.log(`  ~ Use AIWG emulation`);
      console.log(`  Command: ${cap.aiwg_command ?? feat.aiwg_fallback}`);
    }
    console.log(`\n  ${cap.routing.replace(/\s+/g, ' ').trim()}`);
    if (cap.notes) console.log(`\n  Note: ${cap.notes}`);
    return;
  }

  throw new AiwgError({
    code: 'ERR_USAGE_UNKNOWN_SUBCOMMAND',
    message: `Unknown steward subcommand: ${subcommand}`,
    hint: "Run 'aiwg steward --help' for usage",
    exitCode: EXIT_CODES.USAGE,
  });
}

// ── Handler export ────────────────────────────────────────────────────────────

export const stewardHandler: CommandHandler = {
  id: 'steward',
  name: 'Steward',
  description: 'Provider capability awareness and command routing (capabilities, find)',
  category: 'maintenance',
  aliases: [],

  async execute(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      await handleSteward(ctx.args);
      return { exitCode: 0 };
    } catch (error) {
      // Preserve AiwgError.exitCode (USAGE=2, etc.) through the catch.
      return handlerResultFromError(error);
    }
  },
};

export const stewardHandlers: CommandHandler[] = [stewardHandler];
