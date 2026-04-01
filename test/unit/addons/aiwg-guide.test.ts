import { describe, it, expect } from 'vitest';
import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';

const SKILL_PATH = 'agentic/code/addons/aiwg-utils/skills/aiwg-guide';
const SKILL_FILE = join(SKILL_PATH, 'SKILL.md');
const ADDON_MANIFEST = 'agentic/code/addons/aiwg-utils/manifest.json';
const SKILLS_MANIFEST = 'agentic/code/addons/aiwg-utils/skills/manifest.json';

describe('aiwg-guide skill (#616)', () => {
  describe('skill file', () => {
    it('should exist at the expected path', async () => {
      await expect(access(SKILL_FILE, constants.F_OK)).resolves.toBeUndefined();
    });

    it('should have valid YAML frontmatter', async () => {
      const content = await readFile(SKILL_FILE, 'utf-8');
      expect(content).toMatch(/^---\n/);
      expect(content).toMatch(/\n---\n/);
    });

    it('should declare required frontmatter fields', async () => {
      const content = await readFile(SKILL_FILE, 'utf-8');
      expect(content).toMatch(/description:/);
      expect(content).toMatch(/commandHint:/);
      expect(content).toMatch(/platforms:/);
    });

    it('should list all 9 platforms', async () => {
      const content = await readFile(SKILL_FILE, 'utf-8');
      const platforms = [
        'claude-code', 'codex', 'copilot', 'factory',
        'cursor', 'opencode', 'warp', 'windsurf', 'openclaw',
      ];
      for (const platform of platforms) {
        expect(content, `missing platform: ${platform}`).toContain(platform);
      }
    });
  });

  describe('default mode (what\'s new)', () => {
    it('should document version detection via aiwg version', async () => {
      const content = await readFile(SKILL_FILE, 'utf-8');
      expect(content).toContain('aiwg version');
    });

    it('should reference docs/releases/ for release announcements', async () => {
      const content = await readFile(SKILL_FILE, 'utf-8');
      expect(content).toContain('docs/releases/');
      expect(content).toMatch(/v\{version\}-announcement\.md/);
    });

    it('should define fallback behavior when announcement not found', async () => {
      const content = await readFile(SKILL_FILE, 'utf-8');
      expect(content).toMatch(/fallback/i);
      expect(content).toContain('CHANGELOG.md');
    });
  });

  describe('contextual help mode', () => {
    it('should define prioritized documentation sources', async () => {
      const content = await readFile(SKILL_FILE, 'utf-8');
      // Priority sources from issue spec
      expect(content).toContain('docs/cli-reference.md');
      expect(content).toContain('docs/extensions/');
      expect(content).toContain('capability-matrix');
    });

    it('should include example interactions', async () => {
      const content = await readFile(SKILL_FILE, 'utf-8');
      expect(content).toMatch(/how do I/i);
      expect(content).toMatch(/what providers support/i);
      expect(content).toMatch(/what is/i);
    });
  });

  describe('steward handoff', () => {
    it('should define handoff detection patterns', async () => {
      const content = await readFile(SKILL_FILE, 'utf-8');
      expect(content).toContain('Steward Handoff');
      expect(content).toContain('aiwg list');
      expect(content).toContain('aiwg doctor');
    });

    it('should describe transparent handoff protocol', async () => {
      const content = await readFile(SKILL_FILE, 'utf-8');
      expect(content).toMatch(/transparent/i);
      expect(content).toMatch(/handoff.*protocol/i);
    });
  });

  describe('addon manifest registration', () => {
    it('should be listed in addon manifest skills array', async () => {
      const content = await readFile(ADDON_MANIFEST, 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.skills).toContain('aiwg-guide');
    });

    it('should be registered in skills manifest with triggers', async () => {
      const content = await readFile(SKILLS_MANIFEST, 'utf-8');
      const manifest = JSON.parse(content);
      const entry = manifest.skills.find(
        (s: { name: string }) => s.name === 'aiwg-guide'
      );
      expect(entry).toBeDefined();
      expect(entry.description).toBeDefined();
      expect(entry.triggers).toBeDefined();
      expect(entry.triggers.length).toBeGreaterThan(0);
    });
  });
});
