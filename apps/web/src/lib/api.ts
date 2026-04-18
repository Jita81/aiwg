/**
 * REST API client for aiwg serve HTTP endpoints.
 */

const BASE = '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface HealthResponse {
  status: 'ok';
  readOnly: boolean;
}

export interface SessionsResponse {
  sessions: string[];
}

export interface MissionsResponse {
  missions: unknown[];
}

export interface TelemetryResponse {
  events: unknown[];
}

// ---- Sandbox types (#731) ----

export interface SandboxAgent {
  agentId: string;
  status: 'starting' | 'provisioning' | 'ready' | 'busy' | 'error' | 'disconnected';
  loadout?: string;
  aiwgFrameworks?: Array<{ name: string; providers: string[] }>;
  sandboxId?: string;
  sandboxName?: string;
}

export interface SandboxSummary {
  id: string;
  /** Stable UUIDv7 — persisted across sandbox restarts */
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
  /** ISO timestamp of last disconnect — undefined while connected */
  disconnectedAt?: string;
  agentCount: number;
  agents: SandboxAgent[];
}

export interface SandboxesResponse {
  sandboxes: SandboxSummary[];
}

export interface AgentsResponse {
  agents: SandboxAgent[];
}

// ---- HITL types (#732) ----

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

export interface HitlResponse {
  requests: HitlRequest[];
}

// ---- Connections types (#887) ----

export interface ConnectionsResponse {
  server: { status: 'ok'; readOnly: boolean; uptime: number };
  ptySessions: string[];
  sandboxes: Array<{ id: string; name: string; connected: boolean; agentCount: number }>;
  mcpServers: Array<{ name: string; status: string }>;
  subsystems: {
    ralph: { status: 'active' | 'idle' | 'unknown'; activeLoops: number };
    missions: { status: string; count: number };
    daemon: { status: string };
    rlm: { status: string };
    memory: { status: string };
  };
}

// ---- Session types (#896) ----

export interface Session {
  session_id: string;
  session_name: string;
  session_type: 'interactive' | 'headless' | 'background';
  command: string;
  /** Elapsed seconds since session creation (monotonic clock on sandbox) */
  created_at_secs: number;
  /** True if the ScreenRegistry has live VT100 state — attachable via orchestrate WS */
  has_screen: boolean;
}

export interface SessionsListResponse {
  agent_id: string;
  sessions: Session[];
}

export interface CreateSessionRequest {
  command?: string;
  session_name?: string;
}

export interface CreateSessionResponse {
  session_id: string;
  session_name: string;
  /** Relative WS URL on the sandbox: /ws/sessions/:id/orchestrate */
  ws_url: string;
}

// ---- Loadout types (#733) ----

export interface Loadout {
  name: string;
  description?: string;
  resources?: { cpus?: number; memory?: string; disk?: string };
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  sessions: () => request<SessionsResponse>('/api/sessions'),
  missions: () => request<MissionsResponse>('/api/missions'),
  telemetry: () => request<TelemetryResponse>('/api/telemetry'),

  // Connections (#887)
  connections: () => request<ConnectionsResponse>('/api/connections'),

  // Sandbox (#731)
  sandboxes: () => request<SandboxesResponse>('/api/sandboxes'),
  agents: () => request<AgentsResponse>('/api/agents'),
  sandboxAgents: (id: string) => request<{ agents: SandboxAgent[] }>(`/api/sandboxes/${id}/agents`),
  sandboxLoadouts: (id: string) => request<Loadout[]>(`/api/sandboxes/${id}/loadouts`),
  sandboxProvision: (id: string, body: { name: string; loadout: string }) =>
    request<{ agent_id: string }>(`/api/sandboxes/${id}/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  agentAction: (sandboxId: string, agentId: string, action: 'start' | 'stop' | 'destroy' | 'reprovision') =>
    request<{ ok: boolean }>(`/api/sandboxes/${sandboxId}/agents/${agentId}/${action}`, { method: 'POST' }),

  // Sessions (#896)
  agentSessions: (sandboxId: string, agentId: string) =>
    request<SessionsListResponse>(`/api/sandboxes/${sandboxId}/agents/${agentId}/sessions`),
  createSession: (sandboxId: string, agentId: string, body: CreateSessionRequest = {}) =>
    request<CreateSessionResponse>(`/api/sandboxes/${sandboxId}/agents/${agentId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  /** Kill a session by its session_name (the DELETE path key on the sandbox). */
  killSession: (sandboxId: string, agentId: string, sessionName: string) =>
    request<void>(`/api/sandboxes/${sandboxId}/agents/${agentId}/sessions/${encodeURIComponent(sessionName)}`, { method: 'DELETE' }),

  // HITL (#732)
  hitl: () => request<HitlResponse>('/api/hitl'),
  hitlRespond: (hitlId: string, text: string) =>
    request<{ ok: boolean }>(`/api/hitl/${hitlId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
  hitlDismiss: (hitlId: string) =>
    request<{ ok: boolean }>(`/api/hitl/${hitlId}/dismiss`, { method: 'POST' }),
};
