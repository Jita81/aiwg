/**
 * Unit tests for MemoryManager — cross-session memory (Issue #608)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MemoryManager } from '../../../tools/daemon/memory-manager.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aiwg-memory-test-'));
}

function cleanDir(dir: string): void {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryManager', () => {
  let tmpProject: string;
  let tmpHome: string;
  let mgr: InstanceType<typeof MemoryManager>;

  beforeEach(() => {
    tmpProject = makeTmpDir();
    tmpHome = makeTmpDir();
    mgr = new MemoryManager({ projectRoot: tmpProject, userHome: tmpHome });
  });

  afterEach(() => {
    cleanDir(tmpProject);
    cleanDir(tmpHome);
  });

  // -------------------------------------------------------------------------
  // Session scope (in-memory)
  // -------------------------------------------------------------------------

  describe('session scope', () => {
    it('stores and retrieves entries without touching disk', () => {
      mgr.write('session', 'test_key', 'some content', { name: 'Test', description: 'test entry' });
      const entry = mgr.read('session', 'test_key');
      expect(entry).not.toBeNull();
      expect(entry!.content).toBe('some content');
      expect(entry!.name).toBe('Test');

      // Nothing written to disk
      expect(fs.existsSync(path.join(tmpProject, '.aiwg', 'daemon', 'memory'))).toBe(false);
    });

    it('returns null for missing key', () => {
      expect(mgr.read('session', 'nonexistent')).toBeNull();
    });

    it('clears session entries', () => {
      mgr.write('session', 'a', 'content a');
      mgr.write('session', 'b', 'content b');
      const result = mgr.clear('session');
      expect(result.cleared).toBe(2);
      expect(mgr.read('session', 'a')).toBeNull();
    });

    it('shows session entries with count', () => {
      mgr.write('session', 'pref_1', 'value 1', { name: 'Pref 1' });
      const shown = mgr.show('session');
      expect(shown.session.count).toBe(1);
      expect(shown.session.entries[0].key).toBe('pref_1');
    });

    it('evicts oldest entry when session cap is exceeded', () => {
      for (let i = 0; i < 101; i++) {
        mgr.write('session', `key_${i}`, `content ${i}`);
      }
      expect(mgr.read('session', 'key_0')).toBeNull();
      expect(mgr.read('session', 'key_100')).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Project scope (disk)
  // -------------------------------------------------------------------------

  describe('project scope', () => {
    it('writes a file with YAML frontmatter', () => {
      mgr.write('project', 'project_context', 'We are in Construction phase.', {
        name: 'Project Context',
        description: 'Current phase and active work',
        type: 'project',
      });

      const filePath = path.join(tmpProject, '.aiwg', 'daemon', 'memory', 'project_context.md');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('name: Project Context');
      expect(content).toContain('We are in Construction phase.');
    });

    it('writes and updates MEMORY.md index', () => {
      mgr.write('project', 'project_context', 'Phase: Construction');
      mgr.write('project', 'session_log', 'Last session: completed 3 tasks');

      const indexPath = path.join(tmpProject, '.aiwg', 'daemon', 'memory', 'MEMORY.md');
      expect(fs.existsSync(indexPath)).toBe(true);

      const index = fs.readFileSync(indexPath, 'utf8');
      expect(index).toContain('project_context.md');
      expect(index).toContain('session_log.md');
    });

    it('updates existing entry (overwrites file, deduplicates index)', () => {
      mgr.write('project', 'project_context', 'Phase: Elaboration');
      mgr.write('project', 'project_context', 'Phase: Construction');

      const indexPath = path.join(tmpProject, '.aiwg', 'daemon', 'memory', 'MEMORY.md');
      const index = fs.readFileSync(indexPath, 'utf8');
      const occurrences = (index.match(/project_context\.md/g) || []).length;
      expect(occurrences).toBe(1);

      const entry = mgr.read('project', 'project_context');
      expect(entry!.content).toBe('Phase: Construction');
    });

    it('clears all files in project scope', () => {
      mgr.write('project', 'foo', 'foo content');
      mgr.write('project', 'bar', 'bar content');
      const result = mgr.clear('project');
      expect(result.cleared).toBeGreaterThanOrEqual(2);

      const dir = path.join(tmpProject, '.aiwg', 'daemon', 'memory');
      expect(fs.readdirSync(dir).filter(f => f.endsWith('.md'))).toHaveLength(0);
    });

    it('load() returns index entries', () => {
      mgr.write('project', 'project_context', 'Construction phase');
      const snapshot = mgr.load();
      expect(snapshot.project).toHaveLength(1);
      expect(snapshot.project[0].name).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // User scope (disk)
  // -------------------------------------------------------------------------

  describe('user scope', () => {
    it('writes to ~/.aiwg/daemon/memory/', () => {
      mgr.write('user', 'user_preferences', 'Prefer concise responses.', {
        name: 'User Preferences',
        description: 'Tone and verbosity',
      });

      const filePath = path.join(tmpHome, '.aiwg', 'daemon', 'memory', 'user_preferences.md');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('load() returns user entries separately from project entries', () => {
      mgr.write('user', 'user_preferences', 'Keep it brief.');
      mgr.write('project', 'project_context', 'Construction phase.');

      const snapshot = mgr.load();
      expect(snapshot.user).toHaveLength(1);
      expect(snapshot.project).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // getContext — concierge preamble injection
  // -------------------------------------------------------------------------

  describe('getContext()', () => {
    it('returns empty string when no persistent memory exists', () => {
      expect(mgr.getContext()).toBe('');
    });

    it('includes user and project entries in formatted output', () => {
      mgr.write('user', 'user_preferences', 'I prefer concise responses.', { name: 'User Preferences' });
      mgr.write('project', 'project_context', 'We are in Construction phase.', { name: 'Project Context' });

      const ctx = mgr.getContext();
      expect(ctx).toContain('## User Memory');
      expect(ctx).toContain('User Preferences');
      expect(ctx).toContain('I prefer concise responses.');
      expect(ctx).toContain('## Project Memory');
      expect(ctx).toContain('Project Context');
      expect(ctx).toContain('We are in Construction phase.');
    });

    it('does not include session scope in context output', () => {
      mgr.write('session', 'live_state', 'current task: foo');
      const ctx = mgr.getContext();
      expect(ctx).not.toContain('live_state');
      expect(ctx).not.toContain('current task: foo');
    });
  });

  // -------------------------------------------------------------------------
  // flushSession — session to project on shutdown
  // -------------------------------------------------------------------------

  describe('flushSession()', () => {
    it('writes session entries to project scope as session_log', () => {
      mgr.write('session', 'completed_task', 'Fixed auth bug in token.ts');
      mgr.flushSession({ taskCount: 1, duration: '300s' });

      const entry = mgr.read('project', 'session_log');
      expect(entry).not.toBeNull();
      expect(entry!.content).toContain('Fixed auth bug in token.ts');
    });

    it('clears session scope after flush', () => {
      mgr.write('session', 'task', 'content');
      mgr.flushSession();
      expect(mgr.show('session').session.count).toBe(0);
    });

    it('is a no-op when session is empty', () => {
      expect(() => mgr.flushSession()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Security: no secrets in persistent memory
  // -------------------------------------------------------------------------

  describe('security', () => {
    const secretCases: [string, string][] = [
      ['token: abc123secret', 'token pattern'],
      ['password: hunter2', 'password pattern'],
      ['secret: mysecret', 'secret pattern'],
      ['API_KEY=sk-proj-abc123', 'api key pattern'],
      ['Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.longtoken', 'bearer token'],
      ['-----BEGIN RSA PRIVATE KEY-----', 'private key'],
    ];

    for (const [content, label] of secretCases) {
      it(`rejects ${label} in project scope`, () => {
        expect(() => mgr.write('project', 'bad_key', content)).toThrow(/secret|token|credential/i);
      });

      it(`rejects ${label} in user scope`, () => {
        expect(() => mgr.write('user', 'bad_key', content)).toThrow(/secret|token|credential/i);
      });

      it(`rejects ${label} in session scope`, () => {
        expect(() => mgr.write('session', 'bad_key', content)).toThrow(/secret|token|credential/i);
      });
    }

    it('accepts normal content without credentials', () => {
      expect(() => mgr.write('project', 'safe_key', 'The user prefers concise responses.')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Key validation
  // -------------------------------------------------------------------------

  describe('key validation', () => {
    it('accepts valid keys', () => {
      expect(() => mgr.write('session', 'valid_key', 'content')).not.toThrow();
      expect(() => mgr.write('session', 'valid-key-123', 'content')).not.toThrow();
    });

    it('rejects keys with invalid characters', () => {
      expect(() => mgr.write('session', 'invalid key', 'content')).toThrow(/Invalid memory key/);
      expect(() => mgr.write('session', '../evil', 'content')).toThrow(/Invalid memory key/);
      expect(() => mgr.write('session', 'UPPERCASE', 'content')).toThrow(/Invalid memory key/);
    });
  });

  // -------------------------------------------------------------------------
  // show() — multi-scope display
  // -------------------------------------------------------------------------

  describe('show()', () => {
    it('returns all three scopes when no scope specified', () => {
      const result = mgr.show();
      expect(result).toHaveProperty('session');
      expect(result).toHaveProperty('project');
      expect(result).toHaveProperty('user');
    });

    it('returns only the requested scope', () => {
      const result = mgr.show('user');
      expect(result).toHaveProperty('user');
      expect(result).not.toHaveProperty('session');
      expect(result).not.toHaveProperty('project');
    });

    it('includes path for project and user scopes', () => {
      const result = mgr.show();
      expect(result.project.path).toContain('.aiwg/daemon/memory');
      expect(result.user.path).toContain('.aiwg/daemon/memory');
    });
  });

  // -------------------------------------------------------------------------
  // Integration: preference survives restart (simulate via new MemoryManager instance)
  // -------------------------------------------------------------------------

  describe('session restart simulation', () => {
    it('recalls user preferences across simulated daemon restarts', () => {
      mgr.write('user', 'user_preferences', 'I prefer brief, direct answers.', {
        name: 'User Preferences',
        description: 'Communication style',
      });

      // Simulate restart with new instance pointing at same dirs
      const mgr2 = new MemoryManager({ projectRoot: tmpProject, userHome: tmpHome });
      const snapshot = mgr2.load();
      expect(snapshot.user).toHaveLength(1);
      expect(snapshot.user[0].name).toBeTruthy();

      const ctx = mgr2.getContext();
      expect(ctx).toContain('I prefer brief, direct answers.');
    });

    it('recalls project context across simulated daemon restarts', () => {
      mgr.write('project', 'project_context', 'Active sprint: S4. Focus area: auth module.', {
        name: 'Project Context',
      });

      const mgr2 = new MemoryManager({ projectRoot: tmpProject, userHome: tmpHome });
      const ctx = mgr2.getContext();
      expect(ctx).toContain('Active sprint: S4');
    });
  });
});
