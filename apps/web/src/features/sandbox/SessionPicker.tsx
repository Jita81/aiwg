/**
 * Session Picker + Inline Terminal
 *
 * The terminal pane connects to the management WS, lists sessions via
 * `list_sessions`, shows an inline picker, then attaches to the chosen one.
 * All session state comes directly from the management WS — no REST/WS naming
 * mismatch possible.
 *
 * Management WS protocol (proxied at /ws/sandbox/:sandboxId/management):
 *
 *   Client → server:
 *     { type: "subscribe",      agent_id }            ← sent together on open
 *     { type: "list_sessions",  agent_id }            ← sent together on open
 *     { type: "attach_session", agent_id, session_name, cols, rows }
 *     { type: "send_input",     agent_id, command_id, data }
 *     { type: "pty_resize",     agent_id, command_id, cols, rows }
 *
 *   Server → client:
 *     { type: "session_list",    agent_id, sessions[] }
 *     { type: "session_attached",agent_id, session_name, command_id }
 *     { type: "output",          agent_id, command_id, data, stream, ts }
 *     { type: "error",           message }
 *
 * Design notes:
 *   - subscribe + list_sessions are sent together on open (one round trip, not two)
 *   - xterm is initialized in a useEffect keyed on phase === 'attached', which runs
 *     AFTER React commits display:block to the container — FitAddon then measures
 *     the real dimensions instead of 0×0 on a hidden element
 *   - The WS session_attached handler only updates refs/state; no async work
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
  const [isExhausted, setIsExhausted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitAddonRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionBuffersRef = useRef<Map<string, string>>(new Map());
  // command_id confirmed by session_attached; drives output routing and input/resize
  const attachedCmdRef = useRef<string | null>(null);
  const pickedSessionRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ------------------------------------------------------------------
  // WS send helper
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
  // xterm init — called from the useEffect below, AFTER React commits
  // the display:block update so FitAddon measures real dimensions.
  // ------------------------------------------------------------------

  const initTerminal = useCallback(async () => {
    if (!containerRef.current) return;

    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);
    if (!containerRef.current) return; // unmounted during async import

    if (xtermRef.current) return; // already initialized (concurrent call)

    const term = new Terminal({
      rows: 24,
      cols: 80,
      scrollback: 0, // replay from sessionBuffersRef on re-attach
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

    // Container is visible at this point (useEffect fires after React paint)
    try { fitAddon.fit(); } catch { /* ignore */ }
    xtermRef.current = term;

    // Keyboard: Ctrl+C copies if selection active, otherwise pass through
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
  }, [agentId, sendWs]);

  // ------------------------------------------------------------------
  // Terminal lifecycle: runs after React commits display:block.
  //
  // On first attach:  init xterm (which now has real dimensions), replay buffer.
  // On re-attach:     fitAddon.fit() to sync dimensions, replay buffer.
  // This is the ONLY place initTerminal is called — never from a WS handler.
  // ------------------------------------------------------------------

  useEffect(() => {
    if (phase !== 'attached' || !containerRef.current) return;
    let cancelled = false;

    const cmdId = attachedCmdRef.current;

    if (!xtermRef.current) {
      // First attach — initialize, then replay buffered output
      initTerminal().then(() => {
        if (cancelled || !xtermRef.current || !cmdId) return;
        const buf = sessionBuffersRef.current.get(cmdId);
        xtermRef.current.clear();
        if (buf) xtermRef.current.write(buf);
        // Sync PTY size now that xterm is measured
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          sendWs({
            type: 'pty_resize',
            agent_id: agentId,
            command_id: cmdId,
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows,
          });
        }
      });
    } else {
      // Re-attach to a different session — fit to container, replay buffer
      try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
      if (cmdId) {
        const buf = sessionBuffersRef.current.get(cmdId);
        xtermRef.current.clear();
        if (buf) xtermRef.current.write(buf);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          sendWs({
            type: 'pty_resize',
            agent_id: agentId,
            command_id: cmdId,
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows,
          });
        }
      }
    }

    return () => { cancelled = true; };
  }, [phase, agentId, initTerminal, sendWs]);

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
        case 'session_list': {
          if (msg['agent_id'] !== agentId) break;
          const raw = (msg['sessions'] as WsSession[] | undefined) ?? [];
          setSessions(raw);
          setPhase((prev) => {
            if (prev === 'listing') {
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
          // Update routing ref — useEffect below handles xterm init/replay
          // after React commits the display:block update to the container.
          attachedCmdRef.current = cmdId;
          setPhase('attached');
          setStatusText(pickedSessionRef.current ?? 'terminal');
          break;
        }

        case 'output': {
          if (msg['agent_id'] !== agentId) break;
          const cmdId = msg['command_id'] as string | undefined;
          const data = msg['data'] as string | undefined;
          if (!cmdId || !data) break;
          // Always buffer (32 KB ring) so re-attach can replay
          let buf = sessionBuffersRef.current.get(cmdId) ?? '';
          buf += data;
          if (buf.length > 32768) buf = buf.slice(-32768);
          sessionBuffersRef.current.set(cmdId, buf);
          // Write to terminal only when attached and initialized
          if (cmdId === attachedCmdRef.current && xtermRef.current) {
            xtermRef.current.write(data);
          }
          break;
        }

        case 'session_created':
          requestSessionList();
          break;

        case 'error': {
          const errMsg = (msg['message'] as string) ?? 'unknown error';
          if (xtermRef.current && attachedCmdRef.current) {
            xtermRef.current.writeln(`\r\n\x1b[31m[Error: ${errMsg}]\x1b[0m`);
          } else {
            setWsError(errMsg);
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
        setIsExhausted(false);
        setConnected(true);
        setStatusText('Listing sessions…');
        setPhase('listing');
        // Send subscribe + list_sessions together — one round trip, not two.
        // The server processes messages in order so subscription is registered
        // before list_sessions is handled.
        ws.send(JSON.stringify({ type: 'subscribe', agent_id: agentId }));
        ws.send(JSON.stringify({ type: 'list_sessions', agent_id: agentId }));
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        if (!isMounted) return;
        setConnected(false);
        const attempt = reconnectAttemptsRef.current;
        if (attempt >= RECONNECT_MAX_ATTEMPTS) {
          setStatusText('Connection lost');
          setIsExhausted(true);
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
  }, [sandboxId, agentId, requestSessionList]);

  // ------------------------------------------------------------------
  // User action handlers
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

  return (
    <div className={styles.terminal}>
      {/* Status bar */}
      <div className={styles.termStatus}>
        <span className={[styles.termDot, connected ? styles.termDotOn : styles.termDotOff].join(' ')} />
        <span>{statusText}</span>
        {phase === 'attached' && (
          <button type="button" className={styles.backBtn} onClick={handleBack}>
            ← Sessions
          </button>
        )}
      </div>

      {/* Non-terminal error banner */}
      {wsError && (
        <div className={styles.errBanner}>
          {wsError}
          <button type="button" onClick={() => setWsError(null)}>✕</button>
        </div>
      )}

      {/* Session picker — shown before terminal is attached */}
      {phase !== 'attached' && (
        <div className={styles.termOutput} style={{ overflowY: 'auto', padding: '8px' }}>
          {(phase === 'connecting' || phase === 'listing') && (
            <div className={styles.infoRow}>
              <span className={styles.spinnerRow}>
                <span className={styles.spinner} />
                {phase === 'connecting' ? 'Connecting…' : 'Listing sessions…'}
              </span>
            </div>
          )}

          {phase === 'attaching' && (
            <div className={styles.infoRow}>
              <span className={styles.spinnerRow}>
                <span className={styles.spinner} />
                Attaching to {pickedSessionRef.current}…
              </span>
            </div>
          )}

          {phase === 'picking' && (
            <>
              {sessions.length === 0 && (
                <div className={styles.infoRow}>No active sessions for this agent.</div>
              )}

              {sessions.map((s) => (
                <div key={s.session_id || s.session_name} className={styles.sessionRow}>
                  <span
                    className={[
                      styles.dot,
                      s.running && s.session_type === 'interactive' ? styles.dotRunning : styles.dotExited,
                    ].join(' ')}
                    title={s.running ? `${s.session_type} — running` : 'not running'}
                  />
                  <span className={styles.sessionLabel} title={s.command}>{s.session_name}</span>
                  <span className={styles.sessionAge}>{s.session_type}</span>
                  <button
                    type="button"
                    className={styles.attachBtn}
                    onClick={() => handleAttach(s)}
                    disabled={!s.running || s.session_type !== 'interactive'}
                    title={
                      !s.running ? 'Session not running'
                      : s.session_type !== 'interactive' ? 'No PTY (headless/background)'
                      : 'Attach terminal'
                    }
                  >
                    Attach
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

      {/*
       * xterm container — always in the DOM once the component mounts,
       * display:none while picking so it doesn't take space, display:block
       * when attached so FitAddon measures real dimensions.
       * The terminal lifecycle useEffect fires AFTER this paint.
       *
       * Overlay: when the WS drops while attached, the xterm stays mounted
       * but receives no data. An overlay communicates reconnect progress and
       * surfaces a Reload button on exhaustion.
       */}
      <div
        ref={containerRef}
        className={styles.termOutput}
        style={{ position: 'relative', display: phase === 'attached' ? 'block' : 'none' }}
      >
        {!connected && (
          <div className={[styles.termOverlay, isExhausted ? styles.termOverlayLost : ''].join(' ').trim()}>
            {isExhausted ? (
              <>
                <span>Connection lost</span>
                <button
                  type="button"
                  className={styles.reloadBtn}
                  onClick={() => window.location.reload()}
                >
                  Reload
                </button>
              </>
            ) : (
              <span className={styles.spinnerRow}>
                <span className={styles.spinner} />
                {statusText}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Session Picker (thin toggle wrapper) ----

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
