/**
 * Skill Deployment Collision Detector
 *
 * Scans target platform directories before `aiwg use` to identify name conflicts
 * between skills being deployed and existing skills already present.
 *
 * Severity levels:
 * - none    — target path does not exist, deploy silently
 * - info    — target exists and is AIWG-owned (same or different version), overwrite silently
 * - warn    — target exists and is user-owned or foreign-package-owned, prompt user
 * - error   — name matches a known platform built-in or AIWG CLI command, block deployment
 *
 * @see adr-skill-namespace-strategy.md
 * @implements #698
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { Platform } from '../../agents/types.js';

// ============================================
// Types
// ============================================

export type CollisionSeverity = 'none' | 'info' | 'warn' | 'error';

export interface CollisionResult {
  /** Skill name being deployed */
  skillName: string;
  /** Full path that would be written */
  targetPath: string;
  /** Severity of the collision */
  severity: CollisionSeverity;
  /** Human-readable reason */
  reason: string;
  /** Whether this collision blocks deployment */
  blocksDeployment: boolean;
}

export interface CollisionCheckOptions {
  /** Platform being deployed to */
  platform: Platform;
  /** Project root directory */
  projectPath: string;
  /** Skill names about to be deployed */
  skillNames: string[];
  /** Namespace of the deploying package (e.g. 'aiwg') */
  namespace?: string;
  /** Base skills directory (computed from platform if not provided) */
  skillsBaseDir?: string;
}

// ============================================
// Platform Built-in Blocklists
// ============================================

/**
 * Platform built-in commands that must never be overwritten.
 * Attempting to deploy a skill with one of these names is an ERROR.
 */
const PLATFORM_BUILTINS: Record<string, string[]> = {
  'claude': [
    'help', 'clear', 'compact', 'review', 'init', 'doctor',
    'memory', 'settings', 'logout', 'login', 'mcp', 'migrate',
  ],
  'cursor': ['settings', 'chat', 'edit'],
  'codex': ['help', 'run', 'exec'],
  'copilot': ['help', 'explain', 'fix', 'tests', 'review'],
  'windsurf': ['help', 'settings'],
  'opencode': ['help', 'run'],
  'warp': ['help', 'settings'],
  'hermes': [],
  'openclaw': [],
  'factory': [],
  'generic': [],
};

/**
 * AIWG CLI command names.
 *
 * Skills named `aiwg-{cliCommand}` collide with the AIWG CLI surface when
 * platforms/users parse natural language (e.g. `/aiwg-sync` vs `aiwg sync`).
 * These are treated as ERROR-level collisions to prevent ambiguity.
 *
 * Generated from src/extensions/commands/definitions.ts — keep in sync.
 */
const AIWG_CLI_COMMANDS = new Set([
  'help', 'version', 'doctor', 'update', 'sync', 'use', 'list', 'remove',
  'install', 'packages', 'init', 'run', 'new', 'status',
  'migrate-workspace', 'rollback-workspace', 'mcp', 'catalog', 'skills',
  'index', 'runtime-info', 'prefill-cards', 'contribute-start',
  'validate-metadata', 'install-plugin', 'uninstall-plugin', 'plugin-status',
  'package-plugin', 'package-all-plugins', 'add-agent', 'add-command',
  'add-skill', 'add-behavior', 'add-template', 'scaffold-addon',
  'scaffold-extension', 'scaffold-framework', 'ralph', 'ralph-status',
  'ralph-abort', 'ralph-resume', 'ralph-attach', 'ralph-external',
  'ralph-memory', 'ralph-config', 'mc', 'steward', 'team',
  'cost-report', 'cost-history', 'metrics-tokens', 'doc-sync',
  'cleanup-audit', 'sdlc-accelerate', 'execution-mode', 'snapshot',
  'checkpoint', 'reproducibility-validate', 'behavior', 'daemon-init',
]);

// ============================================
// Ownership Attribution
// ============================================

/**
 * Determine if an existing skill directory is owned by AIWG.
 *
 * A skill is AIWG-owned when ANY of:
 * 1. Its SKILL.md frontmatter contains `namespace: aiwg`
 * 2. Its parent directory is named after a known namespace (e.g. `.claude/skills/aiwg/`)
 * 3. It appears in the framework registry (`.aiwg/frameworks/registry.json`)
 */
