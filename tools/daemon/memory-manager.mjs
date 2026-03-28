/**
 * MemoryManager — Cross-session memory for daemon persistent context
 *
 * Three memory scopes:
 *   session  — in-memory only, cleared on daemon stop
 *   project  — .aiwg/daemon/memory/ (project-local, committed with project)
 *   user     — ~/.aiwg/daemon/memory/ (global user preferences)
 *
 * Format mirrors the auto-memory pattern:
 *   MEMORY.md     — index of all entries (one line per entry)
 *   <key>.md      — individual memory file with YAML frontmatter
 *
 * @implements Issue #608
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const MEMORY_INDEX_FILE = 'MEMORY.md';
const MAX_SESSION_ENTRIES = 100;

// Safety: never write these patterns to persistent memory
const FORBIDDEN_PATTERNS = [
  /token\s*[:=]/i,
  /password\s*[:=]/i,
  /secret\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
  /bearer\s+[a-z0-9._-]{10,}/i,
  /-----BEGIN\s+(RSA|EC|OPENSSH|PRIVATE)/i,
];

export class MemoryManager {
  /**
   * @param {object} opts
   * @param {string} [opts.projectRoot]  — project working directory (default: cwd)
   * @param {string} [opts.userHome]     — user home for user-scope storage (default: os.homedir())
   */
  constructor(opts = {}) {
    this.projectRoot = opts.projectRoot || process.cwd();
    this.userHome = opts.userHome || os.homedir();

    this.paths = {
      project: path.join(this.projectRoot, '.aiwg', 'daemon', 'memory'),
      user: path.join(this.userHome, '.aiwg', 'daemon', 'memory'),
    };

    // Session scope: in-memory only, never written to disk
    this._session = new Map(); // key -> { name, description, content, updatedAt }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Load project and user memory indexes into an in-memory summary.
   * Called at daemon/session start. Safe to call when directories don't exist yet.
   *
   * @returns {{ project: object[], user: object[] }}
   */
  load() {
    return {
      project: this._loadIndex(this.paths.project),
      user: this._loadIndex(this.paths.user),
    };
  }

  /**
   * Flush session-scope entries to project memory as a session log entry.
   * Called at daemon shutdown or end of concierge session.
   *
   * @param {object} [summary] — optional summary metadata (taskCount, duration, etc.)
   */
  flushSession(summary = {}) {
    if (this._session.size === 0) return;

    const lines = [];
    for (const [key, entry] of this._session) {
      lines.push(`- **${entry.name || key}**: ${entry.description || entry.content?.slice(0, 80) || '(no description)'}`);
    }

    const content = [
      `Session ended: ${new Date().toISOString()}`,
      summary.taskCount ? `Tasks completed: ${summary.taskCount}` : '',
      summary.duration ? `Duration: ${summary.duration}` : '',
      '',
      '### Session Events',
      ...lines,
    ].filter(Boolean).join('\n');

    this.write('project', 'session_log', content, {
      name: 'Session Log',
      description: `Session summary — ${new Date().toLocaleDateString()}`,
      type: 'project',
    });

    this._session.clear();
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /**
   * Write a memory entry to the specified scope.
   *
   * @param {'session'|'project'|'user'} scope
   * @param {string} key     — filename stem (e.g. 'user_preferences', 'project_context')
   * @param {string} content — markdown body
   * @param {object} [meta]  — { name, description, type }
   * @returns {{ scope, key, path: string|null }}
   */
  write(scope, key, content, meta = {}) {
    this._validateContent(content);
    this._validateKey(key);

    const entry = {
      name: meta.name || key,
      description: meta.description || '',
      type: meta.type || scope,
      content,
      updatedAt: new Date().toISOString(),
    };

    if (scope === 'session') {
      if (this._session.size >= MAX_SESSION_ENTRIES) {
        // Drop the oldest entry
        const oldest = this._session.keys().next().value;
        this._session.delete(oldest);
      }
      this._session.set(key, entry);
      return { scope, key, path: null };
    }

    const dir = this.paths[scope];
    if (!dir) throw new Error(`Unknown memory scope: ${scope}`);

    this._ensureDir(dir);

    const filePath = path.join(dir, `${key}.md`);
    const fileContent = this._renderMemoryFile(entry);
    this._writeAtomic(filePath, fileContent);
    this._updateIndex(dir, key, entry);

    return { scope, key, path: filePath };
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * Read a single memory entry by scope and key.
   *
   * @param {'session'|'project'|'user'} scope
   * @param {string} key
   * @returns {{ name, description, type, content, updatedAt }|null}
   */
  read(scope, key) {
    if (scope === 'session') {
      return this._session.get(key) || null;
    }

    const dir = this.paths[scope];
    if (!dir) return null;

    const filePath = path.join(dir, `${key}.md`);
    if (!fs.existsSync(filePath)) return null;

    return this._parseMemoryFile(fs.readFileSync(filePath, 'utf8'));
  }

  /**
   * Build a formatted context string for injection into a concierge session preamble.
   * Includes user-scope and project-scope memory. Session scope is omitted (it's live).
   *
   * @returns {string}
   */
  getContext() {
    const sections = [];

    const userEntries = this._loadEntries(this.paths.user);
    if (userEntries.length > 0) {
      sections.push('## User Memory\n');
      for (const e of userEntries) {
        sections.push(`### ${e.name}\n${e.content}\n`);
      }
    }

    const projectEntries = this._loadEntries(this.paths.project);
    if (projectEntries.length > 0) {
      sections.push('## Project Memory\n');
      for (const e of projectEntries) {
        sections.push(`### ${e.name}\n${e.content}\n`);
      }
    }

    if (sections.length === 0) return '';

    return ['# Daemon Memory Context\n', ...sections].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Show / Clear
  // ---------------------------------------------------------------------------

  /**
   * Return a structured summary of all memory scopes for display.
   *
   * @param {string} [scope] — restrict to one scope; omit for all
   * @returns {object}
   */
  show(scope) {
    const scopes = scope ? [scope] : ['session', 'project', 'user'];
    const result = {};

    for (const s of scopes) {
      if (s === 'session') {
        result.session = {
          entries: Array.from(this._session.entries()).map(([key, e]) => ({
            key,
            name: e.name,
            description: e.description,
            updatedAt: e.updatedAt,
          })),
          count: this._session.size,
        };
      } else {
        const dir = this.paths[s];
        const entries = dir ? this._loadIndex(dir) : [];
        result[s] = {
          path: dir || null,
          entries,
          count: entries.length,
        };
      }
    }

    return result;
  }

  /**
   * Clear memory for a given scope.
   *
   * @param {'session'|'project'|'user'} scope
   * @returns {{ scope, cleared: number }}
   */
  clear(scope) {
    if (scope === 'session') {
      const count = this._session.size;
      this._session.clear();
      return { scope, cleared: count };
    }

    const dir = this.paths[scope];
    if (!dir) throw new Error(`Unknown memory scope: ${scope}`);

    if (!fs.existsSync(dir)) return { scope, cleared: 0 };

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      fs.unlinkSync(path.join(dir, f));
    }

    return { scope, cleared: files.length };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _writeAtomic(filePath, content) {
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
  }

  _renderMemoryFile(entry) {
    return [
      '---',
      `name: ${entry.name}`,
      `description: ${entry.description}`,
      `type: ${entry.type}`,
      `updated_at: ${entry.updatedAt}`,
      '---',
      '',
      entry.content,
      '',
    ].join('\n');
  }

  _parseMemoryFile(raw) {
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      return { name: '', description: '', type: '', content: raw.trim(), updatedAt: '' };
    }

    const meta = {};
    for (const line of frontmatterMatch[1].split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      meta[key] = val;
    }

    return {
      name: meta.name || '',
      description: meta.description || '',
      type: meta.type || '',
      content: frontmatterMatch[2].trim(),
      updatedAt: meta.updated_at || '',
    };
  }

  _updateIndex(dir, key, entry) {
    const indexPath = path.join(dir, MEMORY_INDEX_FILE);
    let lines = [];

    if (fs.existsSync(indexPath)) {
      lines = fs.readFileSync(indexPath, 'utf8')
        .split('\n')
        .filter(l => l.trim())
        // Remove existing entry for this key
        .filter(l => !l.includes(`](${key}.md)`));
    }

    const hook = entry.description?.slice(0, 120) || entry.name;
    lines.push(`- [${entry.name}](${key}.md) — ${hook}`);

    const header = '# Daemon Memory Index\n';
    this._writeAtomic(indexPath, header + '\n' + lines.join('\n') + '\n');
  }

  _loadIndex(dir) {
    if (!dir || !fs.existsSync(dir)) return [];

    const indexPath = path.join(dir, MEMORY_INDEX_FILE);
    if (!fs.existsSync(indexPath)) return [];

    const lines = fs.readFileSync(indexPath, 'utf8')
      .split('\n')
      .filter(l => l.startsWith('- ['));

    return lines.map(line => {
      const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\)\s*—?\s*(.*)/);
      if (!match) return null;
      return { name: match[1], file: match[2], description: match[3].trim() };
    }).filter(Boolean);
  }

  _loadEntries(dir) {
    const index = this._loadIndex(dir);
    return index.map(({ file }) => {
      const filePath = path.join(dir, file);
      if (!fs.existsSync(filePath)) return null;
      try {
        return this._parseMemoryFile(fs.readFileSync(filePath, 'utf8'));
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  _validateContent(content) {
    if (typeof content !== 'string') throw new Error('Memory content must be a string');
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        throw new Error('Memory content must not contain secrets, tokens, or credentials');
      }
    }
  }

  _validateKey(key) {
    if (!/^[a-z0-9_-]+$/.test(key)) {
      throw new Error(`Invalid memory key "${key}": use lowercase letters, digits, hyphens, underscores only`);
    }
  }
}
