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
  /** Unique sandbox ID (assigned on register, session-scoped) */
  id: string;
  /** Display name chosen by sandbox operator */
  name: string;
  /**
   * Stable instance identity (UUIDv7) persisted by the sandbox across restarts.
   * Used for upsert-on-reconnect so the same physical sandbox never creates
   * duplicate entries regardless of how many times it re-registers.
   */
  instanceId?: string;
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
  /** When this sandbox_id was first assigned */
  registeredAt: string;
  /** When the most recent registration arrived (updated on every upsert) */
  lastRegisteredAt: string;
  /** Last event received from the sandbox */
  lastEventAt: string;
  /** Whether the event push WebSocket is connected */
  connected: boolean;
  /** When the event push WebSocket last disconnected (undefined if never disconnected) */
  disconnectedAt?: string;
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
  /** Live session count — incremented/decremented by session.start/session.end events */
  sessionCount?: number;
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
  /** PTY/exec command — present on session.start events */
  command?: string;
  /** Exit code — present on session.end events */
  exitCode?: number;
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
  /** Stable UUIDv7 generated on first start, persisted across restarts */
  instance_id?: string;
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

/**
 * Debounce window for re-registrations from the same instance_id.
 * Matches the sandbox's 5 s retry interval — suppressess flicker on rapid restarts.
 */
const DEBOUNCE_MS = 5_000;

export class SandboxRegistry {
  private sandboxes = new Map<string, SandboxRegistration>();
  private hitlRequests = new Map<string, HitlRequest>();
  private listeners = new Set<(event: SandboxEvent) => void>();
  /** instance_id → sandbox_id (stable reverse-lookup for upsert) */
  private byInstanceId = new Map<string, string>();
  /** instance_id → last registration timestamp (ms, for debounce) */
  private lastRegistrationTime = new Map<string, number>();

  /**
   * Register a sandbox instance.
   *
   * When the request includes a stable `instance_id`:
   *   - **Debounce**: if a registration for the same instance_id arrived within
   *     DEBOUNCE_MS, return the existing sandbox_id + token without touching state.
   *   - **Upsert**: if outside the debounce window, update the existing entry's
   *     endpoints, version, and lastRegisteredAt in-place. The sandbox_id and token
   *     are preserved so in-flight WS connections stay authenticated.
   *
   * When no instance_id is provided, a new entry is always created (legacy behaviour).
   */
  register(req: RegisterRequest): RegisterResponse {
    const instanceId = req.instance_id;
    const now = Date.now();

    if (instanceId) {
      const lastTime = this.lastRegistrationTime.get(instanceId);
      const existingId = this.byInstanceId.get(instanceId);

      // Debounce: suppress rapid re-registrations within the window
      if (lastTime !== undefined && (now - lastTime) < DEBOUNCE_MS && existingId) {
        const existing = this.sandboxes.get(existingId);
        if (existing) {
          return { sandbox_id: existingId, token: existing.token };
        }
      }

      // Upsert: same instance, update endpoints in-place
      if (existingId) {
        const existing = this.sandboxes.get(existingId);
        if (existing) {
          existing.name = req.name;
          existing.grpcEndpoint = req.grpc_endpoint;
          existing.wsEndpoint = req.ws_endpoint;
          existing.httpEndpoint = req.http_endpoint;
          existing.capabilities = req.capabilities ?? existing.capabilities;
          existing.version = req.version ?? existing.version;
          existing.lastRegisteredAt = new Date().toISOString();
          existing.connected = false; // WS will update this when it (re-)connects
          this.lastRegistrationTime.set(instanceId, now);
          return { sandbox_id: existingId, token: existing.token };
        }
      }
    }

    // New registration (no instance_id, or first time seeing this instance_id)
    const id = `sandbox-${randomUUID().slice(0, 8)}`;
    const token = randomUUID();
    const now_iso = new Date().toISOString();

    const registration: SandboxRegistration = {
      id,
      name: req.name,
      instanceId,
      grpcEndpoint: req.grpc_endpoint,
      wsEndpoint: req.ws_endpoint,
      httpEndpoint: req.http_endpoint,
      capabilities: req.capabilities ?? [],
      version: req.version ?? 'unknown',
      token,
      registeredAt: now_iso,
      lastRegisteredAt: now_iso,
      lastEventAt: now_iso,
      connected: false,
      agents: new Map(),
    };

    this.sandboxes.set(id, registration);
    if (instanceId) {
      this.byInstanceId.set(instanceId, id);
      this.lastRegistrationTime.set(instanceId, now);
    }
    return { sandbox_id: id, token };
  }

  /**
   * Deregister a sandbox (on shutdown or explicit delete).
   */
  deregister(id: string): boolean {
    const sandbox = this.sandboxes.get(id);
    if (sandbox?.instanceId) {
      this.byInstanceId.delete(sandbox.instanceId);
      this.lastRegistrationTime.delete(sandbox.instanceId);
    }
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
    if (!sandbox) return;
    sandbox.connected = connected;
    if (!connected) sandbox.disconnectedAt = new Date().toISOString();
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

    // Normalize the two underscore variants the sandbox emits for session events.
    // Other event types (agent.connected, hitl.input_required, etc.) use dot notation
    // already and must not be altered.
    const rawType = event.type as string;
    const eventType = (rawType === 'session_start' ? 'session.start'
      : rawType === 'session_end' ? 'session.end'
      : rawType) as SandboxEventType;

    // Update agent inventory based on event type
    switch (eventType) {
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
      case 'session.start': {
        // Increment live session count on the agent so the dashboard badge updates
        const agent = sandbox.agents.get(event.agentId);
        if (agent) {
          agent.sessionCount = (agent.sessionCount ?? 0) + 1;
          agent.lastHeartbeat = event.timestamp;
        }
        break;
      }
      case 'session.end': {
        const agent = sandbox.agents.get(event.agentId);
        if (agent && agent.sessionCount) {
          agent.sessionCount = Math.max(0, agent.sessionCount - 1);
          agent.lastHeartbeat = event.timestamp;
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
    this.byInstanceId.clear();
    this.lastRegistrationTime.clear();
  }
}

// ============================================================
// Serialization helpers
// ============================================================

export interface SandboxSummary {
  id: string;
  /** Stable instance identity — canonical UI identifier, prefix for display */
  instanceId?: string;
  name: string;
  grpcEndpoint: string;
  wsEndpoint: string;
  httpEndpoint: string;
  capabilities: string[];
  version: string;
  registeredAt: string;
  lastRegisteredAt: string;
  lastEventAt: string;
  connected: boolean;
  /** ISO timestamp of last disconnect — present when connected is false */
  disconnectedAt?: string;
  agentCount: number;
  agents: Array<SandboxAgent>;
}

function toSummary(s: SandboxRegistration): SandboxSummary {
  return {
    id: s.id,
    instanceId: s.instanceId,
    name: s.name,
    grpcEndpoint: s.grpcEndpoint,
    wsEndpoint: s.wsEndpoint,
    httpEndpoint: s.httpEndpoint,
    capabilities: s.capabilities,
    version: s.version,
    registeredAt: s.registeredAt,
    lastRegisteredAt: s.lastRegisteredAt,
    lastEventAt: s.lastEventAt,
    connected: s.connected,
    disconnectedAt: s.disconnectedAt,
    agentCount: s.agents.size,
    agents: [...s.agents.values()],
  };
}

// Singleton instance
export const sandboxRegistry = new SandboxRegistry();
