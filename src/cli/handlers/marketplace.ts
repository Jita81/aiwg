/**
 * Marketplace Command Handler
 *
 * Implements `aiwg marketplace <subcommand>` for discovering and listing
 * packages across all configured marketplace sources (local, ClawHub,
 * OpenClaw, etc.).
 *
 * Subcommands:
 *   search <query>    Fan-out search to all adapters, display with source attribution
 *   list              List installed marketplace packages
 *
 * Flags:
 *   --source <id>     Limit to a single adapter (e.g. clawhub, openclaw, local)
 *   --json            Emit structured JSON for programmatic use
 *
 * @implements #805
 */

import type { CommandHandler, HandlerContext, HandlerResult } from './types.js';
import { searchSkills } from '../../skills/registry.js';
import { listInstalledPackages } from '../../packages/registry.js';
import * as ui from '../ui.js';

// ── Usage string ───────────────────────────────────────────────────────────

const USAGE = [
  'Usage:',
  '  aiwg marketplace search <query>          Search across all marketplace sources',
  '  aiwg marketplace list                    List installed marketplace packages',
  '',
  'Flags:',
  '  --source <id>    Limit search to a specific source (clawhub, openclaw, local)',
  '  --json           Output structured JSON',
  '',
  'Examples:',
  '  aiwg marketplace search parallel-dispatch',
  '  aiwg marketplace search auth --source clawhub',
  '  aiwg marketplace search auth --json',
  '  aiwg marketplace list',
  '  aiwg marketplace list --json',
].join('\n');

// ── Flag helpers ───────────────────────────────────────────────────────────

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

// ── Handler ────────────────────────────────────────────────────────────────

export const marketplaceHandler: CommandHandler = {
  id: 'marketplace',
  name: 'Marketplace',
  description: 'Search and manage marketplace packages (search, list)',
  category: 'framework',
  aliases: ['market'],

  async execute(ctx: HandlerContext): Promise<HandlerResult> {
    const subcommand = ctx.args[0];

    if (!subcommand) {
      return { exitCode: 0, message: USAGE };
    }

    if (subcommand === 'search') {
      return handleSearch(ctx);
    }

    if (subcommand === 'list') {
      return handleList(ctx);
    }

    return {
      exitCode: 1,
      message: `Error: Unknown subcommand '${subcommand}'\n\n${USAGE}`,
    };
  },
};

// ── Search ─────────────────────────────────────────────────────────────────

async function handleSearch(ctx: HandlerContext): Promise<HandlerResult> {
  // First positional arg after 'search' that isn't a flag value
  const query = ctx.args[1];

  if (!query || query.startsWith('--')) {
    return {
      exitCode: 1,
      message: 'Error: Query required\n\nUsage: aiwg marketplace search <query>',
    };
  }

  const source = parseFlag(ctx.args, '--source');
  const jsonMode = hasFlag(ctx.args, '--json');

  const results = await searchSkills(query, source);

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return { exitCode: 0 };
  }

  ui.blank();
  console.log(`  ${ui.brandMark()} ${ui.bold(`Marketplace Search: "${query}"`)}`);
  if (source) {
    ui.dim(`  Source: ${source}`);
  }
  ui.rule();

  if (results.length === 0) {
    ui.dim('  No results found.');
    ui.blank();
    ui.dim('  Try a broader query or a different source.');
    ui.blank();
    return { exitCode: 0 };
  }

  // Column widths
  const nameWidth = Math.max(12, ...results.map((r) => r.name.length));
  const sourceWidth = Math.max(8, ...results.map((r) => r.source.length));
  const pkgWidth = Math.max(10, ...results.map((r) => (r.package ?? '').length));

  const header = [
    'Name'.padEnd(nameWidth),
    'Source'.padEnd(sourceWidth),
    'Package'.padEnd(pkgWidth),
    'Description',
  ].join('  ');

  ui.dim(`  ${header}`);
  ui.dim(`  ${'─'.repeat(header.length)}`);

  for (const r of results) {
    const row = [
      r.name.padEnd(nameWidth),
      r.source.padEnd(sourceWidth),
      (r.package ?? '').padEnd(pkgWidth),
      r.description.length > 60 ? r.description.slice(0, 57) + '...' : r.description,
    ].join('  ');
    console.log(`  ${row}`);
  }

  ui.blank();
  ui.dim(`  ${results.length} result${results.length !== 1 ? 's' : ''}`);
  ui.blank();

  return { exitCode: 0 };
}

// ── List ───────────────────────────────────────────────────────────────────

async function handleList(ctx: HandlerContext): Promise<HandlerResult> {
  const jsonMode = hasFlag(ctx.args, '--json');

  const packages = await listInstalledPackages();

  if (jsonMode) {
    console.log(JSON.stringify(packages, null, 2));
    return { exitCode: 0 };
  }

  ui.blank();
  console.log(`  ${ui.brandMark()} ${ui.bold('Installed Marketplace Packages')}`);
  ui.rule();

  if (packages.length === 0) {
    ui.dim('  No packages installed.');
    ui.blank();
    ui.dim('  Install a package: aiwg install owner/name');
    ui.blank();
    return { exitCode: 0 };
  }

  const keyWidth = Math.max(12, ...packages.map((p) => p.key.length));
  const versionWidth = Math.max(7, ...packages.map((p) => p.version.length));

  const header = [
    'Package'.padEnd(keyWidth),
    'Version'.padEnd(versionWidth),
    'Type',
  ].join('  ');

  ui.dim(`  ${header}`);
  ui.dim(`  ${'─'.repeat(header.length)}`);

  for (const pkg of packages) {
    const row = [
      pkg.key.padEnd(keyWidth),
      pkg.version.padEnd(versionWidth),
      pkg.type,
    ].join('  ');
    console.log(`  ${row}`);
  }

  ui.blank();
  ui.dim(`  ${packages.length} package${packages.length !== 1 ? 's' : ''} installed`);
  ui.blank();

  return { exitCode: 0 };
}
