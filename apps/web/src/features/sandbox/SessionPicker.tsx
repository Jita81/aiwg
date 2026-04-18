/**
 * Session Picker + Inline Terminal
 *
 * Renders a collapsible session list for a specific sandbox agent.
 * Each session shows name, command, age, has_screen status, and Attach/Kill controls.
 * "+ New Terminal" creates a new bash session via the sandbox REST API.
 * Attaching opens an inline terminal pane using the orchestrate WS protocol
 * (proxied through aiwg serve at /ws/sandbox/:sandboxId/sessions/:sessionId/orchestrate).
 *
 * The orchestrate WS sends structured screen_update frames (VT100 rendered text),
 * not raw PTY bytes. The TerminalPane replaces its display on each frame.
 *
 * Session list auto-refreshes every 5 s while the drawer is open with no active
 * terminal, and is also triggered by Attach/Kill/New actions.
 *
 * @issue #896
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { api, type Session } from '../../lib/api.js';
import styles from './SessionPicker.module.css';

// ---- Helpers ----

function relAge(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

// ---- Orchestrate terminal pane ----
//
// Connects to the aiwg serve orchestrate WS proxy:
//   /ws/sandbox/:sandboxId/sessions/:sessionId/orchestrate
//
// Server → client frames (tagged union on `type`):
//   session_start  { session_id }
//   screen_update  { session_id, timestamp, screen: { rows, cols, text, cursor_row, cursor_col, scrollback_tail }, prompt_detected }
//   prompt_detected { session_id, prompt_text, confidence }
//   session_end    { session_id, exit_code? }
//   error          { message }
//
// Client → server frames:
//   { type: "write",  text: string }
//   { type: "resize", rows: number, cols: number }
//   { type: "signal", signal: "SIGINT" | "SIGTERM" | "SIGKILL" }

interface TerminalPaneProps {
  sandboxId: string;
  sessionId: string;
  sessionName: string;
}

function TerminalPane({ sandboxId, sessionId, sessionName }: TerminalPaneProps) {
  const outputRef = useRef<HTMLPreElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [screen, setScreen] = useState('');
  const [scrollback, setScrollback] = useState('');
  const [connected, setConnected] = useState(false);
  const [exited, setExited] = useState(false);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/sandbox/${sandboxId}/sessions/${sessionId}/orchestrate`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as Record<string, unknown>;
        switch (msg['type']) {
          case 'screen_update': {
            const s = msg['screen'] as { text?: string; scrollback_tail?: string } | undefined;
            if (s?.text !== undefined) setScreen(s.text);
            if (s?.scrollback_tail !== undefined) setScrollback(s.scrollback_tail);
            break;
          }
          case 'session_end':
            setExited(true);
            setConnected(false);
            setScreen((prev) => prev + `\n[Session ended${msg['exit_code'] !== undefined ? `: exit ${msg['exit_code']}` : ''}]\n`);
            break;
          case 'error':
            setScreen((prev) => prev + `\n[Error: ${msg['message'] ?? 'unknown'}]\n`);
            break;
        }
      } catch { /* ignore malformed frames */ }
    };

    ws.onclose = () => { setConnected(false); wsRef.current = null; };
    ws.onerror = () => setConnected(false);

    return () => { ws.close(); wsRef.current = null; };
  }, [sandboxId, sessionId]);

  // Auto-scroll on content change
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [screen, scrollback]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const input = e.currentTarget;
    if (e.key === 'Enter') {
      wsRef.current.send(JSON.stringify({ type: 'write', text: input.value + '\n' }));
      input.value = '';
    } else if (e.ctrlKey && e.key === 'c') {
      wsRef.current.send(JSON.stringify({ type: 'signal', signal: 'SIGINT' }));
      e.preventDefault();
    }
  };

  return (
    <div className={styles.terminal}>
      <div className={styles.termStatus}>
        <span className={[styles.termDot, connected ? styles.termDotOn : styles.termDotOff].join(' ')} />
        <span>{connected ? sessionName : exited ? 'Session exited' : 'Connecting...'}</span>
      </div>
      <pre ref={outputRef} className={styles.termOutput}>
        {scrollback ? scrollback + '\n' : ''}
        {screen || (connected ? '' : 'Waiting for screen...')}
      </pre>
      <input
        type="text"
        className={styles.termInput}
        placeholder={connected ? 'Type and press Enter  (Ctrl+C sends SIGINT)' : 'Disconnected'}
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
  sessionId: string;
  sessionName: string;
}

export interface SessionPickerProps {
  sandboxId: string;
  agentId: string;
}

export function SessionPicker({ sandboxId, agentId }: SessionPickerProps) {
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sandboxId, agentId]);

  // Fetch on open; poll every 5 s while list is visible
  useEffect(() => {
    if (!open || active) return;
    fetchSessions();
    const id = setInterval(fetchSessions, 5_000);
    return () => clearInterval(id);
  }, [open, active, fetchSessions]);

  const handleAttach = (session: Session) => {
    setActive({ sessionId: session.session_id, sessionName: session.session_name });
  };

  const handleNewTerminal = async () => {
    setError(null);
    try {
      const result = await api.createSession(sandboxId, agentId, { command: 'bash' });
      setActive({ sessionId: result.session_id, sessionName: result.session_name });
      fetchSessions().catch(() => { /* ignore */ });
    } catch (err) {
      setError(`Failed to create session: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleKill = async (sessionName: string) => {
    setError(null);
    try {
      await api.killSession(sandboxId, agentId, sessionName);
      if (active?.sessionName === sessionName) setActive(null);
      await fetchSessions();
    } catch (err) {
      setError(`Failed to kill session: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleBack = () => {
    setActive(null);
    fetchSessions().catch(() => { /* ignore */ });
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
                <span className={styles.terminalLabel}>{active.sessionName}</span>
                <button type="button" className={styles.backBtn} onClick={handleBack}>
                  ← Sessions
                </button>
              </div>
              <TerminalPane
                sandboxId={sandboxId}
                sessionId={active.sessionId}
                sessionName={active.sessionName}
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

              {loading && sessions.length === 0 && (
                <div className={styles.infoRow}>Loading sessions...</div>
              )}

              {!loading && sessions.length === 0 && !error && (
                <div className={styles.infoRow}>No active sessions for this agent.</div>
              )}

              {sessions.map((session) => (
                <div key={session.session_id} className={styles.sessionRow}>
                  <span
                    className={[styles.dot, session.has_screen ? styles.dotRunning : styles.dotExited].join(' ')}
                    title={session.has_screen ? 'Attachable' : 'No screen state'}
                    aria-label={session.has_screen ? 'Attachable' : 'No screen state'}
                  />
                  <span className={styles.sessionLabel} title={`${session.command} (${session.session_type})`}>
                    {session.session_name}
                  </span>
                  <span className={styles.sessionAge}>{relAge(session.created_at_secs)}</span>
                  <button
                    type="button"
                    className={styles.attachBtn}
                    onClick={() => handleAttach(session)}
                    disabled={!session.has_screen}
                    title={!session.has_screen ? 'No screen state — session may have exited' : 'Attach terminal'}
                  >
                    Attach
                  </button>
                  <button
                    type="button"
                    className={styles.killBtn}
                    onClick={() => handleKill(session.session_name)}
                    title="Kill session"
                    aria-label="Kill session"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button type="button" className={styles.newTermBtn} onClick={handleNewTerminal}>
                + New Terminal
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
