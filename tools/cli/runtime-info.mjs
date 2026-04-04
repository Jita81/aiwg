#!/usr/bin/env node
/**
 * AIWG Runtime Info Script
 *
 * Detects the current runtime environment (provider, platform, tools).
 * Called by `aiwg sync` to gather environment context before syncing.
 *
 * @issue #685
 */

import os from 'os';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const json = args.includes('--json');

function detectProvider() {
  if (process.env.CLAUDE_CODE_VERSION || process.env.ANTHROPIC_API_KEY) return 'claude';
  if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_VERSION) return 'cursor';
  if (process.env.WINDSURF_VERSION) return 'windsurf';
  if (process.env.WARP_SESSION_ID || process.env.WARP_TERMINAL) return 'warp';
  if (process.env.COPILOT_AGENT || process.env.GITHUB_COPILOT_TOKEN) return 'copilot';
  if (process.env.FACTORY_AGENT_ID) return 'factory';
  if (process.env.OPENCODE_VERSION) return 'opencode';
  if (process.env.OPENCLAW_VERSION) return 'openclaw';
  if (process.env.OPENAI_API_KEY) return 'codex';
  return 'unknown';
}

function getNodeVersion() {
  return process.version;
}

function getNpmVersion() {
  try {
    return execSync('npm --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return 'unknown';
  }
}

const info = {
  provider: detectProvider(),
  platform: os.platform(),
  arch: os.arch(),
  node: getNodeVersion(),
  npm: getNpmVersion(),
  cwd: process.cwd(),
};

if (json) {
  console.log(JSON.stringify(info, null, 2));
} else {
  console.log(`  Provider: ${info.provider}`);
  console.log(`  Platform: ${info.platform}/${info.arch}`);
  console.log(`  Node:     ${info.node}`);
  console.log(`  npm:      ${info.npm}`);
}
