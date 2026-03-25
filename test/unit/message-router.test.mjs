/**
 * Tests for MessageRouter and adapters
 *
 * @implements #521
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { MessageRouter } from '../../tools/daemon/message-router.mjs';
import { ChannelAdapter } from '../../tools/daemon/adapters/base-adapter.mjs';

// --- Stub adapter ---

class StubAdapter extends ChannelAdapter {
  constructor(id = 'stub') {
    super({ id, type: 'test' });
    this.sent = [];
  }

  async send(message) {
    this.sent.push(message);
  }
}

// --- Stub supervisor ---

class StubSupervisor extends EventEmitter {
  submit(prompt, options) {
    return { id: 'task-1', state: 'queued' };
  }
  cancel(taskId) {
    return taskId === 'known';
  }
  getStatus() {
    return { running: 0, queued: 0, maxConcurrency: 4, tasks: { running: [], queued: [] } };
  }
}

describe('MessageRouter', () => {
  let router;
  let supervisor;

  beforeEach(() => {
    supervisor = new StubSupervisor();
    router = new MessageRouter({ supervisor });
  });

  describe('adapter management', () => {
    it('should register an adapter', () => {
      const adapter = new StubAdapter('a1');
      router.registerAdapter(adapter);
      expect(router.getAdapters()).toHaveLength(1);
      expect(router.getAdapters()[0].id).toBe('a1');
    });

    it('should reject duplicate adapter IDs', () => {
      router.registerAdapter(new StubAdapter('a1'));
      expect(() => router.registerAdapter(new StubAdapter('a1'))).toThrow(/already registered/);
    });

    it('should remove an adapter', async () => {
      const adapter = new StubAdapter('a1');
      router.registerAdapter(adapter);
      await router.removeAdapter('a1');
      expect(router.getAdapters()).toHaveLength(0);
    });

    it('should emit events on register/remove', async () => {
      const events = [];
      router.on('adapter:registered', (e) => events.push(e));
      router.on('adapter:removed', (e) => events.push(e));

      const adapter = new StubAdapter('a1');
      router.registerAdapter(adapter);
      await router.removeAdapter('a1');

      expect(events).toHaveLength(2);
    });
  });

  describe('broadcast', () => {
    it('should fan out events to all adapters', async () => {
      const a1 = new StubAdapter('a1');
      const a2 = new StubAdapter('a2');
      router.registerAdapter(a1);
      router.registerAdapter(a2);

      router.broadcast({ type: 'loop:started', data: { loopId: 'x' } });

      // broadcast uses Promise.resolve().then() — wait for microtask
      await new Promise((r) => setTimeout(r, 10));

      expect(a1.sent).toHaveLength(1);
      expect(a2.sent).toHaveLength(1);
      expect(a1.sent[0].type).toBe('loop:started');
    });

    it('should not fail if one adapter errors', async () => {
      const good = new StubAdapter('good');
      const bad = new StubAdapter('bad');
      bad.send = () => { throw new Error('adapter broken'); };

      router.registerAdapter(good);
      router.registerAdapter(bad);

      // Should not throw
      router.broadcast({ type: 'test' });
      await new Promise((r) => setTimeout(r, 10));
      expect(good.sent).toHaveLength(1);
    });
  });

  describe('handleCommand', () => {
    it('should handle status command', () => {
      const result = router.handleCommand({ source: 'web', command: 'status' });
      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle submit command', () => {
      const result = router.handleCommand({
        source: 'web',
        command: 'submit',
        args: { prompt: 'Fix tests' },
      });
      expect(result.ok).toBe(true);
    });

    it('should handle cancel command', () => {
      const result = router.handleCommand({
        source: 'web',
        command: 'cancel',
        args: { taskId: 'known' },
      });
      expect(result.ok).toBe(true);
      expect(result.data.cancelled).toBe(true);
    });

    it('should return error for unknown command', () => {
      const result = router.handleCommand({ source: 'web', command: 'bogus' });
      expect(result.ok).toBe(false);
    });

    it('should return error when supervisor not set', () => {
      const noSupRouter = new MessageRouter();
      const result = noSupRouter.handleCommand({ source: 'web', command: 'status' });
      expect(result.ok).toBe(false);
    });
  });
});

describe('ChannelAdapter', () => {
  it('should store id and type', () => {
    const adapter = new ChannelAdapter({ id: 'test', type: 'webhook' });
    expect(adapter.id).toBe('test');
    expect(adapter.type).toBe('webhook');
  });

  it('should throw on abstract send()', async () => {
    const adapter = new ChannelAdapter({ id: 'test', type: 'base' });
    await expect(adapter.send('msg')).rejects.toThrow();
  });

  it('should track lifecycle state', async () => {
    const adapter = new ChannelAdapter({ id: 'test', type: 'base' });
    expect(adapter.getInfo().status).toBe('stopped');
    await adapter.start();
    expect(adapter.getInfo().status).toBe('running');
    expect(adapter.getInfo().connectedAt).toBeDefined();
    await adapter.stop();
    expect(adapter.getInfo().status).toBe('stopped');
  });
});
