/**
 * Session Picker + Inline Terminal
 *
 * Renders a collapsible session list for a specific sandbox agent.
 * Each session shows name, age, status, Attach and Kill controls.
 * "+ New Terminal" spawns a new bash session via the sandbox REST API.
 * Selecting a session opens an inline terminal pane bridged through
 * the existing /ws/pty WebSocket route.
 *
 * Will gracefully show a 502 error until agentic-sandbox#140 lands the
 * session list/create/delete REST endpoints.
 *
 * @issue #896
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { api, type Session } from '../../lib/api.js';
import styles from './SessionPicker.module.css';

// ---- Helpers ----

function relAge(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h`;
  } catch {
    return '';
  }
}

// ---- Terminal Pane ----

interface TerminalPaneProps {
  /** Unique PTY session key routed through /ws/pty/:key */
  sessionKey: string;
  sandboxId: string;
  agentId: string;
  /** agentic-sandbox management WS URL (e.g. ws://localhost:8121) */
  wsEndpoint: string;
}

function TerminalPane({ sessionKey, sandboxId, agentId, wsEndpoint }: TerminalPaneProps) {
  const outputRef = useRef<HTMLPreElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [output, setOutput] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({
      sandbox: sandboxId,
      agent: agentId,
      wsEndpoint,
      command: 'bash',
    });
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/pty/${sessionKey}?${params}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as {
          type: string;
          payload?: string;
          code?: number;
          message?: string;
        };
        if (msg.type === 'data' && msg.payload) {
          setOutput((prev) => {
            const next = prev + msg.payload!;
            return next.length > 100_000 ? next.slice(-100_000) : next;
          });
        } else if (msg.type === 'exit') {
          setOutput((prev) => prev + `\n[Session exited: code ${msg.code ?? 0}]\n`);
          setConnected(false);
        } else if (msg.type === 'error') {
          setOutput((prev) => prev + `\n[Error: ${msg.message ?? 'unknown'}]\n`);
        }
      } catch { /* ignore malformed frames */ }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionKey, sandboxId, agentId, wsEndpoint]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const input = e.currentTarget;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'data', payload: input.value + '\n' }));
      input.value = '';
    }
  };

  return (
    <div className={styles.terminal}>
      <div className={styles.termStatus}>
        <span className={[styles.termDot, connected ? styles.termDotOn : styles.termDotOff].join(' ')} />
        {connected ? 'Connected' : 'Connecting...'}
      </div>
      <pre ref={outputRef} className={styles.termOutput}>
        {output || (connected ? '' : 'Waiting for shell...')}
      </pre>
      <input
        type="text"
        className={styles.termInput}
        placeholder={connected ? 'Type command, press Enter' : 'Disconnected'}
        disabled={!connected}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}

// ---- Session Picker ----

interface ActiveSession {
  /** PTY session key used for /ws/pty/:key route */
  sessionKey: string;
  label: string;
}

export interface SessionPickerProps {
  sandboxId: string;
  agentId: string;
  /** agentic-sandbox management WS URL */
  wsEndpoint: string;
}

export function SessionPicker({ sandboxId, agentId, wsEndpoint }: SessionPickerProps) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveSession | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.agentSessions(sandboxId, agentId);
      setSessions(data.sessions);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }, [sandboxId, agentId]);

  useEffect(() => {
    if (open && !active) {
      fetchSessions();
    }
  }, [open, active, fetchSessions]);

  const handleAttach = (session: Session) => {
    // Namespace the PTY session key to this sandbox+session so concurrent
    // drawers don't share the same PTY registry entry.
    const sessionKey = `sb-${sandboxId.slice(0, 6)}-${agentId.slice(0, 6)}-${session.id}`;
    setActive({ sessionKey, label: session.name ?? session.command });
  };

  const handleNewTerminal = async () => {
    setError(null);
    try {
      const result = await api.createSession(sandboxId, agentId, { command: 'bash' });
      const sessionKey = `sb-${sandboxId.slice(0, 6)}-${agentId.slice(0, 6)}-${result.session_id}`;
      setActive({ sessionKey, label: 'bash' });
      // Refresh list in background
      fetchSessions().catch(() => { /* ignore */ });
    } catch (err) {
      setError(
        `Failed to create session: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleKill = async (sessionId: string) => {
    setError(null);
    try {
      await api.killSession(sandboxId, sessionId);
      // If this was the active terminal, close it
      const suffix = `-${sessionId}`;
      if (active?.sessionKey.endsWith(suffix)) setActive(null);
      await fetchSessions();
    } catch (err) {
      setError(
        `Failed to kill session: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <div className={styles.sessionPicker}>
      <button
        type="button"
        className={styles.toggleBtn}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Terminal Sessions
        <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={styles.drawer}>
          {active ? (
            /* ---- Active terminal pane ---- */
            <div className={styles.terminalWrap}>
              <div className={styles.terminalHeader}>
                <span className={styles.terminalLabel}>{active.label}</span>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => { setActive(null); fetchSessions().catch(() => { /* ignore */ }); }}
                >
                  ← Sessions
                </button>
              </div>
              <TerminalPane
                sessionKey={active.sessionKey}
                sandboxId={sandboxId}
                agentId={agentId}
                wsEndpoint={wsEndpoint}
              />
            </div>
          ) : (
            /* ---- Session list ---- */
            <>
              {error && (
                <div className={styles.errBanner}>
                  {error}
                  <button type="button" onClick={() => setError(null)}>✕</button>
                </div>
              )}

              {loading && <div className={styles.infoRow}>Loading sessions...</div>}

              {!loading && !error && sessions.length === 0 && (
                <div className={styles.infoRow}>No active sessions for this agent.</div>
              )}

              {sessions.map((session) => (
                <div key={session.id} className={styles.sessionRow}>
                  <span
                    className={[
                      styles.dot,
                      session.status === 'running' ? styles.dotRunning : styles.dotExited,
                    ].join(' ')}
                    aria-label={`Status: ${session.status}`}
                  />
                  <span className={styles.sessionLabel} title={session.command}>
                    {session.name ?? session.command}
                  </span>
                  <span className={styles.sessionAge}>{relAge(session.startedAt)}</span>
                  <button
                    type="button"
                    className={styles.attachBtn}
                    onClick={() => handleAttach(session)}
                    disabled={session.status !== 'running'}
                    title={session.status !== 'running' ? 'Session has exited' : 'Attach terminal'}
                  >
                    Attach
                  </button>
                  <button
                    type="button"
                    className={styles.killBtn}
                    onClick={() => handleKill(session.id)}
                    title="Kill session"
                    aria-label="Kill session"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                type="button"
                className={styles.newTermBtn}
                onClick={handleNewTerminal}
              >
                + New Terminal
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
