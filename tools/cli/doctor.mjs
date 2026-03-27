#!/usr/bin/env node
/**
 * AIWG Doctor Command
 * Checks installation health and diagnoses common issues
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chalk from 'chalk';

// Resolve package root from the location of this script (tools/cli/doctor.mjs → ../../)
// This works correctly for npm global installs, local dev, and rc/pre-release installs.
const _scriptDir = path.dirname(fileURLToPath(import.meta.url));
const AIWG_ROOT = process.env.AIWG_ROOT || path.resolve(_scriptDir, '../../');

const checks = [];

function check(name, status, message) {
  checks.push({ name, status, message });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const BRAND_HEX = '#818CF8';

async function runDoctor() {
  const isTTY = Boolean(process.stdout.isTTY);
  const mark = isTTY ? chalk.hex(BRAND_HEX)('◆') : '◆';
  const rule = isTTY ? chalk.dim('  ' + '─'.repeat(42)) : '  ' + '-'.repeat(42);

  console.log('');
  console.log(isTTY ? `  ${mark} ${chalk.bold('AIWG Doctor')}` : '  ◆ AIWG Doctor');
  console.log(rule);
  console.log('');

  // 1. Check AIWG installation
  const aiwgInstalled = await fileExists(AIWG_ROOT);
  if (aiwgInstalled) {
    check('AIWG Installation', 'ok', `Found at ${AIWG_ROOT}`);
  } else {
    check('AIWG Installation', 'error', 'AIWG not installed. Run: npm install -g aiwg');
  }

  // 2. Check version
  try {
    const version = execSync('aiwg -version 2>/dev/null', { encoding: 'utf-8' }).trim();
    check('AIWG Version', 'ok', version.split('\n')[0]);
  } catch {
    check('AIWG Version', 'warn', 'Could not determine version');
  }

  // 3. Check .aiwg directory in current project
  const projectAiwg = path.join(process.cwd(), '.aiwg');
  const hasProjectAiwg = await fileExists(projectAiwg);
  if (hasProjectAiwg) {
    check('Project .aiwg/', 'ok', 'Found in current directory');
  } else {
    check('Project .aiwg/', 'info', 'No .aiwg/ in current directory (not an AIWG project)');
  }

  // 4. Check Claude Code
  const claudeAgents = path.join(process.cwd(), '.claude/agents');
  const hasClaudeAgents = await fileExists(claudeAgents);
  if (hasClaudeAgents) {
    const files = await fs.readdir(claudeAgents);
    const agentCount = files.filter(f => f.endsWith('.md')).length;
    check('Claude Code Agents', 'ok', `${agentCount} agents deployed`);
  } else {
    check('Claude Code Agents', 'info', 'No agents deployed (run: aiwg use sdlc)');
  }

  // 5. Check commands
  const claudeCommands = path.join(process.cwd(), '.claude/commands');
  const hasClaudeCommands = await fileExists(claudeCommands);
  if (hasClaudeCommands) {
    const files = await fs.readdir(claudeCommands);
    const cmdCount = files.filter(f => f.endsWith('.md')).length;
    check('Claude Code Commands', 'ok', `${cmdCount} commands deployed`);
  } else {
    check('Claude Code Commands', 'info', 'No commands deployed');
  }

  // 6. Check Skill Seekers (optional)
  const skillSeekersPath = path.join(AIWG_ROOT, 'skill-seekers');
  const hasSkillSeekers = await fileExists(skillSeekersPath);
  if (hasSkillSeekers) {
    check('Skill Seekers', 'ok', 'Community skills available');
  } else {
    check('Skill Seekers', 'info', 'Not installed (optional). Run: aiwg install-skill-seekers');
  }

  // 7. Check Node.js version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (major >= 18) {
    check('Node.js', 'ok', nodeVersion);
  } else {
    check('Node.js', 'error', `${nodeVersion} (requires >= 18.0.0)`);
  }

  // 8. Check MCP server
  const mcpServer = path.join(AIWG_ROOT, 'src/mcp/server.mjs');
  const hasMcp = await fileExists(mcpServer);
  if (hasMcp) {
    check('MCP Server', 'ok', 'Available (run: aiwg mcp serve)');
  } else {
    check('MCP Server', 'warn', 'Not found');
  }

  // Print results
  console.log('');

  const statusSymbols = { ok: '✓', warn: '⚠', error: '✗', info: '○' };
  const colorFns = {
    ok: isTTY ? chalk.green : (s) => s,
    warn: isTTY ? chalk.yellow : (s) => s,
    error: isTTY ? chalk.red : (s) => s,
    info: isTTY ? chalk.cyan : (s) => s
  };

  for (const { name, status, message } of checks) {
    const symbol = statusSymbols[status];
    const colorFn = colorFns[status] || ((s) => s);
    console.log(`  ${colorFn(symbol)} ${name}: ${message}`);
  }

  // Summary
  const pass = checks.filter(c => c.status === 'ok').length;
  const errors = checks.filter(c => c.status === 'error').length;
  const warnings = checks.filter(c => c.status === 'warn').length;

  console.log(rule);
  console.log('');

  if (errors > 0) {
    const msg = `${errors} error(s), ${warnings} warning(s), ${pass} passed`;
    console.log(isTTY ? chalk.red(`  ✗ ${msg}`) : `  FAIL ${msg}`);
    console.log('');
    process.exit(1);
  } else if (warnings > 0) {
    const msg = `${warnings} warning(s), ${pass} passed`;
    console.log(isTTY ? chalk.yellow(`  ⚠ ${msg}`) : `  WARN ${msg}`);
  } else {
    console.log(isTTY ? chalk.green(`  ✓ All ${pass} checks passed`) : `  OK All ${pass} checks passed`);
  }

  console.log('');
}

runDoctor().catch(error => {
  console.error('Doctor failed:', error.message);
  process.exit(1);
});
