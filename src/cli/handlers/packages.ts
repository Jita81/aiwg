/**
 * Packages Command Handler
 *
 * Implements `aiwg packages <subcommand>` for managing installed remote packages.
 *
 * Subcommands:
 *   list              Show all installed packages
 *   info <key>        Show details for a specific package
 *   remove <key>      Remove a package from the registry
 *
 * @implements #557
 */

import { existsSync } from 'fs';
import type { CommandHandler, HandlerContext, HandlerResult } from './types.js';
import { listInstalledPackages, uninstallPackage } from '../../packages/registry.js';
import { getPackageEntry } from '../../packages/package-registry.js';
import * as ui from '../ui.js';

const USAGE = [
  'Usage:',
  '  aiwg packages list              Show all installed packages',
  '  aiwg packages info <key>        Show details for a package',
  '  aiwg packages remove <key>      Remove a package from the registry',
  '',
  'Examples:',
  '  aiwg packages list',
  '  aiwg packages info roko/ring-methodology',
  '  aiwg packages remove roko/ring-methodology',
].join('\n');

export const packagesHandler: CommandHandler = {
  id: 'packages',
  name: 'Packages',
  description: 'Manage installed remote packages (list, info, remove)',
  category: 'framework',
  aliases: ['pkg'],

  async execute(ctx: HandlerContext): Promise<HandlerResult> {
    const subcommand = ctx.args[0];

    if (!subcommand || subcommand === 'list') {
      return handleList(ctx);
    }

    if (subcommand === 'info') {
      return handleInfo(ctx);
    }

    if (subcommand === 'remove' || subcommand === 'uninstall') {
      return handleRemove(ctx);
    }

    return {
      exitCode: 1,
      message: `Error: Unknown subcommand '${subcommand}'\n\n${USAGE}`,
    };
  },
};

async function handleList(_ctx: HandlerContext): Promise<HandlerResult> {
  const packages = await listInstalledPackages();

  ui.blank();
  console.log(`  ${ui.brandMark()} ${ui.bold('Installed Packages')}`);
  ui.rule();

  if (packages.length === 0) {
    ui.dim('  No remote packages installed.');
    ui.blank();
    ui.dim('  Install a package: aiwg install owner/name');
    ui.blank();
    return { exitCode: 0 };
  }

  // Column widths
  const keyWidth = Math.max(12, ...packages.map((p) => p.key.length));
  const versionWidth = Math.max(7, ...packages.map((p) => p.version.length));
  const typeWidth = Math.max(4, ...packages.map((p) => p.type.length));

  const header = [
    'Package'.padEnd(keyWidth),
    'Version'.padEnd(versionWidth),
    'Type'.padEnd(typeWidth),
    'Deployed',
  ].join('  ');

  ui.dim(`  ${header}`);
  ui.dim(`  ${'─'.repeat(header.length)}`);

  for (const pkg of packages) {
    const onDisk = existsSync(pkg.key);
    const row = [
      pkg.key.padEnd(keyWidth),
      pkg.version.padEnd(versionWidth),
      pkg.type.padEnd(typeWidth),
      pkg.deployCount > 0 ? `${pkg.deployCount} project${pkg.deployCount > 1 ? 's' : ''}` : '—',
    ].join('  ');
    console.log(`  ${row}`);
    void onDisk; // used for future cache validation
  }

  ui.blank();
  ui.dim(`  ${packages.length} package${packages.length > 1 ? 's' : ''} installed`);
  ui.blank();

  return { exitCode: 0 };
}

async function handleInfo(ctx: HandlerContext): Promise<HandlerResult> {
  const key = ctx.args[1];

  if (!key) {
    return {
      exitCode: 1,
      message: 'Error: Package key required\n\nUsage: aiwg packages info <owner/name>',
    };
  }

  const entry = await getPackageEntry(key);

  if (!entry) {
    return {
      exitCode: 1,
      message: [
        `Error: Package '${key}' not found in local registry`,
        '',
        'Run `aiwg packages list` to see installed packages.',
        `Install it with: aiwg install ${key}`,
      ].join('\n'),
    };
  }

  ui.blank();
  console.log(`  ${ui.brandMark()} ${ui.bold(key)}`);
  ui.rule();

  console.log(`  Version:    ${entry.version}`);
  console.log(`  Type:       ${entry.type}`);
  console.log(`  Source:     ${entry.source}`);
  console.log(`  Cache:      ${entry.cachePath}`);
  console.log(`  On disk:    ${existsSync(entry.cachePath) ? 'yes' : 'no (cache missing — run: aiwg install ' + key + ' --refresh)'}`);
  console.log(`  Installed:  ${entry.installedAt}`);

  if (entry.deployedTo && entry.deployedTo.length > 0) {
    console.log('');
    console.log('  Deployments:');
    for (const d of entry.deployedTo) {
      console.log(`    ${d.projectPath}  [${d.provider}]  ${d.deployedAt}`);
    }
  } else {
    console.log('');
    console.log(`  Deployments: none`);
    console.log(`  Deploy with: aiwg install ${key} --deploy`);
  }

  ui.blank();

  return { exitCode: 0 };
}

async function handleRemove(ctx: HandlerContext): Promise<HandlerResult> {
  const key = ctx.args[1];

  if (!key) {
    return {
      exitCode: 1,
      message: 'Error: Package key required\n\nUsage: aiwg packages remove <owner/name>',
    };
  }

  const removed = await uninstallPackage(key);

  if (!removed) {
    return {
      exitCode: 1,
      message: `Error: Package '${key}' not found in local registry\n\nRun \`aiwg packages list\` to see installed packages.`,
    };
  }

  ui.success(`Removed '${key}' from local registry`);
  ui.dim('  Note: Cache files were not deleted. Remove manually if needed:');
  ui.dim(`  rm -rf ~/.cache/aiwg/packages/`);

  return { exitCode: 0 };
}
