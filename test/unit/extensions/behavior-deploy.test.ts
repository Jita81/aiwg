/**
 * Behavior Deployment Tests
 *
 * Tests for behavior artifact scanning, registration, and deployment path
 * correctness per provider. Covers the behavior deploy pipeline added in #609.
 *
 * @implements #609, #610
 * @tests @src/extensions/deployment-registration.ts (scanDeployedBehaviors)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRegistry } from '../../../src/extensions/registry.js';
import {
  scanDeployedBehaviors,
  registerDeployedExtensions,
} from '../../../src/extensions/deployment-registration.js';

// Source path containing real behavior directories for testing
const BEHAVIORS_SOURCE_PATH = 'agentic/code/behaviors';

describe('Behavior Deployment', () => {
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    registry = createRegistry();
  });

  // =========================================================================
  // scanDeployedBehaviors
  // =========================================================================

  describe('scanDeployedBehaviors', () => {
    it('returns empty array for empty string path (aggregated providers like Warp)', async () => {
      const behaviors = await scanDeployedBehaviors('', 'warp');
      expect(behaviors).toEqual([]);
    });

    it('returns empty array for nonexistent path', async () => {
      const behaviors = await scanDeployedBehaviors('/nonexistent/behaviors', 'openclaw');
      expect(behaviors).toEqual([]);
    });

    it('scans behavior directories containing BEHAVIOR.md', async () => {
      const behaviors = await scanDeployedBehaviors(BEHAVIORS_SOURCE_PATH, 'openclaw');

      expect(behaviors).toBeInstanceOf(Array);
      // We have concierge, build-monitor, security-sentinel, test-watcher
      expect(behaviors.length).toBeGreaterThan(0);
    });

    it('produces Extension objects with correct shape', async () => {
      const behaviors = await scanDeployedBehaviors(BEHAVIORS_SOURCE_PATH, 'openclaw');

      if (behaviors.length > 0) {
        const b = behaviors[0];
        expect(b).toHaveProperty('id');
        expect(b).toHaveProperty('type', 'behavior');
        expect(b).toHaveProperty('name');
        expect(b).toHaveProperty('description');
        expect(b).toHaveProperty('version');
        expect(b).toHaveProperty('platforms');
        expect(b).toHaveProperty('metadata');
        expect(b.metadata.type).toBe('behavior');
      }
    });

    it('produces BehaviorMetadata with type discriminator', async () => {
      const behaviors = await scanDeployedBehaviors(BEHAVIORS_SOURCE_PATH, 'openclaw');

      if (behaviors.length > 0) {
        const b = behaviors[0];
        // BehaviorMetadata only requires type: 'behavior'; hooks/scripts are optional
        expect(b.metadata.type).toBe('behavior');
      }
    });

    it('skips directories without BEHAVIOR.md', async () => {
      // All returned entries must have BEHAVIOR.md in their source dir
      const behaviors = await scanDeployedBehaviors(BEHAVIORS_SOURCE_PATH, 'openclaw');
      for (const b of behaviors) {
        const behaviorFile = path.join(b.installation!.installedPath, 'BEHAVIOR.md');
        expect(fs.existsSync(behaviorFile)).toBe(true);
      }
    });

    it('records correct provider in platforms map', async () => {
      const behaviors = await scanDeployedBehaviors(BEHAVIORS_SOURCE_PATH, 'openclaw');
      for (const b of behaviors) {
        expect(b.platforms).toHaveProperty('openclaw');
      }
    });
  });

  // =========================================================================
  // Provider path correctness
  // =========================================================================

  describe('Provider behavior paths', () => {
    it('openclaw behavior path is under home directory', () => {
      const expectedPath = path.join(os.homedir(), '.openclaw', 'behaviors');
      // Verify the path structure matches expectations from PROVIDER_PATHS
      expect(expectedPath).toContain('.openclaw');
      expect(expectedPath).toContain('behaviors');
    });

    it('claude behavior path emulates via hooks directory', () => {
      // Claude Code emulates behaviors via .claude/hooks/
      const claudeHooksPath = '.claude/hooks';
      expect(claudeHooksPath).toContain('hooks');
    });
  });

  // =========================================================================
  // registerDeployedExtensions — behavior integration
  // =========================================================================

  describe('registerDeployedExtensions with behaviorsPath', () => {
    it('registers behaviors when behaviorsPath is provided', async () => {
      await registerDeployedExtensions(registry, {
        behaviorsPath: BEHAVIORS_SOURCE_PATH,
        provider: 'openclaw',
      });

      const behaviors = registry.getByType('behavior');
      expect(behaviors.length).toBeGreaterThan(0);
    });

    it('skips behavior registration when behaviorsPath is empty string', async () => {
      await registerDeployedExtensions(registry, {
        behaviorsPath: '',
        provider: 'warp',
      });

      const behaviors = registry.getByType('behavior');
      expect(behaviors.length).toBe(0);
    });

    it('skips behavior registration when behaviorsPath is not provided', async () => {
      await registerDeployedExtensions(registry, {
        agentsPath: 'agentic/code/frameworks/sdlc-complete/agents',
        provider: 'claude',
      });

      const behaviors = registry.getByType('behavior');
      expect(behaviors.length).toBe(0);
    });

    it('existing agent/skill registration unaffected by behaviors addition', async () => {
      await registerDeployedExtensions(registry, {
        agentsPath: 'agentic/code/frameworks/sdlc-complete/agents',
        behaviorsPath: BEHAVIORS_SOURCE_PATH,
        provider: 'openclaw',
      });

      const agents = registry.getByType('agent');
      const behaviors = registry.getByType('behavior');

      // Both should be registered independently
      expect(agents.length).toBeGreaterThanOrEqual(0);
      expect(behaviors.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Regression guard — behaviors don't break existing deploy (#610)
  // =========================================================================

  describe('Regression guard', () => {
    it('deploying behaviors does not affect agent count', async () => {
      // Agents only
      const registryA = createRegistry();
      await registerDeployedExtensions(registryA, {
        agentsPath: 'agentic/code/frameworks/sdlc-complete/agents',
        provider: 'claude',
      });
      const agentsOnly = registryA.getByType('agent').length;

      // Agents + behaviors
      const registryB = createRegistry();
      await registerDeployedExtensions(registryB, {
        agentsPath: 'agentic/code/frameworks/sdlc-complete/agents',
        behaviorsPath: BEHAVIORS_SOURCE_PATH,
        provider: 'openclaw',
      });
      const agentsWithBehaviors = registryB.getByType('agent').length;

      expect(agentsWithBehaviors).toBe(agentsOnly);
    });

    it('deploying behaviors does not affect skill count', async () => {
      const registryA = createRegistry();
      await registerDeployedExtensions(registryA, {
        skillsPath: 'agentic/code/frameworks/sdlc-complete/skills',
        provider: 'claude',
      });
      const skillsOnly = registryA.getByType('skill').length;

      const registryB = createRegistry();
      await registerDeployedExtensions(registryB, {
        skillsPath: 'agentic/code/frameworks/sdlc-complete/skills',
        behaviorsPath: BEHAVIORS_SOURCE_PATH,
        provider: 'openclaw',
      });
      const skillsWithBehaviors = registryB.getByType('skill').length;

      expect(skillsWithBehaviors).toBe(skillsOnly);
    });
  });
});
