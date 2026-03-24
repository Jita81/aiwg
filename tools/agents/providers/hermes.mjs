/**
 * Hermes Agent Provider
 *
 * Hermes Agent uses an MCP-based integration model, not traditional file-based
 * provider deployment. AIWG functions as an MCP sidecar that Hermes calls.
 *
 * What this provider DOES deploy:
 *   - Skills: ~/.hermes/skills/ (user-global, for agentic skills callable by Hermes)
 *   - AGENTS.md: project root (lean routing guide that Hermes loads on every turn)
 *
 * What this provider SKIPS:
 *   - Commands: MCP tool surface replaces slash commands
 *   - Rules: Hermes uses AGENTS.md + its own memory system
 *
 * See: docs/integrations/hermes-quickstart.md
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ensureDir,
  listMdFiles,
  listSkillDirs,
  deploySkillDir,
  deployFiles,
  getAddonSkillDirs,
  normalizeDeploymentMode,
  collectFrameworkArtifacts,
} from './base.mjs';

// ============================================================================
// Provider Configuration
// ============================================================================

export const name = 'hermes';
export const aliases = [];

export const paths = {
  agents: 'AGENTS.md',                           // Aggregated routing guide at project root
  commands: '',                                   // Not applicable — MCP replaces commands
  skills: path.join(os.homedir(), '.hermes', 'skills'),  // User-global skills
  rules: '',                                      // Not applicable — Hermes uses AGENTS.md
};

export const support = {
  agents: 'aggregated',      // Agents aggregated into lean AGENTS.md
  commands: 'none',          // MCP handles this
  skills: 'native',          // ~/.hermes/skills/ is native Hermes skill location
  rules: 'none',             // Not applicable
};

export const capabilities = {
  skills: true,
  rules: false,
  aggregatedOutput: true,
  yamlFormat: false,
  homeDirectoryDeploy: true,  // Skills deploy to home dir
};

// ============================================================================
// Model Mapping (not applicable — Hermes uses local Ollama models)
// ============================================================================

export function mapModel(shorthand, modelCfg, modelsConfig) {
  return shorthand;
}

// ============================================================================
// AGENTS.md Generation
// ============================================================================

/**
 * Generate a lean AGENTS.md for Hermes
 *
 * Hermes loads AGENTS.md on every turn — keep it under 1,000 characters
 * to preserve context budget on 12GB VRAM setups.
 * See: docs/integrations/hermes-quickstart.md (Part 3)
 */
export function generateAgentsMd(agentCount, skillCount, targetDir, opts) {
  const { dryRun } = opts;

  const lines = [
    '# AIWG Integration',
    '',
    'AIWG connected via MCP (`aiwg mcp serve`). Tools: workflow-run, artifact-read,',
    'artifact-write, template-render, agent-list.',
    '',
    '## Route to AIWG When',
    '',
    '- Structured artifacts needed (requirements, architecture, test plans, risk registers)',
    '- Multi-step workflows with phase gates or checkpoints',
    '- Template-driven output that persists across sessions',
    '',
    'Handle in Hermes directly: one-off questions, short tasks, conversation.',
    '',
    '## Memory Boundary',
    '',
    'When AIWG returns an artifact: store path + one-sentence summary in MEMORY.md.',
    'Do NOT copy artifact body text into memory. Reference, don\'t replicate.',
    '',
    'Use `delegate_task(skip_context_files=True, skip_memory=True)` for AIWG workflows.',
    '',
    '## Artifact Store (.aiwg/)',
    '',
    'Fetch on demand via `artifact-read`:',
    '- `requirements/` — use cases, user stories',
    '- `architecture/` — SAD, ADRs',
    '- `planning/` — phase plans',
    '- `testing/` — test strategy',
    '- `security/` — threat models',
  ];

  const output = lines.join('\n');
  const destPath = path.join(targetDir, 'AGENTS.md');

  if (dryRun) {
    console.log(`[dry-run] Would write AGENTS.md (${output.length} chars, ${Math.round(output.length / 4)} tokens estimated)`);
  } else {
    fs.writeFileSync(destPath, output, 'utf8');
    const charCount = output.length;
    const tokenEstimate = Math.round(charCount / 4);
    const budgetNote = charCount <= 1000 ? '✓ within 1,000 char budget' : `⚠ ${charCount} chars — over 1,000 char budget`;
    console.log(`  Created AGENTS.md (${charCount} chars, ~${tokenEstimate} tokens, ${budgetNote})`);
  }

  return 1;
}

