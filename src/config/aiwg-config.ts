/**
 * Project-Level AIWG Config
 *
 * Manages `.aiwg/aiwg.config.json` — the project-level record of:
 *   - Which AI provider toolchains this project targets
 *   - Which frameworks/addons are deployed (with uninstall metadata)
 *   - User-defined scripts callable via `aiwg run`
 *
 * @implements #621
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { createHash } from 'crypto';
import { resolve, join } from 'path';

const CONFIG_FILENAME = 'aiwg.config.json';
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
 * Top-level shape of .aiwg/aiwg.config.json
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
 * Resolve path to .aiwg/aiwg.config.json for a project directory
 */
export function getConfigPath(projectDir: string): string {
  return resolve(projectDir, AIWG_DIR, CONFIG_FILENAME);
}

/**
 * Read .aiwg/aiwg.config.json.
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
 * Write .aiwg/aiwg.config.json, creating .aiwg/ if needed.
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
