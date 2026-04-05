/**
 * Browser-side mirror of server telemetry types.
 * Kept in sync with src/serve/telemetry.ts.
 */

export interface SessionMetrics {
  sessionId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  tokensByModel: Record<string, { input: number; output: number }>;
  iterations: number;
  gatePasses: number;
  gateFails: number;
  passRate: number | null;
  scopeDone: number;
  scopeTotal: number;
  activeAgents: number;
}
