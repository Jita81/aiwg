#!/usr/bin/env node

/**
 * Behavior management CLI
 *
 * Manage behavior YAML bundles that bind directives and toolsets to agent types.
 * Usage: aiwg behavior <list|info|apply|remove> [name] [options]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from './ipc-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

const SOCKET_PATH = '.aiwg/daemon/daemon.sock';

const args = process.argv.slice(2);
const subcommand = args[0];
const name = args[1];

function getBehaviorDirs() {
  const dirs = [];

  // Cross-framework behaviors
  const globalDir = path.join(repoRoot, 'agentic', 'code', 'behaviors');
  if (fs.existsSync(globalDir)) {
    for (const entry of fs.readdirSync(globalDir, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(globalDir, entry.name, 'BEHAVIOR.md'))) {
        dirs.push({ name: entry.name, path: path.join(globalDir, entry.name), scope: 'global' });
      }
    }
  }

  // Per-framework behaviors
  const frameworksDir = path.join(repoRoot, 'agentic', 'code', 'frameworks');
  if (fs.existsSync(frameworksDir)) {
    for (const fw of fs.readdirSync(frameworksDir, { withFileTypes: true })) {
      if (!fw.isDirectory()) continue;
      const fwBehaviorsDir = path.join(frameworksDir, fw.name, 'behaviors');
      if (!fs.existsSync(fwBehaviorsDir)) continue;
      for (const entry of fs.readdirSync(fwBehaviorsDir, { withFileTypes: true })) {
        if (entry.isDirectory() && fs.existsSync(path.join(fwBehaviorsDir, entry.name, 'BEHAVIOR.md'))) {
          dirs.push({ name: entry.name, path: path.join(fwBehaviorsDir, entry.name), scope: fw.name });
        }
      }
    }
  }

  return dirs;
}

function listBehaviors() {
  const behaviors = getBehaviorDirs();
  if (behaviors.length === 0) {
    console.log('No behaviors found.');
    return;
  }

  console.log(`\nBehaviors (${behaviors.length}):\n`);
  for (const b of behaviors) {
    console.log(`  ${b.name}  (${b.scope})`);
  }
  console.log('');
}

function infoBehavior(behaviorName) {
  if (!behaviorName) {
    console.error('Usage: aiwg behavior info <name>');
    process.exit(1);
  }

  const behaviors = getBehaviorDirs();
  const found = behaviors.find(b => b.name === behaviorName);
  if (!found) {
    console.error(`Behavior not found: ${behaviorName}`);
    process.exit(1);
  }

  const content = fs.readFileSync(path.join(found.path, 'BEHAVIOR.md'), 'utf-8');
  console.log(content);
}

function printHelp() {
  console.log(`
Usage: aiwg behavior <subcommand> [name] [options]

Subcommands:
  list              List all available behaviors
  info <name>       Show behavior details (BEHAVIOR.md)
  apply <name>      Apply a behavior to the daemon (not yet implemented)
  remove <name>     Remove a behavior from the daemon (not yet implemented)

Examples:
  aiwg behavior list
  aiwg behavior info security-sentinel
`);
}

async function applyBehavior(behaviorName) {
  if (!behaviorName) {
    console.error('Usage: aiwg behavior apply <name>');
    process.exit(1);
  }

  let client;
  try {
    client = await createClient(SOCKET_PATH);
    const result = await client.call('behaviors.apply', { name: behaviorName });
    console.log(`Behavior applied: ${result.name}`);
  } catch (err) {
    if (err.message && err.message.includes('not running')) {
      console.error('Daemon is not running. Start it with: aiwg daemon start');
    } else {
      console.error(`Failed to apply behavior '${behaviorName}': ${err.message}`);
    }
    process.exit(1);
  } finally {
    client?.disconnect();
  }
}

async function removeBehavior(behaviorName) {
  if (!behaviorName) {
    console.error('Usage: aiwg behavior remove <name>');
    process.exit(1);
  }

  let client;
  try {
    client = await createClient(SOCKET_PATH);
    const result = await client.call('behaviors.remove', { name: behaviorName });
    if (result.removed) {
      console.log(`Behavior removed: ${result.name}`);
    } else {
      console.log(`Behavior '${behaviorName}' was not active`);
    }
  } catch (err) {
    if (err.message && err.message.includes('not running')) {
      console.error('Daemon is not running. Start it with: aiwg daemon start');
    } else {
      console.error(`Failed to remove behavior '${behaviorName}': ${err.message}`);
    }
    process.exit(1);
  } finally {
    client?.disconnect();
  }
}

switch (subcommand) {
  case 'list':
    listBehaviors();
    break;
  case 'info':
    infoBehavior(name);
    break;
  case 'apply':
    applyBehavior(name);
    break;
  case 'remove':
    removeBehavior(name);
    break;
  case '--help':
  case '-h':
  case undefined:
    printHelp();
    break;
  default:
    console.error(`Unknown subcommand: ${subcommand}`);
    printHelp();
    process.exit(1);
}
