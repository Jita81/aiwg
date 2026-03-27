/**
 * Config CLI — Subcommand router for `aiwg config`
 *
 * Subcommands:
 *   get <key>           — Read a config value
 *   set <key> <value>   — Write a config value
 *   list                — Show all user config (merged view)
 *   validate            — Validate all config files
 *   reset [<key>]       — Reset key or all config to defaults
 *   path                — Print the active config directory path
 *   edit                — Open config in $EDITOR
 *   gitignore           — Show/check/fix .gitignore for AIWG runtime dirs
 *
 * Global flags:
 *   --config-dir <path> — Override config directory
 *
 * @implements #545
 * @implements #553
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { UserConfig } from './user-config.js';

const _scriptDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Main CLI entry point for `aiwg config <subcommand> [args]`
 */
export async function main(args: string[]): Promise<void> {
  // Extract --config-dir flag before routing
  let configDir: string | undefined;
  const filteredArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config-dir' && i + 1 < args.length) {
      configDir = args[i + 1];
      i++; // skip next arg
    } else {
      filteredArgs.push(args[i]);
    }
  }

  const subcommand = filteredArgs[0];
  const subArgs = filteredArgs.slice(1);

  const config = new UserConfig(configDir);

  switch (subcommand) {
    case 'get':
      await handleGet(config, subArgs);
      break;

    case 'set':
      await handleSet(config, subArgs);
      break;

    case 'list':
    case 'ls':
      await handleList(config);
      break;

    case 'validate':
      await handleValidate(config);
      break;

    case 'reset':
      await handleReset(config, subArgs);
      break;

    case 'path':
      handlePath(config);
      break;

    case 'edit':
      await handleEdit(config);
      break;

    case 'gitignore':
      await handleGitignore(subArgs);
      break;

    default:
      printUsage();
      if (subcommand) {
        throw new Error(`Unknown config subcommand: ${subcommand}`);
      }
      break;
  }
}

async function handleGet(config: UserConfig, args: string[]): Promise<void> {
  const key = args[0];
  if (!key) {
    throw new Error('Usage: aiwg config get <key>\n\nExample: aiwg config get defaults.provider');
  }

  const value = await config.get(key);
  if (value === undefined) {
    console.log(`(not set)`);
  } else if (typeof value === 'object') {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(String(value));
  }
}

async function handleSet(config: UserConfig, args: string[]): Promise<void> {
  const key = args[0];
  const value = args[1];

  if (!key || value === undefined) {
    throw new Error('Usage: aiwg config set <key> <value>\n\nExample: aiwg config set defaults.verbosity quiet');
  }

  await config.set(key, value);
  console.log(`Set ${key} = ${value}`);
}

async function handleList(config: UserConfig): Promise<void> {
  const allConfig = await config.list();

  console.log(`Config directory: ${config.getPath()}\n`);

  for (const [filename, data] of Object.entries(allConfig)) {
    console.log(`── ${filename} ──`);
    if (typeof data === 'string') {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
    console.log('');
  }
}

async function handleValidate(config: UserConfig): Promise<void> {
  const issues = await config.validate();

  console.log(`Config directory: ${config.getPath()}\n`);

  if (issues.length === 0) {
    console.log('✓ All config files valid');
    return;
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  for (const issue of issues) {
    const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '!' : 'i';
    console.log(`  ${icon} [${issue.file}] ${issue.message}`);
  }

  console.log('');
  console.log(`${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info`);

  if (errors.length > 0) {
    throw new Error(`Config validation failed with ${errors.length} error(s)`);
  }
}

async function handleReset(config: UserConfig, args: string[]): Promise<void> {
  const key = args[0];

  if (key) {
    await config.reset(key);
    console.log(`Reset ${key} to default`);
  } else {
    await config.reset();
    console.log('Reset all config to defaults');
  }
}

function handlePath(config: UserConfig): void {
  console.log(config.getPath());
}

async function handleEdit(config: UserConfig): Promise<void> {
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  const configPath = `${config.getPath()}/config.yaml`;

  // Ensure the config file exists before opening
  await config.ensureDir();

  const { execSync } = await import('child_process');
  try {
    execSync(`${editor} "${configPath}"`, { stdio: 'inherit' });
  } catch {
    throw new Error(`Failed to open editor: ${editor}`);
  }
}

async function handleGitignore(args: string[]): Promise<void> {
  const { spawnSync } = await import('child_process');
  // Locate the gitignore CLI script relative to this compiled module
  const scriptPath = path.resolve(_scriptDir, '../../tools/cli/config-gitignore.mjs');
  const result = spawnSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function printUsage(): void {
  console.log(`Usage: aiwg config <subcommand> [options]

Subcommands:
  get <key>           Read a config value
  set <key> <value>   Write a config value
  list                Show all user config
  validate            Validate all config files
  reset [<key>]       Reset key or all config to defaults
  path                Print config directory path
  edit                Open config in $EDITOR
  gitignore           Show/check/fix .gitignore AIWG entries

Global flags:
  --config-dir <path> Override config directory

Examples:
  aiwg config get defaults.provider
  aiwg config set defaults.verbosity quiet
  aiwg config set updates.channel next
  aiwg config list
  aiwg config validate
  aiwg config path
  aiwg config reset defaults.provider
  aiwg config --config-dir /custom/path list
  aiwg config gitignore
  aiwg config gitignore --fix
  aiwg config gitignore --check`);
}
