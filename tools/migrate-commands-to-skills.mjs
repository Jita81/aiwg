#!/usr/bin/env node

// Migrate framework/addon commands/*.md → skills/*/SKILL.md
// Converts flat command files to folder-based SKILL.md format,
// preserving command metadata in commandHint for translation layer.
//
// Usage: node tools/migrate-commands-to-skills.mjs [--dry-run] [--verbose]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FRAMEWORKS_DIR = path.join(ROOT, 'agentic/code/frameworks');
const ADDONS_DIR = path.join(ROOT, 'agentic/code/addons');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// Stats tracking
const stats = {
  scanned: 0,
  migrated: 0,
  collisions: 0,
  skipped: 0,
  errors: 0,
  manifests: 0,
  flatSkills: 0,
  details: []
};

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { frontmatter: object, body: string }
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const fm = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) {
      fm[key] = value;
    }
  }

  return { frontmatter: fm, body: match[2] };
}

/**
 * Build SKILL.md content from a command file's frontmatter and body.
 */
function buildSkillMd(name, fm, body) {
  const lines = ['---'];

  // Core skill fields
  if (fm.description) {
    lines.push(`description: ${fm.description}`);
  }

  // Preserve command metadata for translation layer (#550)
  const hintFields = [];
  if (fm['argument-hint']) {
    hintFields.push(`  argumentHint: ${fm['argument-hint']}`);
  }
  if (fm['allowed-tools']) {
    hintFields.push(`  allowedTools: ${fm['allowed-tools']}`);
  }
  if (fm.model) {
    hintFields.push(`  model: ${fm.model}`);
  }
  if (fm.category) {
    hintFields.push(`  category: ${fm.category}`);
  }
  if (fm.orchestration) {
    hintFields.push(`  orchestration: ${fm.orchestration}`);
  }

  if (hintFields.length > 0) {
    lines.push('commandHint:');
    lines.push(...hintFields);
  }

  lines.push('---');
  lines.push('');
  lines.push(body.trimStart());

  return lines.join('\n');
}

/**
 * Migrate a single command file to a skill directory.
 * Returns true if migrated, false if skipped.
 */
function migrateCommand(commandFile, skillsDir) {
  const basename = path.basename(commandFile, '.md');
  const skillDir = path.join(skillsDir, basename);
  const skillFile = path.join(skillDir, 'SKILL.md');

  stats.scanned++;

  // Skip README files
  if (basename.toLowerCase() === 'readme') {
    stats.skipped++;
    if (VERBOSE) console.log(`  SKIP ${basename} (README)`);
    return false;
  }

  // Read source
  const content = fs.readFileSync(commandFile, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  // Check for collision with existing skill
  if (fs.existsSync(skillFile)) {
    // Command content is typically more complete - overwrite thin skill wrapper
    const existingContent = fs.readFileSync(skillFile, 'utf-8');
    const existingSize = existingContent.length;
    const newSize = content.length;

    if (newSize > existingSize) {
      // Command is larger → replace skill with migrated command
      stats.collisions++;
      if (VERBOSE) console.log(`  COLLISION ${basename}: command (${newSize}b) replaces skill (${existingSize}b)`);
    } else {
      // Existing skill is larger or equal → keep existing, skip migration
      stats.skipped++;
      stats.details.push(`KEPT existing skill: ${basename} (skill=${existingSize}b, command=${newSize}b)`);
      if (VERBOSE) console.log(`  KEEP ${basename}: existing skill (${existingSize}b) >= command (${newSize}b)`);
      return false;
    }
  }

  // Build SKILL.md content
  const skillContent = buildSkillMd(basename, frontmatter, body);

  if (DRY_RUN) {
    console.log(`  [dry-run] ${commandFile} → ${skillFile}`);
    stats.migrated++;
    return true;
  }

  // Create skill directory and write SKILL.md
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillFile, skillContent, 'utf-8');
  stats.migrated++;

  if (VERBOSE) console.log(`  MIGRATE ${basename}`);
  return true;
}

/**
 * Migrate flat skills (skills/*.md → skills/name/SKILL.md)
 */
function migrateFlatSkill(skillFile, skillsDir) {
  const basename = path.basename(skillFile, '.md');
  const skillDir = path.join(skillsDir, basename);
  const targetFile = path.join(skillDir, 'SKILL.md');

  // Skip README files
  if (basename.toLowerCase() === 'readme') return false;

  // Skip if already has folder structure
  if (fs.existsSync(targetFile)) {
    if (VERBOSE) console.log(`  SKIP flat skill ${basename} (folder already exists)`);
    return false;
  }

  const content = fs.readFileSync(skillFile, 'utf-8');

  if (DRY_RUN) {
    console.log(`  [dry-run] flat skill ${skillFile} → ${targetFile}`);
    stats.flatSkills++;
    return true;
  }

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(targetFile, content, 'utf-8');
  stats.flatSkills++;

  if (VERBOSE) console.log(`  RESTRUCTURE flat skill ${basename}`);

  // Remove old flat file
  fs.unlinkSync(skillFile);
  return true;
}

/**
 * Update manifest.json to remove entry.commands
 */
function updateManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return false;

  const content = fs.readFileSync(manifestPath, 'utf-8');
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    console.error(`  ERROR: Invalid JSON in ${manifestPath}`);
    return false;
  }

  if (!manifest.entry?.commands) return false;

  delete manifest.entry.commands;

  // Ensure skills entry exists
  if (!manifest.entry.skills) {
    manifest.entry.skills = 'skills/';
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] Remove entry.commands from ${manifestPath}`);
    stats.manifests++;
    return true;
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  stats.manifests++;

  if (VERBOSE) console.log(`  MANIFEST updated: ${manifestPath}`);
  return true;
}

/**
 * Process a component directory (framework or addon)
 */
function processComponent(componentDir, name) {
  const commandsDir = path.join(componentDir, 'commands');
  const skillsDir = path.join(componentDir, 'skills');
  const manifestPath = path.join(componentDir, 'manifest.json');

  // Check for commands to migrate
  if (!fs.existsSync(commandsDir)) {
    if (VERBOSE) console.log(`  No commands/ directory`);
    return;
  }

  const commandFiles = fs.readdirSync(commandsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(commandsDir, f));

  if (commandFiles.length === 0) {
    if (VERBOSE) console.log(`  No .md files in commands/`);
    return;
  }

  // Ensure skills directory exists
  if (!DRY_RUN) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  // Also check for flat skills that need restructuring
  if (fs.existsSync(skillsDir)) {
    const flatSkills = fs.readdirSync(skillsDir)
      .filter(f => f.endsWith('.md') && !fs.statSync(path.join(skillsDir, f)).isDirectory());

    if (flatSkills.length > 0) {
      console.log(`  Restructuring ${flatSkills.length} flat skills...`);
      for (const f of flatSkills) {
        migrateFlatSkill(path.join(skillsDir, f), skillsDir);
      }
    }
  }

  // Migrate each command
  console.log(`  Migrating ${commandFiles.length} commands...`);
  for (const cmdFile of commandFiles) {
    try {
      migrateCommand(cmdFile, skillsDir);
    } catch (err) {
      stats.errors++;
      console.error(`  ERROR migrating ${cmdFile}: ${err.message}`);
    }
  }

  // Remove command files (not the directory yet — leave for verification)
  if (!DRY_RUN) {
    for (const cmdFile of commandFiles) {
      const basename = path.basename(cmdFile, '.md');
      if (basename.toLowerCase() === 'readme') continue;
      // Only delete if successfully migrated
      const skillDir = path.join(skillsDir, basename, 'SKILL.md');
      if (fs.existsSync(skillDir)) {
        fs.unlinkSync(cmdFile);
      }
    }

    // Also remove non-.md files from commands/ (like manifest.json)
    // but keep the directory for now

    // Check if commands/ is now empty (or only has README)
    const remaining = fs.readdirSync(commandsDir);
    const meaningfulRemaining = remaining.filter(f => f.toLowerCase() !== 'readme.md');
    if (meaningfulRemaining.length === 0) {
      // Remove README if it exists
      for (const f of remaining) {
        fs.unlinkSync(path.join(commandsDir, f));
      }
      // Check for subdirectories or other files
      const finalRemaining = fs.readdirSync(commandsDir);
      if (finalRemaining.length === 0) {
        fs.rmdirSync(commandsDir);
        console.log(`  Removed empty commands/ directory`);
      }
    }
  }

  // Update manifest
  updateManifest(manifestPath);
}

// ============================================================================
// Main
// ============================================================================

console.log(`\n=== Framework/Addon Commands → Skills Migration ===`);
if (DRY_RUN) console.log('MODE: DRY RUN (no files will be modified)\n');
else console.log('');

// Process frameworks
console.log('--- Frameworks ---');
if (fs.existsSync(FRAMEWORKS_DIR)) {
  const frameworks = fs.readdirSync(FRAMEWORKS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  for (const fw of frameworks) {
    console.log(`\n[${fw}]`);
    processComponent(path.join(FRAMEWORKS_DIR, fw), fw);
  }
}

// Process addons
console.log('\n--- Addons ---');
if (fs.existsSync(ADDONS_DIR)) {
  const addons = fs.readdirSync(ADDONS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  for (const addon of addons) {
    console.log(`\n[${addon}]`);
    processComponent(path.join(ADDONS_DIR, addon), addon);
  }
}

// Summary
console.log(`\n=== Migration Summary ===`);
console.log(`Scanned:         ${stats.scanned} commands`);
console.log(`Migrated:        ${stats.migrated} commands → skills`);
console.log(`Collisions:      ${stats.collisions} (command replaced existing skill)`);
console.log(`Skipped:         ${stats.skipped} (existing skill kept or README)`);
console.log(`Flat skills:     ${stats.flatSkills} restructured to folder format`);
console.log(`Manifests:       ${stats.manifests} updated`);
console.log(`Errors:          ${stats.errors}`);

if (stats.details.length > 0) {
  console.log(`\nNotes:`);
  for (const d of stats.details) {
    console.log(`  - ${d}`);
  }
}

if (DRY_RUN) {
  console.log('\n[DRY RUN] No files were modified. Run without --dry-run to apply.');
}

console.log('');