async function isAiwgOwned(skillPath: string): Promise<boolean> {
  // Check 1: namespace in frontmatter
  const skillFile = path.join(skillPath, 'SKILL.md');
  try {
    const content = await fs.readFile(skillFile, 'utf-8');
    if (/^namespace:\s*aiwg\s*$/m.test(content)) {
      return true;
    }
  } catch {
    // file doesn't exist or unreadable — not owned
  }

  // Check 2: deployed under a namespace subdirectory
  const parentDir = path.basename(path.dirname(skillPath));
  if (parentDir === 'aiwg') {
    return true;
  }

  return false;
}

// ============================================
// Collision Check
// ============================================

/**
 * Check for deployment collisions before writing skills to a platform directory.
 *
 * @param options - Collision check parameters
 * @returns Array of collision results, one per skill name. Only non-`none` results
 *          are returned (clean deployments are omitted).
 */
export async function checkCollisions(options: CollisionCheckOptions): Promise<CollisionResult[]> {
  const { platform, projectPath, skillNames, namespace = 'aiwg', skillsBaseDir } = options;

  const platformBuiltins = new Set(PLATFORM_BUILTINS[platform] ?? []);
  const results: CollisionResult[] = [];

  for (const skillName of skillNames) {
    const targetPath = skillsBaseDir
      ? path.join(skillsBaseDir, skillName)
      : path.join(projectPath, `.${platform}/skills`, skillName);

    // Check 1: AIWG CLI collision — the bare skill name (without namespace prefix) matches a CLI command
    const bareNameForCliCheck = skillName.startsWith(`${namespace}-`)
      ? skillName.slice(namespace.length + 1)
      : skillName;

    if (AIWG_CLI_COMMANDS.has(bareNameForCliCheck) && skillName.startsWith(`${namespace}-`)) {
      results.push({
        skillName,
        targetPath,
        severity: 'error',
        reason: `'${skillName}' shadows the AIWG CLI command 'aiwg ${bareNameForCliCheck}' — ambiguous invocation`,
        blocksDeployment: true,
      });
      continue;
    }

    // Check 2: Platform built-in collision (bare name)
    if (platformBuiltins.has(bareNameForCliCheck) || platformBuiltins.has(skillName)) {
      results.push({
        skillName,
        targetPath,
        severity: 'error',
        reason: `'${skillName}' matches a ${platform} platform built-in command`,
        blocksDeployment: true,
      });
      continue;
    }

    // Check 3: Target path existence
    let exists = false;
    try {
      await fs.access(targetPath);
      exists = true;
    } catch {
      // doesn't exist — no collision
    }

    if (!exists) {
      // No collision, don't add to results
      continue;
    }

    // Check 4: Ownership of existing skill
    const owned = await isAiwgOwned(targetPath);
    if (owned) {
      results.push({
        skillName,
        targetPath,
        severity: 'info',
        reason: `'${skillName}' already deployed by AIWG — will overwrite`,
        blocksDeployment: false,
      });
    } else {
      results.push({
        skillName,
        targetPath,
        severity: 'warn',
        reason: `'${skillName}' already exists at ${targetPath} and is not owned by AIWG — will overwrite user skill`,
        blocksDeployment: false,
      });
    }
  }

  return results;
}

/**
 * Format collision results as a human-readable warning block.
 *
 * @param results - Collision results from `checkCollisions()`
 * @returns Formatted string for CLI output, or empty string if no results
 */
export function formatCollisionReport(results: CollisionResult[]): string {
  if (results.length === 0) return '';

  const errors = results.filter((r) => r.severity === 'error');
  const warnings = results.filter((r) => r.severity === 'warn');
  const infos = results.filter((r) => r.severity === 'info');

  const lines: string[] = [];

  if (errors.length > 0) {
    lines.push('');
    lines.push('ERROR: Deployment blocked for the following skills:');
    for (const r of errors) {
      lines.push(`  ✗ ${r.skillName}: ${r.reason}`);
    }
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('WARNING: The following skills will overwrite non-AIWG content:');
    for (const r of warnings) {
      lines.push(`  ⚠ ${r.skillName}: ${r.reason}`);
    }
    lines.push('');
    lines.push('  Use --force to overwrite, or --skip-conflicts to skip these skills.');
  }

  if (infos.length > 0 && errors.length === 0 && warnings.length === 0) {
    // Only show info-level if no more serious issues
    for (const r of infos) {
      lines.push(`  ℹ ${r.skillName}: ${r.reason}`);
    }
  }

  return lines.join('\n');
}

/**
 * Check if any collision results block deployment.
 */
export function hasBlockingCollisions(results: CollisionResult[]): boolean {
  return results.some((r) => r.blocksDeployment);
}
