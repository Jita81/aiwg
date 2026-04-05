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

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  sessions: () => request<SessionsResponse>('/api/sessions'),
  missions: () => request<MissionsResponse>('/api/missions'),
  telemetry: () => request<TelemetryResponse>('/api/telemetry'),
};
