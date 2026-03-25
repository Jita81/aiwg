/**
 * Profile scaffolding for daemon initialization.
 *
 * Reads YAML profile templates from agentic/code/daemon-profiles/ and
 * generates .aiwg/daemon.yaml with the selected profile's defaults.
 *
 * @implements Plan: Daemon Starter — Profile System
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default profile name when none specified */
const DEFAULT_PROFILE = 'manager';

/** Where profile templates live in the framework */
const PROFILES_DIR = path.resolve(__dirname, '../../agentic/code/daemon-profiles');

/** Where the generated config goes */
const OUTPUT_PATH = '.aiwg/daemon.yaml';

/** Environment variable template for .env.example */
const ENV_EXAMPLE = `# AIWG Daemon Environment Variables
# Copy to .env and fill in your values.

# Telegram Bot (get from @BotFather)
# AIWG_TELEGRAM_TOKEN=
# AIWG_TELEGRAM_CHAT_ID=

# Discord Bot (create at discord.com/developers)
# AIWG_DISCORD_TOKEN=
# AIWG_DISCORD_CHANNEL=

# Slack Webhook
# AIWG_SLACK_WEBHOOK_URL=

# Web UI auth token (optional)
# AIWG_WEB_TOKEN=

# Webhook secret (optional)
# AIWG_WEBHOOK_SECRET=
`;

/**
 * List available profile names.
 *
 * @returns {string[]}
 */
export function listProfiles() {
  if (!fs.existsSync(PROFILES_DIR)) return [];

  return fs.readdirSync(PROFILES_DIR)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map(f => path.basename(f, path.extname(f)));
}

/**
 * Read a profile template.
 *
 * @param {string} name - Profile name (without extension)
 * @returns {string} Raw YAML content
 */
export function readProfile(name) {
  const yamlPath = path.join(PROFILES_DIR, `${name}.yaml`);
  const ymlPath = path.join(PROFILES_DIR, `${name}.yml`);

  if (fs.existsSync(yamlPath)) {
    return fs.readFileSync(yamlPath, 'utf8');
  }
  if (fs.existsSync(ymlPath)) {
    return fs.readFileSync(ymlPath, 'utf8');
  }

  throw new Error(`Profile "${name}" not found. Available: ${listProfiles().join(', ')}`);
}

/**
 * Initialize a daemon config from a profile template.
 *
 * @param {Object} options
 * @param {string} [options.profile] - Profile name (default: "manager")
 * @param {string} [options.outputPath] - Override output path
 * @param {boolean} [options.force] - Overwrite existing config
 * @returns {{ configPath: string, envPath: string|null, profile: string }}
 */
export function initProfile(options = {}) {
  const profile = options.profile || DEFAULT_PROFILE;
  const outputPath = options.outputPath || OUTPUT_PATH;
  const force = options.force || false;

  // Check for existing config
  if (fs.existsSync(outputPath) && !force) {
    throw new Error(
      `Config already exists at ${outputPath}. Use --force to overwrite.`
    );
  }

  // Read profile template
  const content = readProfile(profile);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write config
  fs.writeFileSync(outputPath, content, 'utf8');

  // Write .env.example if it doesn't exist
  let envPath = null;
  const envExamplePath = '.env.example';
  if (!fs.existsSync(envExamplePath)) {
    fs.writeFileSync(envExamplePath, ENV_EXAMPLE, 'utf8');
    envPath = envExamplePath;
  }

  return { configPath: outputPath, envPath, profile };
}

export default initProfile;
