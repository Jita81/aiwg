#!/usr/bin/env node
/**
 * Collect Component Docs
 *
 * Scans agentic/code/frameworks and agentic/code/addons for component docs/
 * directories and copies the markdown files into docs/frameworks/<name>/
 * and docs/addons/<name>/ so the documentation SPA can serve them.
 *
 * Also updates docs/_manifest.json with navigation entries for any newly
 * discovered files (idempotent — existing entries are preserved).
 *
 * Usage:
 *   node tools/manifest/collect-component-docs.mjs [--dry-run] [--verbose]
 *
 * Options:
 *   --dry-run   Show what would be copied/added without writing anything
 *   --verbose   Print every file checked, not just changes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs');
const MANIFEST_PATH = path.join(DOCS, '_manifest.json');
const AGENTIC = path.join(ROOT, 'agentic', 'code');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) { console.log(msg); }
function verbose(msg) { if (VERBOSE) console.log(msg); }

/**
 * Walk a directory recursively and return all .md files.
 * Returns objects { name, relPath } where relPath is relative to the docs dir
 * (e.g. "quickstart.md" or "examples/coverage.md").
 */
function listDocs(dir, _relPrefix = '') {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) {
      results.push(...listDocs(path.join(dir, e.name), _relPrefix ? `${_relPrefix}/${e.name}` : e.name));
    } else if (e.isFile() && e.name.endsWith('.md')) {
      results.push({ name: e.name, relPath: _relPrefix ? `${_relPrefix}/${e.name}` : e.name });
    }
  }
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/** Discover components under agentic/code/{frameworks,addons}/ that have a docs/ dir. */
function discoverComponents() {
  const components = [];

  // Scan agentic/code/{frameworks,addons}/
  for (const kind of ['frameworks', 'addons']) {
    const kindDir = path.join(AGENTIC, kind);
    if (!fs.existsSync(kindDir)) continue;
    for (const entry of fs.readdirSync(kindDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const docsDir = path.join(kindDir, entry.name, 'docs');
      const files = listDocs(docsDir);
      if (files.length > 0) {
        components.push({ kind, name: entry.name, docsDir, files });
      }
    }
  }

  // Scan tools/*/docs/
  const toolsDir = path.join(ROOT, 'tools');
  if (fs.existsSync(toolsDir)) {
    for (const entry of fs.readdirSync(toolsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const docsDir = path.join(toolsDir, entry.name, 'docs');
      const files = listDocs(docsDir);
      if (files.length > 0) {
        components.push({ kind: 'tools', name: entry.name, docsDir, files });
      }
    }
  }

  return components;
}

/** Ensure a directory exists (no-op if already present). */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Copy a file, creating the target directory if needed. */
function copyFile(src, dest) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dest);
}

// ---------------------------------------------------------------------------
// Manifest helpers
// ---------------------------------------------------------------------------

