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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

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

switch (subcommand) {
  case 'list':
    listBehaviors();
    break;
  case 'info':
    infoBehavior(name);
    break;
  case 'apply':
    console.log('behavior apply: not yet implemented (requires running daemon)');
    break;
  case 'remove':
    console.log('behavior remove: not yet implemented (requires running daemon)');
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
