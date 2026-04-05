/**
 * OpenCode Provider
 *
 * Deploys skills and rules in OpenCode format with mode, temperature,
 * tools, and permission configurations based on agent category.
 *
 * Deployment paths:
 *   - Agents: NOT DEPLOYED — OpenCode agents are config-only (opencode.json `agent` key)
 *   - Commands: NOT DEPLOYED — Commands derive from skills automatically
 *   - Skills: .opencode/skill/  (discovered via skill glob: SKILL.md)
 *   - Rules: .opencode/rule/    (loaded via `instructions` array in opencode.json)
 *
 * Special features:
 *   - Category-based configuration (analysis, documentation, planning, implementation)
 *   - Permission system with bash command whitelist
 *   - Temperature and steps per category
 */

import realFs from 'fs';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
let fs;
try { const gfs = _require('graceful-fs'); gfs.gracefulify(realFs); fs = realFs; } catch { fs = realFs; }
import path from 'path';
import {
  ensureDir,
  listMdFiles,
  listMdFilesRecursive,
  deployFiles,
  inferAgentCategory,
  createAgentsMdFromTemplate,
  initializeFrameworkWorkspace,
  getAddonAgentFiles,
  getAddonCommandFiles,
  getAddonRuleFiles,
  getAddonSkillDirs,
  listSkillDirs,
  deploySkillDir,
  normalizeDeploymentMode,
  collectFrameworkArtifacts,
  cleanupOldRuleFiles,
  filterCommandsAgainstSkills,
  deploySoulCompanions
} from './base.mjs';

// ============================================================================
// Provider Configuration
// ============================================================================

export const name = 'opencode';
export const aliases = [];

export const paths = {
  agents: '',             // Not deployed — OpenCode agents are config-only
  commands: '',           // Not deployed — commands derive from skills automatically
  skills: '.opencode/skill/',
  rules: '.opencode/rule/'
};

export const support = {
  agents: 'none',         // Agents defined in opencode.json config, not file-based
  commands: 'none',       // Commands derived from skills automatically
  skills: 'native',       // Discovered via {skill,skills}/**/SKILL.md
  rules: 'conventional',  // Requires instructions[] entry in opencode.json
};

export const capabilities = {
  skills: true,
  rules: true,
  aggregatedOutput: false,
  yamlFormat: false
};

// ============================================================================
// Model Mapping
// ============================================================================

/**
 * Map model shorthand to OpenCode format (full provider/model path)
 */
