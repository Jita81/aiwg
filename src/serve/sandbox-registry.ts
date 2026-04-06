/**
 * Sandbox Registry
 *
 * Manages registered agentic-sandbox instances. Each sandbox registers
 * with `aiwg serve` via POST /api/sandboxes/register and then pushes
 * real-time events over WebSocket at /ws/sandbox/:sandboxId.
 *
 * This is the AIWG side of the bidirectional integration:
 *   - aiwg#731 = registration API (this file)
 *   - sandbox#132 = outbound registration (pushes events here)
 *
 * @issue #731
 * @see #710 — epic
 * @see #732 — HITL relay (consumes hitl.input_required events)
 * @see #733 — operator controls (proxies to sandbox HTTP)
 */

import { randomUUID } from 'crypto';

// ============================================================
// Types
// ============================================================

export interface SandboxRegistration {
  /** Unique sandbox ID (assigned on register) */
  id: string;
  /** Display name chosen by sandbox operator */
  name: string;
  /** gRPC endpoint for agent communication */
  grpcEndpoint: string;
  /** WebSocket endpoint for PTY streaming */
  wsEndpoint: string;
  /** HTTP REST API endpoint */
  httpEndpoint: string;
  /** Capabilities this sandbox advertises */
  capabilities: string[];
  /** Sandbox software version */
  version: string;
  /** Auth token for this sandbox (returned at registration) */
  token: string;
  /** When the sandbox registered */
  registeredAt: string;
  /** Last event received from the sandbox */
  lastEventAt: string;
  /** Whether the event push WebSocket is connected */
  connected: boolean;
  /** Live agent inventory (updated by sandbox events) */
  agents: Map<string, SandboxAgent>;
}

export interface SandboxAgent {
  agentId: string;
  status: 'starting' | 'provisioning' | 'ready' | 'busy' | 'error' | 'disconnected';
  loadout?: string;
  aiwgFrameworks?: Array<{ name: string; providers: string[] }>;
  connectedAt?: string;
  lastHeartbeat?: string;
}

/**
 * Events pushed from agentic-sandbox to aiwg serve over WebSocket.
 * Matches the protocol defined in aiwg#731 / sandbox#132.
 */
export type SandboxEventType =
  | 'agent.connected'
  | 'agent.disconnected'
  | 'agent.provisioning'
  | 'agent.ready'
  | 'session.start'
  | 'session.end'
  | 'hitl.input_required';

export interface SandboxEvent {
  type: SandboxEventType;
  sandboxId: string;
  agentId: string;
  timestamp: string;
  // Event-specific fields
  loadout?: string;
  aiwgFrameworks?: Array<{ name: string; providers: string[] }>;
  step?: string;
  progress?: unknown;
  sessionId?: string;
  task?: string;
  // HITL-specific fields
  hitlId?: string;
  prompt?: string;
  context?: string;
  expiresAt?: string;
}

export interface HitlRequest {
  id: string;
  sandboxId: string;
  agentId: string;
  sessionId: string;
  timestamp: string;
  prompt: string;
  context: string;
  expiresAt?: string;
}

export interface RegisterRequest {
  name: string;
  grpc_endpoint: string;
  ws_endpoint: string;
  http_endpoint: string;
  capabilities?: string[];
  version?: string;
}

export interface RegisterResponse {
  sandbox_id: string;
  token: string;
}

// ============================================================
// Registry
// ============================================================

export class SandboxRegistry {
  private sandboxes = new Map<string, SandboxRegistration>();
  private hitlRequests = new Map<string, HitlRequest>();
  private listeners = new Set<(event: SandboxEvent) => void>();

  /**
   * Register a new sandbox instance.
   * Returns sandbox_id and auth token for the event push WebSocket.
   */
  register(req: RegisterRequest): RegisterResponse {
    const id = `sandbox-${randomUUID().slice(0, 8)}`;
    const token = randomUUID();

    const registration: SandboxRegistration = {
      id,
      name: req.name,
      grpcEndpoint: req.grpc_endpoint,
      wsEndpoint: req.ws_endpoint,
      httpEndpoint: req.http_endpoint,
      capabilities: req.capabilities ?? [],
      version: req.version ?? 'unknown',
      token,
      registeredAt: new Date().toISOString(),
      lastEventAt: new Date().toISOString(),
      connected: false,
      agents: new Map(),
    };

    this.sandboxes.set(id, registration);
    return { sandbox_id: id, token };
  }

  /**
   * Deregister a sandbox (on shutdown or explicit delete).
   */
  deregister(id: string): boolean {
    return this.sandboxes.delete(id);
  }

  /**
   * Get a sandbox by ID.
   */
  get(id: string): SandboxRegistration | undefined {
    return this.sandboxes.get(id);
  }

  /**
   * Validate the auth token for a sandbox.
   */
  authenticate(id: string, token: string): boolean {
    const sandbox = this.sandboxes.get(id);
    return sandbox !== undefined && sandbox.token === token;
  }

  /**
   * Mark the event push WebSocket as connected/disconnected.
   */
  setConnected(id: string, connected: boolean): void {
    const sandbox = this.sandboxes.get(id);
    if (sandbox) sandbox.connected = connected;
  }

