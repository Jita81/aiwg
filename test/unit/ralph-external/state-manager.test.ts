/**
 * Unit tests for External Ralph Loop State Manager
 *
 * @source @tools/ralph-external/state-manager.mjs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import the module under test
// @ts-ignore - ESM import
import { StateManager } from '../../../tools/ralph-external/state-manager.mjs';

describe('StateManager', () => {
  let testDir: string;
  let stateManager: InstanceType<typeof StateManager>;

  beforeEach(() => {
    // Create unique test directory
    testDir = join(tmpdir(), `ralph-external-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    stateManager = new StateManager(testDir);
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initialize', () => {
    it('should create initial state with required fields', () => {
      const state = stateManager.initialize({
        objective: 'Fix tests',
        completionCriteria: 'npm test passes',
      });

      expect(state.version).toBe('1.0.0');
      expect(state.objective).toBe('Fix tests');
      expect(state.completionCriteria).toBe('npm test passes');
      expect(state.status).toBe('running');
      expect(state.currentIteration).toBe(0);
      expect(state.iterations).toEqual([]);
      expect(state.loopId).toBeDefined();
      expect(state.sessionId).toBeDefined();
    });

    it('should create state directory structure', () => {
      stateManager.initialize({
        objective: 'Test task',
        completionCriteria: 'criteria',
      });

      const stateDir = join(testDir, '.aiwg', 'ralph-external');
      expect(existsSync(stateDir)).toBe(true);
      expect(existsSync(join(stateDir, 'iterations'))).toBe(true);
      expect(existsSync(join(stateDir, 'prompts'))).toBe(true);
      expect(existsSync(join(stateDir, 'outputs'))).toBe(true);
      expect(existsSync(join(stateDir, 'analysis'))).toBe(true);
    });

    it('should use default values for optional config', () => {
      const state = stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      expect(state.maxIterations).toBe(10);
      expect(state.config.model).toBe('opus');
      expect(state.config.budgetPerIteration).toBe(2.0);
    });

    it('should accept custom config values', () => {
      const state = stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
        maxIterations: 20,
        model: 'sonnet',
        budgetPerIteration: 5.0,
      });

      expect(state.maxIterations).toBe(20);
      expect(state.config.model).toBe('sonnet');
      expect(state.config.budgetPerIteration).toBe(5.0);
    });
  });

  describe('exists', () => {
    it('should return false when no state exists', () => {
      expect(stateManager.exists()).toBe(false);
    });

    it('should return true after initialization', () => {
      stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      expect(stateManager.exists()).toBe(true);
    });
  });

  describe('save and load', () => {
    it('should save and load state correctly', () => {
      const original = stateManager.initialize({
        objective: 'Original objective',
        completionCriteria: 'test passes',
      });

      const loaded = stateManager.load();

      expect(loaded).not.toBeNull();
      expect(loaded?.loopId).toBe(original.loopId);
      expect(loaded?.objective).toBe('Original objective');
    });

    it('should update lastUpdate timestamp on save', async () => {
      const state = stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      const firstUpdate = state.lastUpdate;

      // Wait a bit and save again
      await new Promise((resolve) => setTimeout(resolve, 10));
      state.status = 'paused';
      stateManager.save(state);

      const loaded = stateManager.load();
      expect(loaded?.lastUpdate).not.toBe(firstUpdate);
    });

    it('should create backup on save', () => {
      stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      // Save again to create backup
      const state = stateManager.load()!;
      state.status = 'paused';
      stateManager.save(state);

      const backupPath = join(testDir, '.aiwg', 'ralph-external', 'session-state.json.bak');
      expect(existsSync(backupPath)).toBe(true);
    });
  });

  describe('update', () => {
    it('should update partial state', () => {
      stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      const updated = stateManager.update({
        status: 'paused',
        currentIteration: 5,
      });

      expect(updated.status).toBe('paused');
      expect(updated.currentIteration).toBe(5);
      expect(updated.objective).toBe('Test'); // Unchanged
    });

    it('should throw when no state exists', () => {
      expect(() => stateManager.update({ status: 'paused' })).toThrow('No existing state');
    });
  });

  describe('addIteration', () => {
    it('should add iteration record', () => {
      stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      const state = stateManager.addIteration({
        number: 1,
        sessionId: 'test-session',
        promptFile: 'prompts/001-prompt.md',
        stdoutFile: 'outputs/001-stdout.log',
        stderrFile: 'outputs/001-stderr.log',
        exitCode: 0,
        duration: 1000,
        status: 'completed',
        analysis: { completed: false, success: null },
        learnings: ['First learning'],
        filesModified: ['file1.ts'],
        progress: 'Started',
      });

      expect(state.iterations).toHaveLength(1);
      expect(state.iterations[0].number).toBe(1);
      expect(state.iterations[0].learnings).toContain('First learning');
    });

    it('should accumulate learnings across iterations', () => {
      stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      stateManager.addIteration({
        number: 1,
        learnings: ['Learning 1'],
        filesModified: [],
      } as any);

      const state = stateManager.addIteration({
        number: 2,
        learnings: ['Learning 2'],
        filesModified: [],
      } as any);

      expect(state.accumulatedLearnings).toContain('Learning 1');
      expect(state.accumulatedLearnings).toContain('Learning 2');
    });

    it('should merge files modified without duplicates', () => {
      stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      stateManager.addIteration({
        number: 1,
        filesModified: ['file1.ts', 'file2.ts'],
      } as any);

      const state = stateManager.addIteration({
        number: 2,
        filesModified: ['file2.ts', 'file3.ts'],
      } as any);

      expect(state.filesModified).toHaveLength(3);
      expect(state.filesModified).toContain('file1.ts');
      expect(state.filesModified).toContain('file2.ts');
      expect(state.filesModified).toContain('file3.ts');
    });
  });

  describe('recovery from corrupted state', () => {
    it('should recover from corrupted state file using backup', () => {
      // Initialize and create backup
      const original = stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      original.status = 'paused';
      stateManager.save(original);

      // Corrupt the main state file
      const statePath = join(testDir, '.aiwg', 'ralph-external', 'session-state.json');
      writeFileSync(statePath, 'corrupted data');

      // Load should recover from backup
      const recovered = stateManager.load();

      expect(recovered).not.toBeNull();
      expect(recovered?.loopId).toBe(original.loopId);
    });

    it('should throw when both state and backup are corrupted', () => {
      stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      // Create backup first
      const state = stateManager.load()!;
      stateManager.save(state);

      // Corrupt both files
      const stateDir = join(testDir, '.aiwg', 'ralph-external');
      writeFileSync(join(stateDir, 'session-state.json'), 'corrupted');
      writeFileSync(join(stateDir, 'session-state.json.bak'), 'also corrupted');

      expect(() => stateManager.load()).toThrow();
    });
  });

  describe('path helpers', () => {
    it('should return correct iteration directory path', () => {
      const path = stateManager.getIterationDir(1);
      expect(path).toContain('001');
    });

    it('should return correct prompt path', () => {
      const path = stateManager.getPromptPath(5);
      expect(path).toContain('005-prompt.md');
    });

    it('should return correct output paths', () => {
      const paths = stateManager.getOutputPaths(10);
      expect(paths.stdout).toContain('010-stdout.log');
      expect(paths.stderr).toContain('010-stderr.log');
    });

    it('should return correct analysis path', () => {
      const path = stateManager.getAnalysisPath(3);
      expect(path).toContain('003-analysis.json');
    });
  });

  describe('clear', () => {
    it('should set status to aborted', () => {
      stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      stateManager.clear();

      const state = stateManager.load();
      expect(state?.status).toBe('aborted');
    });

    it('should not throw if no state exists', () => {
      expect(() => stateManager.clear()).not.toThrow();
    });
  });

  describe('setStateDir', () => {
    it('should re-scope all file I/O to the new directory', () => {
      const customDir = join(testDir, 'loops', 'ralph-my-task-a1b2c3d4');
      stateManager.setStateDir(customDir);

      stateManager.initialize({
        objective: 'Test',
        completionCriteria: 'done',
      });

      expect(existsSync(join(customDir, 'session-state.json'))).toBe(true);
      // Default flat dir should NOT have been created
      expect(existsSync(join(testDir, '.aiwg', 'ralph-external', 'session-state.json'))).toBe(false);
    });

    it('should update path helpers to use the new directory', () => {
      const customDir = join(testDir, 'loops', 'ralph-my-task-a1b2c3d4');
      stateManager.setStateDir(customDir);

      expect(stateManager.getStateDir()).toBe(customDir);
      expect(stateManager.getPromptPath(1)).toContain(customDir);
      expect(stateManager.getOutputPaths(1).stdout).toContain(customDir);
      expect(stateManager.getAnalysisPath(1)).toContain(customDir);
    });

    it('should allow load() to find state written after setStateDir', () => {
      const customDir = join(testDir, 'loops', 'ralph-my-task-a1b2c3d4');
      stateManager.setStateDir(customDir);

      const original = stateManager.initialize({
        objective: 'Scoped objective',
        completionCriteria: 'done',
      });

      const loaded = stateManager.load();
      expect(loaded?.loopId).toBe(original.loopId);
      expect(loaded?.objective).toBe('Scoped objective');
    });
  });

  describe('parallel loop isolation', () => {
    it('two StateManagers with different stateDirs should not share files', () => {
      const loopDirA = join(testDir, 'loops', 'ralph-loop-a');
      const loopDirB = join(testDir, 'loops', 'ralph-loop-b');

      const smA = new StateManager(testDir);
      smA.setStateDir(loopDirA);

      const smB = new StateManager(testDir);
      smB.setStateDir(loopDirB);

      smA.initialize({ objective: 'Task A', completionCriteria: 'A done' });
      smB.initialize({ objective: 'Task B', completionCriteria: 'B done' });

      const stateA = smA.load();
      const stateB = smB.load();

      // Each manager reads its own state, not the other's
      expect(stateA?.objective).toBe('Task A');
      expect(stateB?.objective).toBe('Task B');

      // State files are in separate directories
      expect(existsSync(join(loopDirA, 'session-state.json'))).toBe(true);
      expect(existsSync(join(loopDirB, 'session-state.json'))).toBe(true);
    });

    it('updating one loop state should not affect the other', () => {
      const loopDirA = join(testDir, 'loops', 'ralph-loop-a');
      const loopDirB = join(testDir, 'loops', 'ralph-loop-b');

      const smA = new StateManager(testDir);
      smA.setStateDir(loopDirA);

      const smB = new StateManager(testDir);
      smB.setStateDir(loopDirB);

      smA.initialize({ objective: 'Task A', completionCriteria: 'A done' });
      smB.initialize({ objective: 'Task B', completionCriteria: 'B done' });

      smA.update({ status: 'completed' });

      const stateA = smA.load();
      const stateB = smB.load();

      expect(stateA?.status).toBe('completed');
      expect(stateB?.status).toBe('running'); // B is unaffected
    });

    it('iteration files from each loop should be isolated', () => {
      const loopDirA = join(testDir, 'loops', 'ralph-loop-a');
      const loopDirB = join(testDir, 'loops', 'ralph-loop-b');

      const smA = new StateManager(testDir);
      smA.setStateDir(loopDirA);

      const smB = new StateManager(testDir);
      smB.setStateDir(loopDirB);

      smA.initialize({ objective: 'Task A', completionCriteria: 'done' });
      smB.initialize({ objective: 'Task B', completionCriteria: 'done' });

      // Prompt paths for iteration 1 should be in separate directories
      expect(smA.getPromptPath(1)).toContain(loopDirA);
      expect(smB.getPromptPath(1)).toContain(loopDirB);
      expect(smA.getPromptPath(1)).not.toBe(smB.getPromptPath(1));

      // Output paths likewise
      expect(smA.getOutputPaths(1).stdout).not.toBe(smB.getOutputPaths(1).stdout);
    });
  });
});
