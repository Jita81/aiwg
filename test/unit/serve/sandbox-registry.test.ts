/**
 * SandboxRegistry tests
 *
 * @issue #731
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SandboxRegistry,
  type RegisterRequest,
  type SandboxEvent,
  type HitlRequest,
} from '../../../src/serve/sandbox-registry.js';

const REQ: RegisterRequest = {
  name: 'test-sandbox',
  grpc_endpoint: '192.168.1.10:8120',
  ws_endpoint: 'ws://192.168.1.10:8121',
  http_endpoint: 'http://192.168.1.10:8122',
  capabilities: ['vm', 'pty'],
  version: '0.1.0',
};

describe('SandboxRegistry', () => {
  let registry: SandboxRegistry;

  beforeEach(() => { registry = new SandboxRegistry(); });

  describe('register/deregister', () => {
    it('registers a sandbox and returns id + token', () => {
      const result = registry.register(REQ);
      expect(result.sandbox_id).toMatch(/^sandbox-/);
      expect(result.token).toBeTruthy();
      expect(registry.size).toBe(1);
    });

    it('returns unique ids for each registration', () => {
      const r1 = registry.register(REQ);
      const r2 = registry.register({ ...REQ, name: 'other' });
      expect(r1.sandbox_id).not.toBe(r2.sandbox_id);
      expect(r1.token).not.toBe(r2.token);
    });

    it('deregisters a sandbox', () => {
      const { sandbox_id } = registry.register(REQ);
      expect(registry.deregister(sandbox_id)).toBe(true);
      expect(registry.size).toBe(0);
    });

    it('returns false when deregistering unknown id', () => {
      expect(registry.deregister('nonexistent')).toBe(false);
    });

    it('clearOffline removes disconnected sandboxes and returns count', () => {
      const { sandbox_id: id1 } = registry.register(REQ);
      const { sandbox_id: id2 } = registry.register({ ...REQ, name: 'b' });
      // id1 connected, id2 offline
      registry.setConnected(id1, true);
      expect(registry.clearOffline()).toBe(1);
      expect(registry.get(id1)).toBeDefined();
      expect(registry.get(id2)).toBeUndefined();
      expect(registry.size).toBe(1);
    });

    it('clearOffline returns 0 when all sandboxes are connected', () => {
      const { sandbox_id } = registry.register(REQ);
      registry.setConnected(sandbox_id, true);
      expect(registry.clearOffline()).toBe(0);
      expect(registry.size).toBe(1);
    });
  });

  describe('authentication', () => {
    it('authenticates with correct token', () => {
      const { sandbox_id, token } = registry.register(REQ);
      expect(registry.authenticate(sandbox_id, token)).toBe(true);
    });

    it('rejects wrong token', () => {
      const { sandbox_id } = registry.register(REQ);
      expect(registry.authenticate(sandbox_id, 'wrong-token')).toBe(false);
    });

    it('rejects unknown sandbox id', () => {
      expect(registry.authenticate('nonexistent', 'any-token')).toBe(false);
    });
  });

  describe('list/get', () => {
    it('lists all sandboxes', () => {
      registry.register(REQ);
      registry.register({ ...REQ, name: 'second' });
      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('test-sandbox');
      expect(list[1].name).toBe('second');
    });

    it('list includes agent count', () => {
      const { sandbox_id } = registry.register(REQ);
      registry.handleEvent(makeEvent(sandbox_id, 'agent.connected', { agentId: 'a1' }));
      const list = registry.list();
      expect(list[0].agentCount).toBe(1);
      expect(list[0].agents).toHaveLength(1);
    });

    it('getSummary returns undefined for unknown id', () => {
      expect(registry.getSummary('nonexistent')).toBeUndefined();
    });

    it('getSummary returns serializable summary', () => {
      const { sandbox_id } = registry.register(REQ);
      const summary = registry.getSummary(sandbox_id);
      expect(summary).toBeDefined();
      expect(summary!.id).toBe(sandbox_id);
      expect(summary!.capabilities).toEqual(['vm', 'pty']);
    });
  });

  describe('connection state', () => {
    it('tracks connected/disconnected state', () => {
      const { sandbox_id } = registry.register(REQ);
      expect(registry.get(sandbox_id)!.connected).toBe(false);
      registry.setConnected(sandbox_id, true);
      expect(registry.get(sandbox_id)!.connected).toBe(true);
      registry.setConnected(sandbox_id, false);
      expect(registry.get(sandbox_id)!.connected).toBe(false);
    });
  });

  describe('event handling — agent lifecycle', () => {
    let sandboxId: string;

    beforeEach(() => {
      sandboxId = registry.register(REQ).sandbox_id;
    });

    it('agent.connected adds agent to inventory', () => {
      registry.handleEvent(makeEvent(sandboxId, 'agent.connected', {
        agentId: 'agent-01',
        loadout: 'claude-only',
        aiwgFrameworks: [{ name: 'sdlc', providers: ['claude'] }],
      }));
      const agents = registry.allAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].agentId).toBe('agent-01');
      expect(agents[0].status).toBe('ready');
      expect(agents[0].loadout).toBe('claude-only');
      expect(agents[0].sandboxName).toBe('test-sandbox');
    });

    it('agent.disconnected updates status', () => {
      registry.handleEvent(makeEvent(sandboxId, 'agent.connected', { agentId: 'a1' }));
      registry.handleEvent(makeEvent(sandboxId, 'agent.disconnected', { agentId: 'a1' }));
      const agents = registry.allAgents();
      expect(agents[0].status).toBe('disconnected');
    });

    it('agent.provisioning sets status to provisioning', () => {
      registry.handleEvent(makeEvent(sandboxId, 'agent.provisioning', {
        agentId: 'a2',
        loadout: 'agentic-dev',
        step: 'installing-tools',
        progress: { percent: 50 },
      }));
      const agents = registry.allAgents();
      expect(agents[0].status).toBe('provisioning');
      expect(agents[0].loadout).toBe('agentic-dev');
    });

    it('agent.ready transitions provisioning → ready', () => {
      registry.handleEvent(makeEvent(sandboxId, 'agent.provisioning', { agentId: 'a3' }));
      registry.handleEvent(makeEvent(sandboxId, 'agent.ready', { agentId: 'a3' }));
      const agents = registry.allAgents();
      expect(agents[0].status).toBe('ready');
    });

    it('session.start sets agent to busy', () => {
      registry.handleEvent(makeEvent(sandboxId, 'agent.connected', { agentId: 'a1' }));
      registry.handleEvent(makeEvent(sandboxId, 'session.start', { agentId: 'a1', sessionId: 's1' }));
      expect(registry.allAgents()[0].status).toBe('busy');
    });

    it('session.end sets agent back to ready', () => {
      registry.handleEvent(makeEvent(sandboxId, 'agent.connected', { agentId: 'a1' }));
      registry.handleEvent(makeEvent(sandboxId, 'session.start', { agentId: 'a1', sessionId: 's1' }));
      registry.handleEvent(makeEvent(sandboxId, 'session.end', { agentId: 'a1', sessionId: 's1' }));
      expect(registry.allAgents()[0].status).toBe('ready');
    });

    it('updates lastEventAt on each event', () => {
      // Force a distinguishable timestamp on the event
      const event = makeEvent(sandboxId, 'agent.connected', { agentId: 'a1' });
      event.timestamp = '2099-01-01T00:00:00.000Z';
      registry.handleEvent(event);
      expect(registry.get(sandboxId)!.lastEventAt).toBe('2099-01-01T00:00:00.000Z');
    });

    it('ignores events for unknown sandbox', () => {
      registry.handleEvent(makeEvent('nonexistent', 'agent.connected', { agentId: 'a1' }));
      expect(registry.allAgents()).toHaveLength(0);
    });
  });

  describe('HITL', () => {
    let sandboxId: string;

    beforeEach(() => {
      sandboxId = registry.register(REQ).sandbox_id;
    });

    it('hitl.input_required creates pending request', () => {
      registry.handleEvent(makeEvent(sandboxId, 'hitl.input_required', {
        agentId: 'a1',
        sessionId: 's1',
        hitlId: 'hitl-001',
        prompt: 'Should I proceed?',
        context: 'Last 20 lines...',
      }));
      const pending = registry.pendingHitl();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('hitl-001');
      expect(pending[0].prompt).toBe('Should I proceed?');
    });

    it('getHitl returns specific request', () => {
      registry.handleEvent(makeEvent(sandboxId, 'hitl.input_required', {
        agentId: 'a1', sessionId: 's1', hitlId: 'h1', prompt: 'Q?', context: '',
      }));
      expect(registry.getHitl('h1')).toBeDefined();
      expect(registry.getHitl('nonexistent')).toBeUndefined();
    });

    it('resolveHitl removes and returns the request', () => {
      registry.handleEvent(makeEvent(sandboxId, 'hitl.input_required', {
        agentId: 'a1', sessionId: 's1', hitlId: 'h2', prompt: 'Q?', context: '',
      }));
      const resolved = registry.resolveHitl('h2');
      expect(resolved).toBeDefined();
      expect(resolved!.id).toBe('h2');
      expect(registry.pendingHitl()).toHaveLength(0);
    });

    it('resolveHitl returns undefined for already-resolved', () => {
      registry.handleEvent(makeEvent(sandboxId, 'hitl.input_required', {
        agentId: 'a1', sessionId: 's1', hitlId: 'h3', prompt: 'Q?', context: '',
      }));
      registry.resolveHitl('h3');
      expect(registry.resolveHitl('h3')).toBeUndefined();
    });
  });

  describe('event subscription', () => {
    it('notifies listeners of events', () => {
      const sandboxId = registry.register(REQ).sandbox_id;
      const received: SandboxEvent[] = [];
      registry.subscribe((e) => received.push(e));
      registry.handleEvent(makeEvent(sandboxId, 'agent.connected', { agentId: 'a1' }));
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('agent.connected');
    });

    it('unsubscribe stops notifications', () => {
      const sandboxId = registry.register(REQ).sandbox_id;
      const received: SandboxEvent[] = [];
      const unsub = registry.subscribe((e) => received.push(e));
      unsub();
      registry.handleEvent(makeEvent(sandboxId, 'agent.connected', { agentId: 'a1' }));
      expect(received).toHaveLength(0);
    });

    it('listener errors do not propagate', () => {
      const sandboxId = registry.register(REQ).sandbox_id;
      registry.subscribe(() => { throw new Error('boom'); });
      // Should not throw
      registry.handleEvent(makeEvent(sandboxId, 'agent.connected', { agentId: 'a1' }));
    });
  });

  describe('allAgents', () => {
    it('aggregates agents across multiple sandboxes', () => {
      const s1 = registry.register(REQ).sandbox_id;
      const s2 = registry.register({ ...REQ, name: 'second' }).sandbox_id;
      registry.handleEvent(makeEvent(s1, 'agent.connected', { agentId: 'a1' }));
      registry.handleEvent(makeEvent(s2, 'agent.connected', { agentId: 'a2' }));
      const agents = registry.allAgents();
      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.agentId).sort()).toEqual(['a1', 'a2']);
    });
  });

  describe('shutdown', () => {
    it('clears all state', () => {
      const sandboxId = registry.register(REQ).sandbox_id;
      registry.handleEvent(makeEvent(sandboxId, 'agent.connected', { agentId: 'a1' }));
      registry.handleEvent(makeEvent(sandboxId, 'hitl.input_required', {
        agentId: 'a1', sessionId: 's1', hitlId: 'h1', prompt: 'Q?', context: '',
      }));
      registry.shutdown();
      expect(registry.size).toBe(0);
      expect(registry.allAgents()).toHaveLength(0);
      expect(registry.pendingHitl()).toHaveLength(0);
    });
  });
});

// ============================================================
// Helpers
// ============================================================

function makeEvent(
  sandboxId: string,
  type: SandboxEvent['type'],
  fields: Partial<SandboxEvent>,
): SandboxEvent {
  return {
    type,
    sandboxId,
    agentId: fields.agentId ?? 'agent-unknown',
    timestamp: new Date().toISOString(),
    ...fields,
  };
}
