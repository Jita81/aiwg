/**
 * Session Picker + Inline Terminal
 *
 * The terminal pane connects to the management WS, lists sessions via
 * `list_sessions`, shows an inline picker, then attaches to the chosen one.
 * All session state (names, IDs, running status) comes directly from the
 * management WS so there are no REST ↔ WS naming mismatches.
 *
 * Management WS protocol (proxied at /ws/sandbox/:sandboxId/management):
 *
 *   Client → server:
 *     { type: "subscribe",      agent_id }
 *     { type: "list_sessions",  agent_id }
 *     { type: "attach_session", agent_id, session_name, cols, rows }
 *     { type: "create_session", agent_id, session_name, session_type,
 *                               command, cols, rows }
 *     { type: "send_input",     agent_id, command_id, data }
 *     { type: "pty_resize",     agent_id, command_id, cols, rows }
 *
 *   Server → client:
 *     { type: "subscribed",      agent_id }
 *     { type: "session_list",    agent_id, sessions[] }
 *     { type: "session_attached",agent_id, session_name, command_id }
 *     { type: "session_created", agent_id, session_name, ... }
 *     { type: "output",          agent_id, command_id, data, stream, ts }
 *     { type: "error",           message }
 *
 * @issue #896
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api.js';
import styles from './SessionPicker.module.css';

// ---- Types ----

interface WsSession {
  session_name: string;
  command_id: string;
  session_id: string;
  session_type: string;
  command: string;
  running: boolean;
}

// ---- Terminal Pane ----
//
// Owns the full lifecycle: WS connection → session list → pick → attach → I/O.

interface TerminalPaneProps {
  sandboxId: string;
  agentId: string;
}

type Phase = 'connecting' | 'listing' | 'picking' | 'attaching' | 'attached';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_ATTEMPTS = 8;

function TerminalPane({ sandboxId, agentId }: TerminalPaneProps) {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [sessions, setSessions] = useState<WsSession[]>([]);
  const [statusText, setStatusText] = useState('Connecting…');
  const [wsError, setWsError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitAddonRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionBuffersRef = useRef<Map<string, string>>(new Map());
  const attachedCmdRef = useRef<string | null>(null);
  const pickedSessionRef = useRef<string | null>(null); // session_name being attached
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>('connecting');

  // Keep phaseRef in sync so WS handlers can read current phase without stale closure
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ------------------------------------------------------------------
  // WS helpers (stable refs, not subject to React re-render)
  // ------------------------------------------------------------------

  const sendWs = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const requestSessionList = useCallback(() => {
    sendWs({ type: 'list_sessions', agent_id: agentId });
  }, [agentId, sendWs]);

  // ------------------------------------------------------------------
  // xterm initialisation (runs after the container div is visible)
  // ------------------------------------------------------------------

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || xtermRef.current) return;
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);
    if (!containerRef.current) return; // unmounted during async import

    const term = new Terminal({
      rows: 24,
      cols: 80,
      scrollback: 0, // replay from buffer on re-attach
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

    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    containerRef.current.appendChild(wrapper);

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(wrapper);
    try { fitAddon.fit(); } catch { /* ignore */ }
    xtermRef.current = term;

    // Ctrl+C: copy if selection; otherwise pass through
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      if (ev.type !== 'keydown') return true;
      if (ev.ctrlKey && ev.key === 'c' && term.hasSelection()) return false;
      if (ev.ctrlKey && ev.key === 'v') return false;
      return true;
    });

    term.onData((data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && attachedCmdRef.current) {
        sendWs({ type: 'send_input', agent_id: agentId, command_id: attachedCmdRef.current, data });
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
      if (wsRef.current?.readyState === WebSocket.OPEN && attachedCmdRef.current && xtermRef.current) {
        sendWs({
          type: 'pty_resize',
          agent_id: agentId,
          command_id: attachedCmdRef.current,
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows,
        });
      }
    });
    resizeObserverRef.current = resizeObserver;
    resizeObserver.observe(containerRef.current);

    // Sync PTY dimensions now that xterm is sized
    if (attachedCmdRef.current) {
      sendWs({
        type: 'pty_resize',
        agent_id: agentId,
        command_id: attachedCmdRef.current,
        cols: term.cols,
        rows: term.rows,
      });
    }
  }, [agentId, sendWs]);

  // ------------------------------------------------------------------
  // WS connection lifecycle
  // ------------------------------------------------------------------

  useEffect(() => {
    let isMounted = true;

    function handleMessage(evt: MessageEvent) {
      if (!isMounted) return;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(evt.data as string); }
      catch { return; }

      switch (msg['type']) {
        case 'subscribed':
          // Subscription confirmed — now request the session list
          requestSessionList();
          break;

        case 'session_list': {
          if (msg['agent_id'] !== agentId) break;
          const raw = (msg['sessions'] as WsSession[] | undefined) ?? [];
          setSessions(raw);
          setPhase((prev) => {
            if (prev === 'connecting' || prev === 'listing') {
              // Auto-attach if exactly one running interactive session
              const attachable = raw.filter(s => s.running && s.session_type === 'interactive');
              if (attachable.length === 1) {
                const s = attachable[0];
                pickedSessionRef.current = s.session_name;
                wsRef.current?.send(JSON.stringify({
                  type: 'attach_session',
                  agent_id: agentId,
                  session_name: s.session_name,
                  cols: 80,
                  rows: 24,
                }));
                return 'attaching';
              }
              return 'picking';
            }
            return prev; // mid-session refresh — stay in current phase
          });
          break;
        }

        case 'session_attached': {
          if (msg['agent_id'] !== agentId) break;
          const cmdId = msg['command_id'] as string | undefined;
          if (!cmdId) break;
          const prev = attachedCmdRef.current;
          attachedCmdRef.current = cmdId;
          setPhase('attached');
          setStatusText(pickedSessionRef.current ?? 'terminal');

          // Init xterm lazily on first attach
          if (!xtermRef.current) {
            initTerminal().then(() => {
              if (!isMounted || !xtermRef.current) return;
              if (prev !== cmdId) {
                xtermRef.current.clear();
                const buf = sessionBuffersRef.current.get(cmdId);
                if (buf) xtermRef.current.write(buf);
              }
            });
          } else if (prev !== cmdId) {
            xtermRef.current.clear();
            const buf = sessionBuffersRef.current.get(cmdId);
            if (buf) xtermRef.current.write(buf);
          }
          break;
        }

        case 'session_created':
          // New session created — refresh the list
          requestSessionList();
          break;

        case 'output': {
          if (msg['agent_id'] !== agentId) break;
          const cmdId = msg['command_id'] as string | undefined;
          const data = msg['data'] as string | undefined;
          if (!cmdId || !data) break;
          let buf = sessionBuffersRef.current.get(cmdId) ?? '';
          buf += data;
          if (buf.length > 32768) buf = buf.slice(-32768);
          sessionBuffersRef.current.set(cmdId, buf);
          if (cmdId === attachedCmdRef.current && xtermRef.current) {
            xtermRef.current.write(data);
          }
          break;
        }

        case 'error': {
          const errMsg = (msg['message'] as string) ?? 'unknown error';
          if (xtermRef.current && phaseRef.current === 'attached') {
            xtermRef.current.writeln(`\r\n\x1b[31m[Error: ${errMsg}]\x1b[0m`);
          } else {
            setWsError(errMsg);
            // If we were mid-attach, drop back to the picker
            setPhase((prev) => (prev === 'attaching' ? 'picking' : prev));
          }
          break;
        }
      }
    }

    function connect() {
      if (!isMounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/sandbox/${sandboxId}/management`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        reconnectAttemptsRef.current = 0;
        setConnected(true);
        setStatusText('Listing sessions…');
        setPhase('listing');
        // Subscribe first; session_list is requested in the 'subscribed' handler
        ws.send(JSON.stringify({ type: 'subscribe', agent_id: agentId }));
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        if (!isMounted) return;
        setConnected(false);
        const attempt = reconnectAttemptsRef.current;
        if (attempt >= RECONNECT_MAX_ATTEMPTS) {
          setStatusText('Connection lost — refresh to retry');
          return;
        }
        const delay = RECONNECT_BASE_MS * Math.pow(2, attempt);
        reconnectAttemptsRef.current = attempt + 1;
        setStatusText(`Reconnecting… (${attempt + 1}/${RECONNECT_MAX_ATTEMPTS})`);
        reconnectTimerRef.current = setTimeout(() => {
          if (isMounted) {
            attachedCmdRef.current = null;
            pickedSessionRef.current = null;
            setPhase('connecting');
            connect();
          }
        }, delay);
      };

      ws.onerror = () => { /* onclose handles recovery */ };
    }

    connect();

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
  }, [sandboxId, agentId, requestSessionList, initTerminal]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handleAttach = (session: WsSession) => {
    setWsError(null);
    pickedSessionRef.current = session.session_name;
    sendWs({
      type: 'attach_session',
      agent_id: agentId,
      session_name: session.session_name,
      cols: 80,
      rows: 24,
    });
    setPhase('attaching');
    setStatusText(`Attaching to ${session.session_name}…`);
  };

  const handleNewTerminal = async () => {
    setWsError(null);
    try {
      // Use REST API for session creation (sandbox-side operation)
      await api.createSession(sandboxId, agentId, { command: 'bash' });
      requestSessionList();
    } catch (err) {
      setWsError(`Failed to create session: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleBack = () => {
    attachedCmdRef.current = null;
    pickedSessionRef.current = null;
    setPhase('listing');
    setStatusText('Listing sessions…');
    requestSessionList();
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const attachable = sessions.filter(s => s.running && s.session_type === 'interactive');

  return (
    <div className={styles.terminal}>
      {/* Status bar — always visible */}
      <div className={styles.termStatus}>
        <span className={[styles.termDot, connected ? styles.termDotOn : styles.termDotOff].join(' ')} />
        <span>{statusText}</span>
        {phase === 'attached' && (
          <button type="button" className={styles.backBtn} onClick={handleBack}>
            ← Sessions
          </button>
        )}
      </div>

      {/* Error banner (non-terminal errors) */}
      {wsError && (
        <div className={styles.errBanner}>
          {wsError}
          <button type="button" onClick={() => setWsError(null)}>✕</button>
        </div>
      )}

      {/* Session picker — shown in connecting/listing/picking/attaching phases */}
      {phase !== 'attached' && (
        <div className={styles.termOutput} style={{ overflowY: 'auto', padding: '8px' }}>
          {(phase === 'connecting' || phase === 'listing') && (
            <div className={styles.infoRow}>
              {phase === 'connecting' ? 'Connecting to management server…' : 'Listing sessions…'}
            </div>
          )}

          {phase === 'attaching' && (
            <div className={styles.infoRow}>Attaching to {pickedSessionRef.current}…</div>
          )}

          {(phase === 'picking') && (
            <>
              {sessions.length === 0 && (
                <div className={styles.infoRow}>No active sessions for this agent.</div>
              )}

              {sessions.map((s) => (
                <div key={s.session_id || s.session_name} className={styles.sessionRow}>
                  <span
                    className={[
                      styles.dot,
                      s.running && s.session_type === 'interactive' ? styles.dotRunning : styles.dotExited
                    ].join(' ')}
                    title={s.running ? `Running — ${s.session_type}` : 'Not running'}
                  />
                  <span className={styles.sessionLabel} title={s.command}>
                    {s.session_name}
                  </span>
                  <span className={styles.sessionAge}>{s.session_type}</span>
                  <button
                    type="button"
                    className={styles.attachBtn}
                    onClick={() => handleAttach(s)}
                    disabled={!s.running || s.session_type !== 'interactive'}
                    title={!s.running ? 'Session not running' : s.session_type !== 'interactive' ? 'No PTY — headless/background session' : 'Attach terminal'}
                  >
                    Attach
                  </button>
                </div>
              ))}

              <button type="button" className={styles.newTermBtn} onClick={handleNewTerminal}>
                + New Terminal
              </button>

              {attachable.length === 0 && sessions.length > 0 && (
                <div className={styles.infoRow} style={{ marginTop: 6 }}>
                  No attachable sessions (interactive + running). Create a new one above.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* xterm container — always mounted once attached so xterm has a stable DOM node */}
      <div
        ref={containerRef}
        className={styles.termOutput}
        style={{ display: phase === 'attached' ? 'block' : 'none' }}
      />
    </div>
  );
}

// ---- Session Picker (thin wrapper) ----

export interface SessionPickerProps {
  sandboxId: string;
  agentId: string;
}

export function SessionPicker({ sandboxId, agentId }: SessionPickerProps) {
  const [open, setOpen] = useState(true);

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
          <TerminalPane sandboxId={sandboxId} agentId={agentId} />
        </div>
      )}
    </div>
  );
}