/** Human-readable title from a filename slug. */
function titleFromSlug(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Generate a summary line for a markdown file by reading its first heading or first paragraph. */
function summaryFromFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue; // skip headings
    if (trimmed.length > 10) return trimmed.replace(/[*_`]/g, '').substring(0, 100);
  }
  return '';
}

/** Section metadata for a component (the parent nav group). */
function componentSection(kind, name, parentId) {
  const titles = {
    // Frameworks
    'sdlc-complete': { title: 'SDLC Complete', summary: 'Full lifecycle framework — internal docs and deep guides' },
    'forensics-complete': { title: 'Forensics Complete', summary: 'Digital forensics methodology and tool reference' },
    'media-curator': { title: 'Media Curator', summary: 'Media archive management guides' },
    'media-marketing-kit': { title: 'Media Marketing Kit', summary: 'Multi-channel campaign management and content operations' },
    'research-complete': { title: 'Research Complete', summary: 'Academic research workflow with GRADE methodology and FAIR compliance' },
    'ops-complete': { title: 'Ops Complete', summary: 'Operational infrastructure framework — YAML-native with sys, it, dev, stream extensions' },
    // Addons
    'ralph': { title: 'Ralph Addon', summary: 'Iterative loop execution — quickstart, best practices, troubleshooting' },
    'rlm': { title: 'RLM Addon', summary: 'Recursive Language Model — deployment, multi-provider, integration guides' },
    'agent-persistence': { title: 'Agent Persistence', summary: 'Cross-session agent state and HITL integration' },
    'aiwg-utils': { title: 'AIWG Utils', summary: 'Core utility rules — subagent scoping, context budget, instruction comprehension' },
    'aiwg-dev': { title: 'AIWG Dev', summary: 'Developer toolkit — validate-component, dev-doctor, link-check, devkit scaffolding' },
    'voice-framework': { title: 'Voice Framework', summary: 'Voice profile documentation — four built-in voices, custom profiles, blending' },
    'testing-quality': { title: 'Testing Quality', summary: 'TDD enforcement, mutation testing, flaky test detection' },
    'daemon': { title: 'Daemon Addon', summary: 'Persistent background agent — web UI, YAML profiles, scheduled tasks, Telegram' },
    'auto-memory': { title: 'Auto Memory', summary: 'Automatic memory management — seed templates, memory evolution, cross-session persistence' },
    'guided-implementation': { title: 'Guided Implementation', summary: 'Controlled iteration loop with escalation on repeated failure' },
    'prose-integration': { title: 'Prose Integration', summary: 'OpenProse contract-driven execution — five skills, obligation semantics' },
    // Tools
    'ralph-external': { title: 'External Ralph', summary: 'Crash-resilient external loop — snapshot manager and provider API' },
  };
  const meta = titles[name] || { title: titleFromSlug(name), summary: '' };
  return {
    id: `${kind}/${name}`,
    title: meta.title,
    summary: meta.summary,
    collapsed: true,
    parent: parentId,
  };
}

/** Section metadata for a single file within a component. */
function fileSection(kind, name, relPath, docsDestDir) {
  // relPath may be "quickstart.md" or "examples/coverage.md"
  const slug = relPath.replace(/\.md$/, '');          // e.g. "quickstart" or "examples/coverage"
  const leafSlug = path.basename(slug);               // e.g. "quickstart" or "coverage"
  const filePath = path.join(docsDestDir, relPath);
  const summary = summaryFromFile(filePath);
  // parent is the component group, or a subdir group for nested files
  const parentId = slug.includes('/') ? `${kind}/${name}/${path.dirname(slug)}` : `${kind}/${name}`;

  const titleOverrides = {
    // General
    'quickstart': 'Quick Start',
    'overview': 'Overview',
    'best-practices': 'Best Practices',
    'troubleshooting': 'Troubleshooting',
    'user-guide': 'User Guide',
    'deployment-guide': 'Deployment Guide',
    'configuration-reference': 'Configuration Reference',
    'extensions-guide': 'Extensions Guide',
    'rules-reference': 'Rules Reference',
    // Ralph
    'cross-loop-learning': 'Cross-Loop Learning',
    'when-to-use-ralph': 'When to Use Ralph',
    'agent-persistence-integration': 'Agent Persistence Integration',
    'executable-feedback-guide': 'Executable Feedback Guide',
    'reflection-memory-guide': 'Reflection & Memory Guide',
    // RLM
    'multi-provider-guide': 'Multi-Provider Guide',
    'ralph-integration': 'Ralph Integration',
    'supervisor-integration': 'Supervisor Integration',
    'taskstore-persistence': 'TaskStore Persistence',
    'messaging-events': 'Messaging Events',
    // Agent persistence
    'hitl-integration': 'HITL Integration',
    // Forensics
    'methodology': 'Methodology',
    'tool-reference': 'Tool Reference',
    'ai-assisted-forensics': 'AI-Assisted Forensics',
    'attack-mapping': 'Attack Mapping',
    'research-guide': 'Research Guide',
    // Media curator
    'standards-reference': 'Standards Reference',
    // SDLC
    'orchestrator-architecture': 'Orchestrator Architecture',
    'agent-design': 'Agent Design',
    'multi-agent-documentation-pattern': 'Multi-Agent Documentation Pattern',
    'production-grade-guide': 'Production Grade Guide',
    'vendor-detection': 'Vendor Detection',
    'token-security': 'Token Security',
    'workspace-cleanup-pattern': 'Workspace Cleanup Pattern',
    'agent-permission-tiers': 'Agent Permission Tiers',
    'agent-permission-rationale': 'Agent Permission Rationale',
    'flow-cleanup-checklist': 'Flow Cleanup Checklist',
    'simple-language-translations': 'Natural Language Reference',
    // Daemon addon
    'daemon-addon-guide': 'Daemon Addon Guide',
    // Examples (subdir)
    'coverage': 'Coverage Example',
    'test-fix-loop': 'Test-Fix Loop Example',
    'migration': 'Migration Example',
  };

  return {
    id: `${kind}/${name}/${slug}`,
    title: titleOverrides[leafSlug] || titleFromSlug(leafSlug),
    summary,
    file: `${kind}/${name}/${relPath}`,
    parent: parentId,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  log(DRY_RUN ? '[dry-run] Collect component docs' : 'Collecting component docs...');

  const components = discoverComponents();
  if (components.length === 0) {
    log('No component docs found.');
    return;
  }

  // Read existing manifest
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    console.error('Could not read docs/_manifest.json');
    process.exit(1);
  }

  const existingIds = new Set((manifest.sections || []).map(s => s.id));
  const existingOrder = new Set(manifest.order || []);

  const newSections = [];
  const newOrderEntries = [];
  let copied = 0;
  let skipped = 0;

  for (const { kind, name, docsDir, files } of components) {
    const destDir = path.join(DOCS, kind, name);

    log(`\n${kind}/${name} (${files.length} docs)`);

    // Ensure parent group section exists
    const groupId = `${kind}/${name}`;
    const parentId = kind; // "frameworks" or "addons" — must already exist in manifest
    if (!existingIds.has(groupId)) {
      const section = componentSection(kind, name, parentId);
      newSections.push(section);
      existingIds.add(groupId);
      if (!existingOrder.has(groupId)) {
        newOrderEntries.push(groupId);
        existingOrder.add(groupId);
      }
      log(`  + section: ${groupId}`);
    }

    for (const { name: filename, relPath } of files) {
      const src = path.join(docsDir, relPath);
      const dest = path.join(destDir, relPath);
      const fileId = `${kind}/${name}/${relPath.replace(/\.md$/, '')}`;

      // Ensure intermediate subdirectory group sections exist for nested files
      const relDir = path.dirname(relPath);
      if (relDir !== '.') {
        const subdirId = `${kind}/${name}/${relDir}`;
        if (!existingIds.has(subdirId)) {
          newSections.push({
            id: subdirId,
            title: titleFromSlug(relDir),
            summary: '',
            collapsed: true,
            parent: groupId,
          });
          existingIds.add(subdirId);
          if (!existingOrder.has(subdirId)) {
            newOrderEntries.push(subdirId);
            existingOrder.add(subdirId);
          }
          log(`  + section: ${subdirId}`);
        }
      }

      // Copy the file
      if (!DRY_RUN) {
        ensureDir(path.dirname(dest));
        fs.copyFileSync(src, dest);
        verbose(`  copied: ${kind}/${name}/${relPath}`);
        copied++;
      } else {
        log(`  [copy] ${src} → docs/${kind}/${name}/${relPath}`);
        copied++;
      }

      // Add manifest section if not present
      if (!existingIds.has(fileId)) {
        const section = fileSection(kind, name, relPath, destDir);
        newSections.push(section);
        existingIds.add(fileId);
        if (!existingOrder.has(fileId)) {
          newOrderEntries.push(fileId);
          existingOrder.add(fileId);
        }
        log(`  + section: ${fileId}`);
      } else {
        skipped++;
        verbose(`  (exists): ${fileId}`);
      }
    }
  }

  // Inject new sections and order entries into manifest
  if (newSections.length > 0 && !DRY_RUN) {
    manifest.sections = [...(manifest.sections || []), ...newSections];
    manifest.order = [...(manifest.order || []), ...newOrderEntries];
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    log(`\nUpdated docs/_manifest.json (+${newSections.length} sections)`);
  } else if (newSections.length > 0 && DRY_RUN) {
    log(`\n[dry-run] Would add ${newSections.length} sections to docs/_manifest.json`);
  } else {
    log('\nManifest already up to date.');
  }

  log(`\nDone: ${copied} files ${DRY_RUN ? 'would be ' : ''}copied, ${skipped} sections already present.`);

  // Emit a docs-sources.json for reference
  if (!DRY_RUN) {
    const sourcesPath = path.join(DOCS, 'docs-sources.json');
    const sources = components.map(({ kind, name, docsDir, files }) => ({
      kind,
      name,
      source: path.relative(ROOT, docsDir),
      dest: `docs/${kind}/${name}`,
      files: files.map(f => f.relPath),
    }));
    fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + '\n', 'utf8');
    log(`Wrote docs/docs-sources.json (${sources.length} components)`);
  }
}

main();
