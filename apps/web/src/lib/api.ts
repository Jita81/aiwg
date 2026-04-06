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
