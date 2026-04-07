/**
 * Project-Level AIWG Config
 *
 * Manages `.aiwg/aiwg.config` — the project-level record of:
 *   - Which AI provider toolchains this project targets
 *   - Which frameworks/addons are deployed (with uninstall metadata)
 *   - User-defined scripts callable via `aiwg run`
 *
 * @implements #621
 */

import { readFile, writeFile, mkdir, access, readdir } from 'fs/promises';
import { createHash } from 'crypto';
import { resolve, join, isAbsolute } from 'path';
import { homedir } from 'os';

const CONFIG_FILENAME = 'aiwg.config';
const AIWG_DIR = '.aiwg';

/**
 * Artifact counts for one provider deployment
 */
export interface DeployedArtifactCounts {
  agents: number;
  commands: number;
  skills: number;
  rules: number;
}

/**
 * One entry in the `installed` map
 */
export interface InstalledEntry {
  /** Deployed version (CalVer or semver) */
  version: string;

  /**
   * Source of the deployment:
   *   "bundled"    — came from the npm package
   *   "cache"      — came from ~/.cache/aiwg/packages/ (#557)
   *   git URL      — direct source URL
   */
  source: 'bundled' | 'cache' | string;

  /** ISO-8601 timestamp of last deployment */
  installedAt: string;

  /** Provider → artifact counts */
  deployedTo: Record<string, DeployedArtifactCounts>;

  /** SHA-256 of manifest.json at deploy time; used for stale detection */
  manifestHash?: string;
}

/**
 * Top-level shape of .aiwg/aiwg.config
 */
export interface AiwgConfig {
  $schema?: string;
  version: '1';

  /**
   * AI provider toolchains this project targets.
   * `aiwg use <framework>` with no --provider flag deploys to ALL of these.
   */
  providers: string[];

  /**
   * Frameworks and addons currently deployed.
   * Keyed by the name passed to `aiwg use`.
   */
  installed: Record<string, InstalledEntry>;

  /**
   * User-defined scripts, run via `aiwg run <name>`.
   * Executed with `sh -c "<command>"` (or `cmd /c` on Windows).
   */
  scripts: Record<string, string>;
}

/**
 * Valid provider names (mirrors PROVIDER_PATHS in use.ts)
 */
export const VALID_PROVIDERS = [
  'claude', 'factory', 'codex', 'opencode', 'copilot',
  'cursor', 'warp', 'windsurf', 'hermes', 'openclaw',
] as const;
export type Provider = typeof VALID_PROVIDERS[number];

/**
 * Empty config template
 */
export function emptyConfig(providers: string[] = ['claude']): AiwgConfig {
  return {
    $schema: 'https://aiwg.io/schemas/aiwg.config.v1.json',
    version: '1',
    providers,
    installed: {},
    scripts: {},
  };
}

/**
 * Resolve path to .aiwg/aiwg.config for a project directory
 */
export function getConfigPath(projectDir: string): string {
  return resolve(projectDir, AIWG_DIR, CONFIG_FILENAME);
}

/**
 * Read .aiwg/aiwg.config.
 * Returns null if the file does not exist.
 */
export async function readAiwgConfig(projectDir: string): Promise<AiwgConfig | null> {
  const filePath = getConfigPath(projectDir);
  try {
    await access(filePath);
  } catch {
    return null;
  }

  const content = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(content) as AiwgConfig;

  // Ensure required fields exist (forward-compat)
  if (!parsed.providers) parsed.providers = ['claude'];
  if (!parsed.installed) parsed.installed = {};
  if (!parsed.scripts) parsed.scripts = {};

  return parsed;
}

/**
 * Write .aiwg/aiwg.config, creating .aiwg/ if needed.
 */