export function mapModel(originalModel, modelCfg, modelsConfig) {
  const opencodeModels = {
    'opus': 'anthropic/claude-opus-4-6',
    'sonnet': 'anthropic/claude-sonnet-4-6',
    'haiku': 'anthropic/claude-haiku-4-5-20251001'
  };

  // Handle override models first
  if (modelCfg.reasoningModel || modelCfg.codingModel || modelCfg.efficiencyModel) {
    const clean = (originalModel || 'sonnet').toLowerCase().replace(/['"]/g, '');
    if (/opus/i.test(clean)) return modelCfg.reasoningModel || opencodeModels.opus;
    if (/haiku/i.test(clean)) return modelCfg.efficiencyModel || opencodeModels.haiku;
    return modelCfg.codingModel || opencodeModels.sonnet;
  }

  const clean = (originalModel || 'sonnet').toLowerCase().replace(/['"]/g, '');

  for (const [key, value] of Object.entries(opencodeModels)) {
    if (clean.includes(key)) return value;
  }

  return opencodeModels.sonnet; // default
}

// ============================================================================
// Category Configuration
// ============================================================================

/**
 * Get OpenCode agent configuration based on category
 */
export function getAgentConfig(category, name) {
  const configs = {
    analysis: {
      permission: {
        bash: {
          'git *': 'allow',
          'npm audit': 'allow',
          'npm test': 'allow',
          '*': 'ask'
        },
        edit: 'ask'
      },
      temperature: 0.2,
      steps: 30
    },
    documentation: {
      permission: {},
      temperature: 0.4,
      steps: 50
    },
    planning: {
      permission: {
        bash: 'ask',
        edit: 'ask'
      },
      temperature: 0.3,
      steps: 40
    },
    implementation: {
      permission: {
        bash: {
          'aiwg *': 'allow',
          'git status': 'allow',
          'git diff': 'allow',
          'git log*': 'allow',
          'npm test': 'allow',
          'npm run *': 'allow',
          'git push': 'ask',
          'rm -rf': 'deny',
          '*': 'ask'
        }
      },
      temperature: 0.3,
      steps: 100
    }
  };

  return configs[category] || configs.implementation;
}

// ============================================================================
// Content Transformation
// ============================================================================

/**
 * Transform AIWG agent to OpenCode agent format
 */
export function transformAgent(srcPath, content, opts) {
  const { modelsConfig = {} } = opts;

  // Parse existing frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return content;

  const [, frontmatter, body] = fmMatch;

  // Extract metadata
  const name = frontmatter.match(/name:\s*(.+)/)?.[1]?.trim();
  const description = frontmatter.match(/description:\s*(.+)/)?.[1]?.trim();
  const modelMatch = frontmatter.match(/model:\s*(.+)/)?.[1]?.trim();
  const categoryMatch = frontmatter.match(/category:\s*(.+)/)?.[1]?.trim();
  const orchestrationMatch = frontmatter.match(/orchestration:\s*(.+)/)?.[1]?.trim();

  // Map model to OpenCode format
  const opencodeModel = mapModel(modelMatch, opts, modelsConfig);

  // Determine agent category
  const category = categoryMatch || inferAgentCategory(name, body);

  // Get configuration based on category
  const { permission, temperature, steps } = getAgentConfig(category, name);

  // Mode: primary for orchestration agents, subagent for others
  const mode = orchestrationMatch === 'true' ? 'primary' : 'subagent';

  // Generate OpenCode agent frontmatter
  // Valid fields: description, mode, model, temperature, topP, steps, color, hidden, permission, options
  let opencodeFrontmatter = `---
description: ${description || 'AIWG SDLC agent'}
mode: ${mode}
model: ${opencodeModel}
temperature: ${temperature}
steps: ${steps}`;

  // Add permission configuration (controls tool access — opencode has no separate tools block)
  if (Object.keys(permission).length > 0) {
    opencodeFrontmatter += `\npermission:`;
    for (const [perm, value] of Object.entries(permission)) {
      if (typeof value === 'object') {
        opencodeFrontmatter += `\n  ${perm}:`;
        for (const [cmd, action] of Object.entries(value)) {
          opencodeFrontmatter += `\n    "${cmd}": ${action}`;
        }
      } else {
        opencodeFrontmatter += `\n  ${perm}: ${value}`;
      }
    }
  }

  opencodeFrontmatter += `\n---`;

  return `${opencodeFrontmatter}\n\n${body.trim()}`;
}

/**
 * Transform AIWG command to OpenCode command format
 */
export function transformCommand(srcPath, content, opts) {
  const { modelsConfig = {} } = opts;

  // Parse existing frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    // No frontmatter, add minimal OpenCode frontmatter
    const firstLine = content.split('\n')[0];
    const description = firstLine.replace(/^#\s*/, '').trim() || 'AIWG command';
    return `---\ndescription: ${description}\nsubtask: true\n---\n\n${content}`;
  }

  const [, frontmatter, body] = fmMatch;

  // Extract metadata
  const description = frontmatter.match(/description:\s*(.+)/)?.[1]?.trim();
  const agentMatch = frontmatter.match(/agent:\s*(.+)/)?.[1]?.trim();
  const modelMatch = frontmatter.match(/model:\s*(.+)/)?.[1]?.trim();

  // Build OpenCode command frontmatter
  let opencodeFrontmatter = `---\ndescription: ${description || 'AIWG command'}`;

  if (agentMatch) {
    opencodeFrontmatter += `\nagent: ${agentMatch}`;
  }

  if (modelMatch) {
    const opencodeModel = mapModel(modelMatch, opts, modelsConfig);
    opencodeFrontmatter += `\nmodel: ${opencodeModel}`;
  }

  opencodeFrontmatter += `\nsubtask: true\n---`;

  return `${opencodeFrontmatter}\n\n${body.trim()}`;
}

// ============================================================================
// Deployment Functions
// ============================================================================

/**
 * Deploy agents — no-op for OpenCode.
 *
 * OpenCode agents are defined in opencode.json under the `agent` key or are built-ins.
 * No directory is scanned for agent files. See: packages/opencode/src/agent/agent.ts
 */
export function deployAgents(_agentFiles, _targetDir, _opts) {
  // No-op: OpenCode does not discover agents from a directory
}

/**
 * Deploy commands — no-op for OpenCode.
 *
 * OpenCode commands derive from skills automatically (SKILL.md discovery).
 * No .opencode/command/ or .opencode/commands/ directory is scanned.
 * See: packages/opencode/src/command/index.ts
 */
export function deployCommands(_commandFiles, _targetDir, _opts) {
  // No-op: OpenCode does not discover commands from a directory
}

/**
 * Deploy skills to .opencode/skill/
 */
export function deploySkills(skillDirs, targetDir, opts) {
  const destDir = path.join(targetDir, paths.skills);
  ensureDir(destDir, opts.dryRun);
  for (const skillDir of skillDirs) {
    deploySkillDir(skillDir, destDir, opts);
  }
}

/**
 * Deploy rules to .opencode/rule/
 */
export function deployRules(ruleFiles, targetDir, opts) {
  const destDir = path.join(targetDir, paths.rules);
  ensureDir(destDir, opts.dryRun);
  cleanupOldRuleFiles(destDir, opts);
  return deployFiles(ruleFiles, destDir, opts, transformAgent);
}

// ============================================================================
// AGENTS.md
// ============================================================================

export function createAgentsMd(target, srcRoot, dryRun) {
  createAgentsMdFromTemplate(target, srcRoot, 'opencode/AGENTS.md.aiwg-template', dryRun);
}

// ============================================================================
// Post-Deployment
// ============================================================================

export async function postDeploy(targetDir, opts) {
  initializeFrameworkWorkspace(targetDir, opts.mode, opts.dryRun, opts.srcRoot);

  if (opts.createAgentsMd) {
    createAgentsMd(targetDir, opts.srcRoot, opts.dryRun);
  }
}

// ============================================================================
// File Extension
// ============================================================================

export function getFileExtension(type) {
  return '.md';
}

// ============================================================================
// Main Deploy Function
// ============================================================================

export async function deploy(opts) {
  const {
    srcRoot,
    target,
    mode,
    deployCommands: shouldDeployCommands,
    deploySkills: shouldDeploySkills,
    deployRules: shouldDeployRules,
    commandsOnly,
    skillsOnly,
    rulesOnly,
    dryRun,
    createAgentsMd: shouldCreateAgentsMd
  } = opts;

  console.log(`\n=== OpenCode Provider ===`);
  console.log(`Target: ${target}`);
  console.log(`Mode: ${mode}`);

  const agentFiles = [];
  const commandFiles = [];
  const skillDirs = [];
  const ruleFiles = [];
  const normalizedMode = normalizeDeploymentMode(mode);

  // All addons (dynamically discovered)
  if (normalizedMode === 'general' || normalizedMode === 'sdlc' || normalizedMode === 'both' || normalizedMode === 'all') {
    agentFiles.push(...getAddonAgentFiles(srcRoot));

    if (shouldDeployCommands || commandsOnly) {
      commandFiles.push(...getAddonCommandFiles(srcRoot));
    }

    if (shouldDeploySkills || skillsOnly) {
      skillDirs.push(...getAddonSkillDirs(srcRoot));
    }

    if (shouldDeployRules || rulesOnly) {
      ruleFiles.push(...getAddonRuleFiles(srcRoot));
    }
  }

  const frameworkArtifacts = collectFrameworkArtifacts(srcRoot, normalizedMode, {
    includeAgents: true,
    includeCommands: shouldDeployCommands || commandsOnly,
    includeSkills: shouldDeploySkills || skillsOnly,
    includeRules: shouldDeployRules || rulesOnly,
    recursiveCommands: true,
    consolidatedSdlcRules: true
  });
  agentFiles.push(...frameworkArtifacts.agents);
  const soulFiles = [...(frameworkArtifacts.souls || [])];
  commandFiles.push(...frameworkArtifacts.commands);
  skillDirs.push(...frameworkArtifacts.skills);
  ruleFiles.push(...frameworkArtifacts.rules);

  // Deploy
  if (!commandsOnly && !skillsOnly && !rulesOnly) {
    // Agents are config-only in OpenCode — no file deployment
    // deployAgents is a no-op; soul files are skipped since there's no agent dir
    console.log(`\nSkipping ${agentFiles.length} agents (OpenCode agents are config-only)`);
    deployAgents(agentFiles, target, opts); // no-op
    // Soul files require an agent directory — skip for OpenCode
  }

  // Filter commands that collide with skills (skills take precedence)
  const filteredCommands = (shouldDeploySkills || skillsOnly)
    ? filterCommandsAgainstSkills(commandFiles, skillDirs)
    : commandFiles;

  if (shouldDeployCommands || commandsOnly) {
    console.log(`\nDeploying ${filteredCommands.length} commands...`);
    deployCommands(filteredCommands, target, opts);
  }

  if (shouldDeploySkills || skillsOnly) {
    console.log(`\nDeploying ${skillDirs.length} skills...`);
    deploySkills(skillDirs, target, opts);
  }

  if (shouldDeployRules || rulesOnly) {
    console.log(`\nDeploying ${ruleFiles.length} rules...`);
    deployRules(ruleFiles, target, opts);
  }

  await postDeploy(target, { ...opts, createAgentsMd: shouldCreateAgentsMd });

  console.log('\n=== OpenCode deployment complete ===\n');
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  name,
  aliases,
  paths,
  support,
  capabilities,
  transformAgent,
  transformCommand,
  mapModel,
  getAgentConfig,
  deployAgents,
  deployCommands,
  deploySkills,
  deployRules,
  createAgentsMd,
  postDeploy,
  getFileExtension,
  deploy
};