  /**
   * List all registered sandboxes (serializable).
   */
  list(): SandboxSummary[] {
    return [...this.sandboxes.values()].map(toSummary);
  }

  /**
   * Get a sandbox summary by ID (serializable).
   */
  getSummary(id: string): SandboxSummary | undefined {
    const sandbox = this.sandboxes.get(id);
    return sandbox ? toSummary(sandbox) : undefined;
  }

  /**
   * Process an event pushed from a sandbox.
   * Updates internal agent inventory and notifies listeners.
   */
  handleEvent(event: SandboxEvent): void {
    const sandbox = this.sandboxes.get(event.sandboxId);
    if (!sandbox) return;

    sandbox.lastEventAt = event.timestamp || new Date().toISOString();

    // Update agent inventory based on event type
    switch (event.type) {
      case 'agent.connected': {
        sandbox.agents.set(event.agentId, {
          agentId: event.agentId,
          status: 'ready',
          loadout: event.loadout,
          aiwgFrameworks: event.aiwgFrameworks,
          connectedAt: event.timestamp,
          lastHeartbeat: event.timestamp,
        });
        break;
      }
      case 'agent.disconnected': {
        const agent = sandbox.agents.get(event.agentId);
        if (agent) agent.status = 'disconnected';
        break;
      }
      case 'agent.provisioning': {
        sandbox.agents.set(event.agentId, {
          agentId: event.agentId,
          status: 'provisioning',
          loadout: event.loadout,
          lastHeartbeat: event.timestamp,
        });
        break;
      }
      case 'agent.ready': {
        const existing = sandbox.agents.get(event.agentId);
        if (existing) {
          existing.status = 'ready';
          existing.lastHeartbeat = event.timestamp;
        }
        break;
      }
      case 'session.start': {
        const a = sandbox.agents.get(event.agentId);
        if (a) {
          a.status = 'busy';
          a.lastHeartbeat = event.timestamp;
        }
        break;
      }
      case 'session.end': {
        const a2 = sandbox.agents.get(event.agentId);
        if (a2 && a2.status === 'busy') {
          a2.status = 'ready';
          a2.lastHeartbeat = event.timestamp;
        }
        break;
      }
      case 'hitl.input_required': {
        if (event.hitlId && event.sessionId) {
          this.hitlRequests.set(event.hitlId, {
            id: event.hitlId,
            sandboxId: event.sandboxId,
            agentId: event.agentId,
            sessionId: event.sessionId,
            timestamp: event.timestamp,
            prompt: event.prompt ?? '',
            context: event.context ?? '',
            expiresAt: event.expiresAt,
          });
        }
        break;
      }
    }

    // Notify listeners (browser push, telemetry, etc.)
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* ignore listener errors */ }
    }
  }

  /**
   * Get all agents across all sandboxes.
   */
  allAgents(): Array<SandboxAgent & { sandboxId: string; sandboxName: string }> {
    const result: Array<SandboxAgent & { sandboxId: string; sandboxName: string }> = [];
    for (const sandbox of this.sandboxes.values()) {
      for (const agent of sandbox.agents.values()) {
        result.push({ ...agent, sandboxId: sandbox.id, sandboxName: sandbox.name });
      }
    }
    return result;
  }

  // ---- HITL ----

  /**
   * List pending HITL requests.
   */
  pendingHitl(): HitlRequest[] {
    return [...this.hitlRequests.values()];
  }

  /**
   * Get a specific HITL request.
   */
  getHitl(hitlId: string): HitlRequest | undefined {
    return this.hitlRequests.get(hitlId);
  }

  /**
   * Remove a HITL request (after response or dismissal).
   */
  resolveHitl(hitlId: string): HitlRequest | undefined {
    const req = this.hitlRequests.get(hitlId);
    this.hitlRequests.delete(hitlId);
    return req;
  }

  // ---- Event subscription ----

  /**
   * Subscribe to sandbox events (returns unsubscribe fn).
   */
  subscribe(listener: (event: SandboxEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Total registered sandbox count.
   */
  get size(): number {
    return this.sandboxes.size;
  }

  /**
   * Shut down — clear all state.
   */
  shutdown(): void {
    this.sandboxes.clear();
    this.hitlRequests.clear();
    this.listeners.clear();
  }
}

// ============================================================
// Serialization helpers
// ============================================================

export interface SandboxSummary {
  id: string;
  name: string;
  grpcEndpoint: string;
  wsEndpoint: string;
  httpEndpoint: string;
  capabilities: string[];
  version: string;
  registeredAt: string;
  lastEventAt: string;
  connected: boolean;
  agentCount: number;
  agents: Array<SandboxAgent>;
}

function toSummary(s: SandboxRegistration): SandboxSummary {
  return {
    id: s.id,
    name: s.name,
    grpcEndpoint: s.grpcEndpoint,
    wsEndpoint: s.wsEndpoint,
    httpEndpoint: s.httpEndpoint,
    capabilities: s.capabilities,
    version: s.version,
    registeredAt: s.registeredAt,
    lastEventAt: s.lastEventAt,
    connected: s.connected,
    agentCount: s.agents.size,
    agents: [...s.agents.values()],
  };
}

// Singleton instance
export const sandboxRegistry = new SandboxRegistry();