// ============================================================================
// Skills Deployment
// ============================================================================

/**
 * Deploy skills to ~/.hermes/skills/
 *
 * Skills are user-global in Hermes, deployed once, available in all projects.
 */
export function deploySkills(skillDirs, opts) {
  const destDir = paths.skills;
  ensureDir(destDir, opts.dryRun);

  if (!opts.dryRun) {
    console.log(`  Deploying ${skillDirs.length} skills to ${destDir}...`);
  }

  for (const skillDir of skillDirs) {
    deploySkillDir(skillDir, destDir, opts);
  }
}

// ============================================================================
// Main Deploy Function
// ============================================================================

export async function deploy(opts) {
  const {
    srcRoot,
    target,
    mode,
    deploySkills: shouldDeploySkills,
    skillsOnly,
    dryRun,
  } = opts;

  const normalizedMode = normalizeDeploymentMode(mode);

  if (!opts.quiet) {
    console.log(`\n=== Hermes Agent Provider ===`);
    console.log(`Target: ${target}`);
    console.log(`Skills: ${paths.skills}`);
    console.log(`Mode: ${mode}`);
    console.log(`Architecture: Hermes → MCP → AIWG`);
    console.log('');
  }

  // ── Skills ─────────────────────────────────────────────────────────────────
  if ((shouldDeploySkills || skillsOnly) && !opts.commandsOnly && !opts.rulesOnly) {
    const allSkillDirs = [];

    // Addon skills (aiwg-utils, ralph, etc.)
    allSkillDirs.push(...getAddonSkillDirs(srcRoot));

    // Framework skills
    const artifacts = collectFrameworkArtifacts(srcRoot, normalizedMode, {
      includeAgents: false,
      includeCommands: false,
      includeSkills: true,
      includeRules: false,
    });
    allSkillDirs.push(...(artifacts.skills || []));

    if (allSkillDirs.length > 0) {
      deploySkills(allSkillDirs, opts);
    } else if (!opts.quiet) {
      console.log('  No skills found to deploy');
    }
  }

  // ── AGENTS.md ──────────────────────────────────────────────────────────────
  // Generate lean AGENTS.md at project root unless skills-only
  if (!skillsOnly && !opts.commandsOnly && !opts.rulesOnly) {
    const artifacts = collectFrameworkArtifacts(srcRoot, normalizedMode, {
      includeAgents: true,
      includeCommands: false,
      includeSkills: true,
      includeRules: false,
    });
    const agentCount = (artifacts.agents || []).length;
    const skillCount = (artifacts.skills || []).length;
    generateAgentsMd(agentCount, skillCount, target, opts);
  }

  // ── Post-deployment hint ───────────────────────────────────────────────────
  if (!opts.quiet) {
    console.log('');
    console.log('Commands and rules are served via MCP (not deployed as files).');
    console.log('Next: configure ~/.hermes/config.yaml to connect AIWG MCP server.');
    console.log('See: docs/integrations/hermes-quickstart.md (Part 2)');
  }
}

// ============================================================================
// File Extension
// ============================================================================

export function getFileExtension(type) {
  return '.md';
}

// ============================================================================
// Content Transformation (passthrough for Hermes — skills use their own format)
// ============================================================================

export function transformAgent(srcPath, content, opts) {
  return content;
}

export function transformCommand(srcPath, content, opts) {
  return content;
}
