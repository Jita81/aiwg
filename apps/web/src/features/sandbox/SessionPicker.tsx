/**
 * Session Picker + Inline Terminal
 *
 * Renders a collapsible session list for a specific sandbox agent.
 * Each session shows name, command, age, has_screen status, and Attach/Kill controls.
 * "+ New Terminal" creates a new bash session via the sandbox REST API.
 * Attaching opens an inline terminal pane using the management WS protocol
 * (proxied through aiwg serve at /ws/sandbox/:sandboxId/management).
 *
 * The management WS is a multicast bus shared by all agents. TerminalPane sends
 * attach_session (by session_name) and receives output frames as raw PTY bytes,
 * buffering all output by command_id for instant replay on re-attach.
 * FitAddon sizes the xterm terminal to the container so the PTY is resized to match.
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

// ---- Management WS terminal pane ----
//
// Connects to the aiwg serve management WS proxy:
//   /ws/sandbox/:sandboxId/management  →  sandbox.wsEndpoint (ws://host:port)
//
// The management WS is a multicast bus.  All agents share one connection.
//
// Client → server frames:
//   { type: "subscribe",      agent_id }                                 ← must send first
//   { type: "attach_session", agent_id, session_name, cols, rows }
//   { type: "send_input",     agent_id, command_id, data }
//   { type: "pty_resize",     agent_id, command_id, cols, rows }
//
// Server → client frames (relevant subset):
//   { type: "subscribed",      agent_id }
//   { type: "output",          agent_id, command_id, data, stream, ts }
//   { type: "session_attached",agent_id, session_name, command_id }
//   { type: "error",           message }
//
// Output buffering: all output is buffered by command_id (last 32 KB) regardless
// of which session is attached.  On attach, the terminal is cleared and the buffer
// is replayed — matching the sandbox management UI's behaviour exactly.

interface TerminalPaneProps {
  sandboxId: string;
  agentId: string;
  sessionId: string;   // used as buffer key before command_id is known
  sessionName: string; // sent in attach_session
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_ATTEMPTS = 8;

function TerminalPane({ sandboxId, agentId, sessionId, sessionName }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitAddonRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // command_id → raw PTY bytes (last 32 KB per session)
  const sessionBuffersRef = useRef<Map<string, string>>(new Map());
  // command_id confirmed by session_attached; null until server responds
  const attachedCmdRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusText, setStatusText] = useState('Connecting…');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let isMounted = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let term: any = null;

    function sendAttach() {
      if (wsRef.current?.readyState !== WebSocket.OPEN || !term) return;
      wsRef.current.send(JSON.stringify({
        type: 'attach_session',
        agent_id: agentId,
        session_name: sessionName,
        cols: term.cols,
        rows: term.rows,
      }));
    }

    function connectWs() {
      if (!isMounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/sandbox/${sandboxId}/management`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        reconnectAttemptsRef.current = 0;
        setConnected(true);
        setStatusText(sessionName);
        // Fit to container so PTY is sized to match the visible terminal
        try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
        // Subscribe first so output frames arrive before we attach
        ws.send(JSON.stringify({ type: 'subscribe', agent_id: agentId }));
        sendAttach();
      };

      ws.onmessage = (evt) => {
        if (!isMounted || !term) return;
        try {
          const msg = JSON.parse(evt.data as string) as Record<string, unknown>;
          switch (msg['type']) {
            case 'output': {
              // Only handle output for our agent
              if (msg['agent_id'] !== agentId) break;
              const cmdId = msg['command_id'] as string | undefined;
              const data = msg['data'] as string | undefined;
              if (!cmdId || !data) break;

              // Always buffer (last 32 KB)
              let buf = sessionBuffersRef.current.get(cmdId) ?? '';
              buf += data;
              if (buf.length > 32768) buf = buf.slice(-32768);
              sessionBuffersRef.current.set(cmdId, buf);

              // Write to terminal only when this is our attached session
              if (cmdId === attachedCmdRef.current) {
                term.write(data);
              }
              break;
            }
            case 'session_attached': {
              if (msg['agent_id'] !== agentId) break;
              const cmdId = msg['command_id'] as string | undefined;
              if (!cmdId) break;
              const prev = attachedCmdRef.current;
              attachedCmdRef.current = cmdId;

              // On first attach or if command_id changed, replay from buffer
              if (prev !== cmdId) {
                term.clear();
                const buf = sessionBuffersRef.current.get(cmdId);
                if (buf) term.write(buf);
              }
              setStatusText(sessionName);
              break;
            }
            case 'error':
              term.writeln(`\r\n\x1b[31m[Error: ${msg['message'] ?? 'unknown'}]\x1b[0m`);
              break;
          }
        } catch { /* ignore malformed frames */ }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setConnected(false);
        const attempt = reconnectAttemptsRef.current;
        if (attempt >= RECONNECT_MAX_ATTEMPTS) {
          setStatusText('Connection lost — go back and re-attach');
          return;
        }
        const delay = RECONNECT_BASE_MS * Math.pow(2, attempt);
        reconnectAttemptsRef.current = attempt + 1;
        setStatusText(`Reconnecting… (${attempt + 1}/${RECONNECT_MAX_ATTEMPTS})`);
        reconnectTimerRef.current = setTimeout(() => {
          if (isMounted) {
            attachedCmdRef.current = null; // will be re-confirmed by session_attached
            connectWs();
          }
        }, delay);
      };

      ws.onerror = () => { /* onclose handles recovery */ };
    }

    async function init() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (!isMounted || !containerRef.current) return;

      term = new Terminal({
        rows: 24,
        cols: 80,
        // scrollback:0 — we replay from sessionBuffersRef on re-attach; accumulating
        // old output in scrollback causes content to shift up incorrectly.
        scrollback: 0,
        cursorBlink: true,
        convertEol: false,
        theme: {
          background: '#0d0d0d',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          selectionBackground: 'rgba(255,255,255,0.25)',
        },
        fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
        fontSize: 12,
        lineHeight: 1.3,
      });

      // Inner wrapper with 100% height so FitAddon measures the container correctly
      const wrapper = document.createElement('div');
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';
      containerRef.current!.appendChild(wrapper);

      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;
      term.loadAddon(fitAddon);
      term.open(wrapper);
      try { fitAddon.fit(); } catch { /* ignore */ }
      xtermRef.current = term;

      // Ctrl+C: copy when text selected; otherwise pass through
      term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
        if (ev.type !== 'keydown') return true;
        if (ev.ctrlKey && ev.key === 'c' && term.hasSelection()) return false;
        if (ev.ctrlKey && ev.key === 'v') return false;
        return true;
      });

      term.onData((data: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && attachedCmdRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'send_input',
            agent_id: agentId,
            command_id: attachedCmdRef.current,
            data,
          }));
        }
      });

      // Re-fit and resize PTY when the container changes size
      const resizeObserver = new ResizeObserver(() => {
        if (!isMounted) return;
        try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
        if (wsRef.current?.readyState === WebSocket.OPEN && attachedCmdRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'pty_resize',
            agent_id: agentId,
            command_id: attachedCmdRef.current,
            cols: term.cols,
            rows: term.rows,
          }));
        }
      });
      resizeObserverRef.current = resizeObserver;
      resizeObserver.observe(containerRef.current!);

      requestAnimationFrame(() => { if (isMounted) connectWs(); });
    }

    init();

    return () => {
      isMounted = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      wsRef.current?.close();
      xtermRef.current?.dispose();
      wsRef.current = null;
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sandboxId, agentId, sessionId, sessionName]);

  return (
    <div className={styles.terminal}>
      <div className={styles.termStatus}>
        <span className={[styles.termDot, connected ? styles.termDotOn : styles.termDotOff].join(' ')} />
        <span>{statusText}</span>
      </div>
      <div ref={containerRef} className={styles.termOutput} />
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
  const [open, setOpen] = useState(true);
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
      return data.sessions;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
    } finally {
      setLoading(false);
    }
  }, [sandboxId, agentId]);

  // Fetch on open; poll every 5 s while list is visible.
  // On first load, auto-attach if exactly one attachable session exists.
  const didAutoAttach = useRef(false);
  useEffect(() => {
    if (!open || active) return;
    let cancelled = false;
    fetchSessions().then((initial) => {
      if (cancelled || didAutoAttach.current) return;
      const attachable = initial.filter(s => s.has_screen);
      if (attachable.length === 1) {
        didAutoAttach.current = true;
        setActive({ sessionId: attachable[0].session_id, sessionName: attachable[0].session_name });
      }
    });
    const id = setInterval(fetchSessions, 5_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [open, active, fetchSessions]);

  const handleAttach = (session: Session) => {
    setActive({ sessionId: session.session_id, sessionName: session.session_name });
  };

  const handleNewTerminal = async () => {
    setError(null);
    try {
      // Re-fetch to check for an existing attachable session before creating a new one
      const current = await api.agentSessions(sandboxId, agentId);
      const attachable = current.sessions.filter(s => s.has_screen);
      if (attachable.length > 0) {
        // Prefer the most-recently-seen session (last in list)
        const pick = attachable[attachable.length - 1];
        setSessions(current.sessions);
        setActive({ sessionId: pick.session_id, sessionName: pick.session_name });
        return;
      }
      // No live session — create a new one
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
                agentId={agentId}
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
