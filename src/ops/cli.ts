/**
 * Ops CLI — Subcommand router for `aiwg ops`
 *
 * Subcommands:
 *   init              — Bootstrap a new ops workspace
 *   status            — Show workspace health
 *   use <workspace>   — Switch active workspace
 *   list              — List registered workspaces
 *   push              — Push workspace repos to remote
 *
 * @implements #544
 */

import { OpsRegistry } from './registry.js';

/**
 * Main CLI entry point for `aiwg ops <subcommand> [args]`
 */
export async function main(args: string[]): Promise<void> {
  // Extract global flags
  let configDir: string | undefined;
  const filteredArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config-dir' && i + 1 < args.length) {
      configDir = args[i + 1];
      i++;
    } else {
      filteredArgs.push(args[i]);
    }
  }

  const subcommand = filteredArgs[0];
  const subArgs = filteredArgs.slice(1);

  const registry = new OpsRegistry(configDir);

  switch (subcommand) {
    case 'init':
      await handleInit(registry, subArgs);
      break;

    case 'status':
      await handleStatus(registry, subArgs);
      break;

    case 'use':
      await handleUse(registry, subArgs);
      break;

    case 'list':
    case 'ls':
      await handleList(registry);
      break;

    case 'push':
      await handlePush(registry, subArgs);
      break;

    default:
      printUsage();
      if (subcommand) {
        throw new Error(`Unknown ops subcommand: ${subcommand}`);
      }
      break;
  }
}

async function handleInit(registry: OpsRegistry, args: string[]): Promise<void> {
  // Parse flags
  let silent = false;
  let workspace: string | undefined;
  let home: string | undefined;
  let mode: 'single-repo' | 'multi-repo' = 'multi-repo';
  let extensions = ['sys', 'it', 'dev'];
  let prefix: string | undefined;
  let provider: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--silent': silent = true; break;
      case '--workspace': workspace = args[++i]; break;
      case '--home': home = args[++i]; break;
      case '--mode': mode = args[++i] as 'single-repo' | 'multi-repo'; break;
      case '--ext': extensions = args[++i].split(','); break;
      case '--prefix': prefix = args[++i]; break;
      case '--provider': provider = args[++i]; break;
    }
  }

  if (!workspace) {
    workspace = 'default';
  }

  await registry.initWorkspace({
    name: workspace,
    home,
    mode,
    extensions,
    prefix,
    provider,
    silent,
  });
}

async function handleStatus(registry: OpsRegistry, args: string[]): Promise<void> {
  const showAll = args.includes('--all');
  await registry.showStatus(showAll);
}

async function handleUse(registry: OpsRegistry, args: string[]): Promise<void> {
  const workspace = args[0];
  if (!workspace) {
    throw new Error('Usage: aiwg ops use <workspace>');
  }
  await registry.switchWorkspace(workspace);
}

async function handleList(registry: OpsRegistry): Promise<void> {
  await registry.listWorkspaces();
}

async function handlePush(registry: OpsRegistry, args: string[]): Promise<void> {
  let workspace: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace') {
      workspace = args[++i];
    }
  }
  await registry.pushWorkspace(workspace);
}

function printUsage(): void {
  console.log(`Usage: aiwg ops <subcommand> [options]

Subcommands:
  init                    Bootstrap a new ops workspace
  status [--all]          Show workspace health
  use <workspace>         Switch active workspace
  list                    List registered workspaces
  push [--workspace <n>]  Push workspace repos to remote

Init options:
  --silent                Skip interactive prompts
  --workspace <name>      Workspace name (default: "default")
  --home <path>           Parent directory for repos
  --mode <mode>           single-repo or multi-repo (default: multi-repo)
  --ext <list>            Comma-separated extensions: sys,it,dev,stream
  --prefix <name>         Repo naming prefix (e.g., "myorg")
  --provider <name>       Remote provider for auto-push (github, gitea, or URL)

Global flags:
  --config-dir <path>     Override config directory

Examples:
  aiwg ops init
  aiwg ops init --silent --workspace personal --ext sys,dev
  aiwg ops init --mode single-repo --workspace homelab
  aiwg ops status
  aiwg ops status --all
  aiwg ops use client-acme
  aiwg ops list
  aiwg ops push --workspace personal`);
}