export async function writeAiwgConfig(projectDir: string, config: AiwgConfig): Promise<void> {
  const dir = resolve(projectDir, AIWG_DIR);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, CONFIG_FILENAME);
  await writeFile(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Update the `installed` record for a framework after a successful deployment.
 * Returns the updated config (does not write to disk — caller must call writeAiwgConfig).
 */
export function updateInstalled(
  config: AiwgConfig,
  name: string,
  provider: string,
  counts: DeployedArtifactCounts,
  opts: { version: string; source: string; manifestHash?: string }
): AiwgConfig {
  const existing = config.installed[name] ?? {
    version: opts.version,
    source: opts.source,
    installedAt: new Date().toISOString(),
    deployedTo: {},
    manifestHash: opts.manifestHash,
  };

  existing.version = opts.version;
  existing.source = opts.source;
  existing.installedAt = new Date().toISOString();
  existing.deployedTo[provider] = counts;
  if (opts.manifestHash) existing.manifestHash = opts.manifestHash;

  config.installed[name] = existing;
  return config;
}

/**
 * Aggregate deployment counts across all installed frameworks for a given provider.
 * Returns the totals for agents, commands, skills, and rules.
 * If no provider is specified, uses the first configured provider.
 */
export function getDeploymentSummary(
  config: AiwgConfig,
  provider?: string
): DeployedArtifactCounts {
  const targetProvider = provider ?? config.providers[0] ?? 'claude';
  const totals: DeployedArtifactCounts = { agents: 0, commands: 0, skills: 0, rules: 0 };

  for (const entry of Object.values(config.installed)) {
    const counts = entry.deployedTo[targetProvider];
    if (!counts) continue;
    totals.agents += counts.agents;
    totals.commands += counts.commands;
    totals.skills += counts.skills;
    totals.rules += counts.rules;
  }

  return totals;
}

/**
 * Compute SHA-256 hash of a manifest.json file.
 * Returns undefined if the file cannot be read.
 */
export async function hashManifest(manifestPath: string): Promise<string | undefined> {
  try {
    const content = await readFile(manifestPath, 'utf-8');
    return 'sha256:' + createHash('sha256').update(content).digest('hex');
  } catch {
    return undefined;
  }
}

/**
 * Provider → relative deployment directories (project-relative unless absolute).
 * Mirrors PROVIDER_PATHS in use.ts; kept here to avoid circular imports.
 */
const PROVIDER_DEPLOY_DIRS: Record<string, { agents: string; skills: string; commands: string; rules: string }> = {
  claude:   { agents: '.claude/agents',       skills: '.claude/skills',      commands: '.claude/commands',    rules: '.claude/rules'          },
  copilot:  { agents: '.github/agents',       skills: '.github/skills',      commands: '.github/commands',   rules: '.github/copilot-rules'   },
  cursor:   { agents: '.cursor/agents',       skills: '.cursor/skills',      commands: '.cursor/commands',    rules: '.cursor/rules'           },
  opencode: { agents: '.opencode/agent',      skills: '.opencode/skill',     commands: '',                   rules: '.opencode/rule'           },
  warp:     { agents: '.warp/agents',         skills: '.warp/skills',        commands: '.warp/commands',      rules: '.warp/rules'             },
  windsurf: { agents: '.windsurf/agents',     skills: '.windsurf/skills',    commands: '.windsurf/workflows', rules: '.windsurf/rules'         },
  factory:  { agents: '.factory/droids',      skills: '.factory/skills',     commands: '.factory/commands',   rules: '.factory/rules'          },
  codex:    { agents: '.codex/agents',        skills: '.codex/skills',       commands: '.codex/commands',     rules: '.codex/rules'            },
  hermes:   { agents: '',                     skills: join(homedir(), '.hermes', 'skills'),   commands: '',                   rules: ''                        },
  openclaw: { agents: join(homedir(), '.openclaw', 'agents'), skills: join(homedir(), '.openclaw', 'skills'), commands: join(homedir(), '.openclaw', 'commands'), rules: join(homedir(), '.openclaw', 'rules') },
};

/**
 * Count .md files or subdirectories in a deployment directory.
 * Returns 0 if the directory does not exist.
 */
async function countDeployedInDir(
  projectDir: string,
  relOrAbsDir: string,
  mode: 'md' | 'dirs'
): Promise<number> {
  if (!relOrAbsDir) return 0;
  const dir = isAbsolute(relOrAbsDir) ? relOrAbsDir : resolve(projectDir, relOrAbsDir);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    if (mode === 'md') return entries.filter(e => e.isFile() && e.name.endsWith('.md')).length;
    return entries.filter(e => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

/**
 * Scan actual deployment directories and populate `deployedTo` for any
 * `installed` entries that have an empty `deployedTo` map.
 *
 * Called by `aiwg init` when migrating a project that already has frameworks
 * deployed but whose config was created before deployment-tracking was added.
 *
 * @implements #721
 */
export async function populateDeployedTo(
  config: AiwgConfig,
  projectDir: string
): Promise<AiwgConfig> {
  const entriesNeedingPopulation = Object.entries(config.installed).filter(
    ([, entry]) => Object.keys(entry.deployedTo).length === 0
  );
  if (entriesNeedingPopulation.length === 0) return config;

  for (const provider of config.providers) {
    const dirs = PROVIDER_DEPLOY_DIRS[provider];
    if (!dirs) continue;

    const counts: DeployedArtifactCounts = {
      agents:   await countDeployedInDir(projectDir, dirs.agents,   'md'),
      commands: await countDeployedInDir(projectDir, dirs.commands, 'md'),
      skills:   await countDeployedInDir(projectDir, dirs.skills,   'dirs'),
      rules:    await countDeployedInDir(projectDir, dirs.rules,    'md'),
    };

    // Only populate if at least one artifact type is present
    if (counts.agents + counts.commands + counts.skills + counts.rules === 0) continue;

    for (const [name, entry] of entriesNeedingPopulation) {
      if (Object.keys(entry.deployedTo).length === 0) {
        entry.deployedTo[provider] = counts;
        config.installed[name] = entry;
      }
    }
  }

  return config;
}

/**
 * Migrate entries from the legacy .aiwg/frameworks/registry.json into
 * the `installed` map of an AiwgConfig (best-effort, non-destructive).
 */
export async function migrateLegacyRegistry(
  projectDir: string,
  config: AiwgConfig
): Promise<AiwgConfig> {
  const legacyPath = resolve(projectDir, AIWG_DIR, 'frameworks', 'registry.json');
  try {
    const content = await readFile(legacyPath, 'utf-8');
    const legacy = JSON.parse(content) as {
      frameworks?: Array<{ id: string; version?: string; installed?: string }>;
    };

    for (const fw of legacy.frameworks ?? []) {
      // Normalise legacy IDs: "sdlc-complete" → "sdlc"
      const name = fw.id.replace(/-complete$/, '').replace(/-kit$/, '');
      if (!config.installed[name]) {
        config.installed[name] = {
          version: fw.version ?? 'unknown',
          source: 'bundled',
          installedAt: fw.installed ?? new Date().toISOString(),
          deployedTo: {},
        };
      }
    }
  } catch {
    // Legacy file absent or unreadable — skip silently
  }
  return config;
}
