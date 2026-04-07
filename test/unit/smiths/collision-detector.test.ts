/**
 * Collision Detector Tests
 *
 * Tests for #698: pre-deployment collision detection.
 *
 * @implements #698
 * @source @src/smiths/skillsmith/collision-detector.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  checkCollisions,
  formatCollisionReport,
  hasBlockingCollisions,
} from '../../../src/smiths/skillsmith/collision-detector.js';

async function mkTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aiwg-collision-test-'));
}

describe('checkCollisions', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkTmpDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns no results when target paths do not exist', async () => {
    const results = await checkCollisions({
      platform: 'claude',
      projectPath: tmpDir,
      skillNames: ['aiwg-project-status', 'aiwg-intake-wizard'],
      namespace: 'aiwg',
      skillsBaseDir: path.join(tmpDir, '.claude/skills/aiwg'),
    });
    expect(results).toHaveLength(0);
  });

  it('does NOT block aiwg-prefixed slugs that share names with AIWG CLI commands', async () => {
    // Per docs/migration/skill-namespace-migration.md, `/aiwg-doctor` IS the canonical
    // slug for the doctor skill (since bare `doctor` collides with Claude's built-in).
    // Slash commands and shell CLI commands live on different surfaces and do not collide.
    const cliNames = ['aiwg-sync', 'aiwg-doctor', 'aiwg-run', 'aiwg-list', 'aiwg-update', 'aiwg-use'];
    const results = await checkCollisions({
      platform: 'claude',
      projectPath: tmpDir,
      skillNames: cliNames,
      namespace: 'aiwg',
      skillsBaseDir: path.join(tmpDir, '.claude/skills/aiwg'),
    });
    // None of these should be blocked — target paths don't exist and they're properly namespaced
    expect(results).toHaveLength(0);
  });

  it('returns error for Claude Code built-in collision', async () => {
    const results = await checkCollisions({
      platform: 'claude',
      projectPath: tmpDir,
      // 'help' without namespace prefix — direct built-in match
      skillNames: ['help'],
      namespace: 'aiwg',
      skillsBaseDir: path.join(tmpDir, '.claude/skills'),
    });
    const err = results.find((r) => r.skillName === 'help');
    expect(err).toBeDefined();
    expect(err!.severity).toBe('error');
  });

  it('returns info for existing AIWG-owned skill (namespace in frontmatter)', async () => {
    const skillDir = path.join(tmpDir, '.claude/skills/aiwg', 'aiwg-project-status');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nnamespace: aiwg\nname: project-status\n---\n# Project Status\n'
    );

    const results = await checkCollisions({
      platform: 'claude',
      projectPath: tmpDir,
      skillNames: ['aiwg-project-status'],
      namespace: 'aiwg',
      skillsBaseDir: path.join(tmpDir, '.claude/skills/aiwg'),
    });
    const r = results.find((r) => r.skillName === 'aiwg-project-status');
    expect(r).toBeDefined();
    expect(r!.severity).toBe('info');
    expect(r!.blocksDeployment).toBe(false);
  });

  it('returns warn for existing user-owned skill (no namespace)', async () => {
    const skillDir = path.join(tmpDir, '.claude/skills', 'my-custom-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: my-custom-skill\n---\n# My Custom Skill\n'
    );

    const results = await checkCollisions({
      platform: 'claude',
      projectPath: tmpDir,
      skillNames: ['my-custom-skill'],
      namespace: 'aiwg',
      skillsBaseDir: path.join(tmpDir, '.claude/skills'),
    });
    const r = results.find((r) => r.skillName === 'my-custom-skill');
    expect(r).toBeDefined();
    expect(r!.severity).toBe('warn');
    expect(r!.blocksDeployment).toBe(false);
  });
});

describe('hasBlockingCollisions', () => {
  it('returns true when any result blocks deployment', () => {
    const results = [
      { skillName: 'a', targetPath: '/x', severity: 'warn' as const, reason: '', blocksDeployment: false },
      { skillName: 'b', targetPath: '/y', severity: 'error' as const, reason: '', blocksDeployment: true },
    ];
    expect(hasBlockingCollisions(results)).toBe(true);
  });

  it('returns false when no results block deployment', () => {
    const results = [
      { skillName: 'a', targetPath: '/x', severity: 'warn' as const, reason: '', blocksDeployment: false },
    ];
    expect(hasBlockingCollisions(results)).toBe(false);
  });

  it('returns false for empty results', () => {
    expect(hasBlockingCollisions([])).toBe(false);
  });
});

describe('formatCollisionReport', () => {
  it('returns empty string for empty results', () => {
    expect(formatCollisionReport([])).toBe('');
  });

  it('includes ERROR section for blocking collisions', () => {
    const report = formatCollisionReport([
      { skillName: 'aiwg-sync', targetPath: '/x', severity: 'error', reason: 'shadows CLI', blocksDeployment: true },
    ]);
    expect(report).toContain('ERROR');
    expect(report).toContain('aiwg-sync');
  });

  it('includes WARNING section for warn-level collisions', () => {
    const report = formatCollisionReport([
      { skillName: 'my-skill', targetPath: '/x', severity: 'warn', reason: 'user owned', blocksDeployment: false },
    ]);
    expect(report).toContain('WARNING');
    expect(report).toContain('--force');
  });
});
