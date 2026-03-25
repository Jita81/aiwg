import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScheduledTaskRunner } from '../../../tools/daemon/scheduled-task-runner.mjs';
import { EventEmitter } from 'events';

function createMockSupervisor() {
  return {
    submit: vi.fn().mockResolvedValue({ loopId: 'loop-001' }),
  };
}

function createMockEventRouter() {
  return new EventEmitter();
}

describe('ScheduledTaskRunner', () => {
  let runner;
  let supervisor;
  let eventRouter;

  beforeEach(() => {
    supervisor = createMockSupervisor();
    eventRouter = createMockEventRouter();
    runner = new ScheduledTaskRunner({
      supervisor,
      eventRouter,
    });
  });

  describe('start / stop', () => {
    it('starts listening for events', () => {
      runner.start();
      expect(runner.getStatus().started).toBe(true);
    });

    it('stops the runner', () => {
      runner.start();
      runner.stop();
      expect(runner.getStatus().started).toBe(false);
    });
  });

  describe('cron event handling', () => {
    it('submits a task for known action', async () => {
      runner.start();

      // Simulate cron.fired event
      eventRouter.emit('event', {
        source: 'schedule',
        type: 'cron.fired',
        payload: { job_id: 'health-check', action: 'doctor', priority: 2 },
      });

      // Wait for async handler
      await new Promise(r => setTimeout(r, 50));

      expect(supervisor.submit).toHaveBeenCalledOnce();
      const call = supervisor.submit.mock.calls[0][0];
      expect(call.prompt).toContain('aiwg doctor');
      expect(call.priority).toBe(2);
      expect(call.metadata.source).toBe('scheduler');
    });

    it('uses custom prompt from payload', async () => {
      runner.start();

      eventRouter.emit('event', {
        source: 'schedule',
        type: 'cron.fired',
        payload: { job_id: 'custom-1', action: 'custom', prompt: 'Do custom thing', priority: 1 },
      });

      await new Promise(r => setTimeout(r, 50));

      expect(supervisor.submit).toHaveBeenCalledOnce();
      expect(supervisor.submit.mock.calls[0][0].prompt).toBe('Do custom thing');
    });

    it('ignores events from non-schedule sources', async () => {
      runner.start();

      eventRouter.emit('event', {
        source: 'file-watcher',
        type: 'cron.fired',
        payload: { job_id: 'test', action: 'doctor' },
      });

      await new Promise(r => setTimeout(r, 50));
      expect(supervisor.submit).not.toHaveBeenCalled();
    });

    it('ignores unknown actions without custom prompt', async () => {
      runner.start();

      eventRouter.emit('event', {
        source: 'schedule',
        type: 'cron.fired',
        payload: { job_id: 'unknown-1', action: 'nonexistent' },
      });

      await new Promise(r => setTimeout(r, 50));
      expect(supervisor.submit).not.toHaveBeenCalled();
    });
  });

  describe('registerAction', () => {
    it('registers a custom action', async () => {
      runner.registerAction('my-action', { prompt: 'Do my thing', description: 'Custom' });
      runner.start();

      eventRouter.emit('event', {
        source: 'schedule',
        type: 'cron.fired',
        payload: { job_id: 'custom', action: 'my-action' },
      });

      await new Promise(r => setTimeout(r, 50));
      expect(supervisor.submit).toHaveBeenCalledOnce();
      expect(supervisor.submit.mock.calls[0][0].prompt).toBe('Do my thing');
    });
  });

  describe('getStatus', () => {
    it('lists registered actions', () => {
      const status = runner.getStatus();
      expect(status.registeredActions).toContain('doctor');
      expect(status.registeredActions).toContain('validate-metadata');
      expect(status.registeredActions).toContain('doc-sync');
      expect(status.registeredActions).toContain('test-sync');
    });
  });
});
