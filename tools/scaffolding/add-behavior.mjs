#!/usr/bin/env node

/**
 * CLI tool to add a behavior to an existing addon or framework
 * Usage: aiwg add-behavior <name> [options]
 *
 * Behaviors are reactive capabilities with scripts + hooks + structured inputs.
 * They extend beyond skills by subscribing to system events.
 */

import {
  parseArgs,
  formatName,
  ensureDir,
  writeFileIfNotExists,
  printSuccess,
  printError,
  printInfo,
  printHeader,
} from './utils.mjs';
import { existsSync, writeFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const { positional, flags } = parseArgs(process.argv);

const name = positional[0];
const behaviorDescription = flags.description || flags.d || `${formatName(name || 'behavior').title} behavior`;
const hooks = flags.hooks || 'on_file_write';
const category = flags.category || 'general';
const dryRun = flags['dry-run'] || flags.n;
const help = flags.help || flags.h;

function printHelp() {
  console.log(`
Usage: aiwg add-behavior <name> [options]

Add a new behavior to the cross-framework behaviors directory.

Behaviors are reactive capabilities with scripts + hooks + structured inputs.
They go beyond skills by subscribing to system events (file writes, deploys,
schedules) and reacting automatically.

Arguments:
  name                  Behavior name (kebab-case recommended)

Options:
  --description, -d     Behavior description
  --hooks               Comma-separated hook events (default: on_file_write)
                        Available: on_file_write, on_tool_complete, on_schedule,
                                   on_commit, on_pr_open, on_deploy,
                                   on_session_start, on_session_end
  --category            Behavior category (default: general)
  --dry-run, -n         Preview what would be created
  --help, -h            Show this help

Examples:
  aiwg add-behavior security-scanner
  aiwg add-behavior test-watcher --hooks on_file_write,on_schedule --category testing
  aiwg add-behavior deploy-guard --hooks on_deploy --description "Pre-deploy validation"
`);
}

function generateHooksYaml(hooksStr) {
  const hookList = hooksStr.split(',').map(h => h.trim());
  const lines = [];

  for (const hook of hookList) {
    lines.push(`  ${hook}:`);
    switch (hook) {
      case 'on_file_write':
        lines.push('    - filter: "**/*"');
        lines.push('      action: run_script');
        lines.push('      script: scripts/main.sh');
        break;
      case 'on_tool_complete':
        lines.push('    - tool: build');
        lines.push('      action: run_script');
        lines.push('      script: scripts/main.sh');
        break;
      case 'on_schedule':
        lines.push('    - cron: "0 */4 * * *"');
        lines.push('      action: run_script');
        lines.push('      script: scripts/main.sh');
        break;
      case 'on_deploy':
        lines.push('    - action: run_script');
        lines.push('      script: scripts/main.sh');
        break;
      case 'on_commit':
        lines.push('    - action: run_script');
        lines.push('      script: scripts/main.sh');
        break;
      case 'on_pr_open':
        lines.push('    - action: run_script');
        lines.push('      script: scripts/main.sh');
        break;
      default:
        lines.push('    - action: run_script');
        lines.push('      script: scripts/main.sh');
    }
  }

  return lines.join('\n');
}

function generateBehaviorMd(name, options) {
  const { kebab, title } = formatName(name);
  const hooksYaml = generateHooksYaml(options.hooks);

  return `---
name: ${kebab}
version: 1.0.0
description: ${options.description}
platforms: [openclaw, claude-code]

triggers:
  - "TODO: add NLP trigger phrase"

inputs:
  - name: target
    type: string
    required: false
    description: TODO: describe input

hooks:
${hooksYaml}

scripts:
  main: scripts/main.sh

manifest:
  category: ${options.category}
  requires:
    bins: []
  outputs:
    - type: report
      path: .aiwg/reports/
---

# ${title}

${options.description}

## When Triggered via NLP

TODO: describe what happens when a user says the trigger phrase.

## When Triggered via Hooks

TODO: describe what happens for each hook event.
`;
}

function generateMainScript(name) {
  const { kebab } = formatName(name);

  return `#!/usr/bin/env bash
# ${kebab} — main entry point
#
# Invoked when the behavior is triggered via NLP or hooks.
#
# Environment variables (set by the platform):
#   BEHAVIOR_NAME      — "${kebab}"
#   BEHAVIOR_TRIGGER   — The trigger phrase (NLP) or hook event
#   HOOK_EVENT         — Hook event type (if triggered by hook)
#   HOOK_FILE_PATH     — Changed file path (for on_file_write)
#   HOOK_TOOL          — Tool name (for on_tool_complete)
#   PROJECT_ROOT       — Project root directory
#   INPUT_*            — Structured inputs from BEHAVIOR.md

set -euo pipefail

PROJECT="\${PROJECT_ROOT:-.}"

echo "${kebab}: running"

# TODO: implement behavior logic

echo "${kebab}: complete"
`;
}

async function main() {
  if (help) {
    printHelp();
    process.exit(0);
  }

  if (!name) {
    printError('Behavior name is required.');
    printHelp();
    process.exit(1);
  }

  const { kebab, title } = formatName(name);

  // Behaviors go in the cross-framework behaviors directory
  const behaviorsDir = join(repoRoot, 'agentic', 'code', 'behaviors');
  const behaviorDir = join(behaviorsDir, kebab);
  const behaviorMdPath = join(behaviorDir, 'BEHAVIOR.md');
  const scriptsDir = join(behaviorDir, 'scripts');
  const mainScriptPath = join(scriptsDir, 'main.sh');

  // Check if behavior already exists
  if (existsSync(behaviorDir)) {
    printError(`Behavior already exists: ${behaviorDir}`);
    process.exit(1);
  }

  printHeader(`Adding Behavior: ${title}`);

  // Generate content
  const behaviorMdContent = generateBehaviorMd(name, {
    description: behaviorDescription,
    hooks,
    category,
  });
  const mainScriptContent = generateMainScript(name);

  if (dryRun) {
    console.log('\n[DRY RUN] Would create:\n');
    console.log(`  ${behaviorDir}/`);
    console.log(`  ${behaviorMdPath}`);
    console.log(`  ${scriptsDir}/`);
    console.log(`  ${mainScriptPath}`);
    console.log('\nBEHAVIOR.md content preview:');
    console.log('\u2500'.repeat(40));
    console.log(behaviorMdContent.slice(0, 600) + '...');
    console.log('\nRun without --dry-run to create.');
    process.exit(0);
  }

  // Create directory structure
  ensureDir(behaviorDir);
  ensureDir(scriptsDir);
  printSuccess(`Created ${behaviorDir}/`);

  // Write BEHAVIOR.md
  writeFileIfNotExists(behaviorMdPath, behaviorMdContent, { force: true });
  printSuccess(`Created ${behaviorMdPath}`);

  // Write main.sh
  writeFileIfNotExists(mainScriptPath, mainScriptContent, { force: true });
  try { chmodSync(mainScriptPath, 0o755); } catch { /* ignore on platforms without chmod */ }
  printSuccess(`Created ${mainScriptPath}`);

  // Summary
  printHeader('Behavior Added Successfully');
  printInfo(`Behavior: ${kebab}`);
  printInfo(`Location: ${behaviorDir}/`);
  printInfo('');
  printInfo('Next steps:');
  printInfo('  1. Edit BEHAVIOR.md — set triggers, inputs, and hooks');
  printInfo('  2. Implement scripts/main.sh');
  printInfo('  3. Add additional scripts for each hook event');
  printInfo('  4. Deploy: aiwg use sdlc --provider openclaw');
  printInfo('  5. Test: openclaw skills list | grep ' + kebab);
  console.log('');
}

main().catch(err => {
  printError(err.message);
  process.exit(1);
});
