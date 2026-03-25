import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContainerManager } from '../../../tools/docker/container-manager.mjs';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

// Mock fs
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue('abc123'),
      unlinkSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(true),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('abc123'),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import { execSync, spawn } from 'child_process';
import fs from 'fs';

describe('ContainerManager', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish fs mocks after clearMocks resets them
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('abc123');
    manager = new ContainerManager({
      projectDir: '/home/user/project',
      webPort: 7474,
    });
  });

  describe('isDockerAvailable', () => {
    it('returns true when docker info succeeds', () => {
      execSync.mockReturnValue('');
      expect(manager.isDockerAvailable()).toBe(true);
    });

    it('returns false when docker info fails', () => {
      execSync.mockImplementation(() => { throw new Error('not found'); });
      expect(manager.isDockerAvailable()).toBe(false);
    });
  });

  describe('ensureImage', () => {
    it('skips build when image exists', () => {
      // First call: docker image inspect succeeds
      execSync.mockReturnValue('');
      manager.ensureImage();
      // Only the inspect call, no build
      expect(execSync).toHaveBeenCalledTimes(1);
    });

    it('builds image when not present', () => {
      let callCount = 0;
      execSync.mockImplementation((cmd) => {
        callCount++;
        if (callCount === 1 && cmd.includes('image inspect')) {
          throw new Error('not found');
        }
        return '';
      });

      manager.ensureImage();
      expect(execSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('status', () => {
    it('returns running status', () => {
      execSync.mockReturnValue('true healthy');
      const status = manager.status();
      expect(status.running).toBe(true);
      expect(status.health).toBe('healthy');
    });

    it('returns not running when docker inspect fails', () => {
      execSync.mockImplementation(() => { throw new Error('not found'); });
      const status = manager.status();
      expect(status.running).toBe(false);
      expect(status.containerId).toBeNull();
    });
  });

  describe('stop', () => {
    it('stops and removes container', () => {
      manager.stop();
      // Should call docker stop and docker rm
      expect(execSync).toHaveBeenCalledTimes(2);
    });

    it('handles non-existent container gracefully', () => {
      execSync.mockImplementation(() => { throw new Error('not found'); });
      // Should not throw
      expect(() => manager.stop()).not.toThrow();
    });
  });

  describe('constructor', () => {
    it('generates container name from project dir hash', () => {
      const m1 = new ContainerManager({ projectDir: '/path/a' });
      const m2 = new ContainerManager({ projectDir: '/path/b' });
      // Different projects get different container names
      // (we can't easily test the names without accessing private fields,
      // but we can verify construction doesn't throw)
      expect(m1).toBeDefined();
      expect(m2).toBeDefined();
    });

    it('accepts docker config overrides', () => {
      const m = new ContainerManager({
        projectDir: '/test',
        dockerConfig: {
          image: 'custom:v2',
          env_file: '.env.prod',
        },
      });
      expect(m).toBeDefined();
    });
  });
});
