/**
 * WebSocket PTY Bridge
 *
 * Bridges browser WebSocket connections to local PTY processes via node-pty.
 * Phase 1 (local exec): spawns commands using node-pty.
 * Phase 2 (container/VM): will delegate to agentic-sandbox PTY adapter (#657).
 *
 * Protocol over WebSocket:
 *   Client → Server: { type: 'data', payload: string }    — stdin to PTY
 *   Client → Server: { type: 'resize', cols: number, rows: number }
 *   Client → Server: { type: 'close' }                    — request graceful shutdown
 *   Server → Client: { type: 'data', payload: string }    — stdout/stderr from PTY
 *   Server → Client: { type: 'exit', code: number }       — PTY process exited
 *   Server → Client: { type: 'error', message: string }   — error notification
 *
 * @issue #712
 * @see #657 — agentic-sandbox PTY transport (backend upgrade)
 * @see #711 — HTTP server scaffold
 */

// ============================================================
// Types
// ============================================================

export interface WsMessage {
  type: 'data' | 'resize' | 'close' | 'exit' | 'error';
  payload?: string;
  message?: string;
  cols?: number;
  rows?: number;
  code?: number;
}

export interface PtySession {
  id: string;
  /** Connected WebSocket clients (wsId → ws) */
  clients: Map<string, WebSocketLike>;
  /** Recent output buffer for reconnect replay (max OUTPUT_BUFFER_MAX chars) */
  outputBuffer: string;
  /** Underlying IPty instance (node-pty) */
  pty: PtyLike | null;
  /** Timestamp of last client disconnect (for cleanup) */
  lastDisconnect: number;
  /** Whether the PTY process has exited */
  exited: boolean;
}

/** Minimal WebSocket interface for dependency injection / testing */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
}

/** Minimal IPty interface (subset of node-pty IPty) */
export interface PtyLike {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (event: { exitCode: number }) => void): void;
}

// ============================================================
// Constants
// ============================================================

const OUTPUT_BUFFER_MAX = 64 * 1024; // 64 KB replay buffer per session
const SESSION_TTL_MS = 30_000;       // 30 s before orphaned session is cleaned up

// ============================================================
// Session Registry
// ============================================================

export class PtySessionRegistry {
  private sessions = new Map<string, PtySession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodically clean up orphaned sessions
    this.cleanupTimer = setInterval(() => this.evictExpired(), SESSION_TTL_MS);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  get(id: string): PtySession | undefined {
    return this.sessions.get(id);
  }

  create(id: string): PtySession {
    const session: PtySession = {
      id,
      clients: new Map(),
      outputBuffer: '',
      pty: null,
      lastDisconnect: 0,
      exited: false,
    };
    this.sessions.set(id, session);
    return session;
  }

  delete(id: string): void {
    const session = this.sessions.get(id);
    if (session?.pty) {
      try { session.pty.kill(); } catch { /* ignore */ }
    }
    this.sessions.delete(id);
  }

  addClient(sessionId: string, clientId: string, ws: WebSocketLike): void {
    const session = this.sessions.get(sessionId);
    if (session) session.clients.set(clientId, ws);
  }

  removeClient(sessionId: string, clientId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.clients.delete(clientId);
    if (session.clients.size === 0) {
      session.lastDisconnect = Date.now();
    }
  }

  appendOutput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.outputBuffer += data;
    if (session.outputBuffer.length > OUTPUT_BUFFER_MAX) {
      session.outputBuffer = session.outputBuffer.slice(-OUTPUT_BUFFER_MAX);
    }
  }

  broadcast(sessionId: string, msg: WsMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const text = JSON.stringify(msg);
    for (const ws of session.clients.values()) {
      if (ws.readyState === 1 /* OPEN */) {
        try { ws.send(text); } catch { /* ignore closed sockets */ }
      }
    }
  }

  private evictExpired(): void {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, session] of this.sessions) {
      const orphaned = session.clients.size === 0 && session.lastDisconnect < cutoff;
      if (orphaned || session.exited) {
        this.delete(id);
      }
    }
  }

  shutdown(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    for (const id of this.sessions.keys()) {
      this.delete(id);
    }
  }
}

// Singleton registry shared across WebSocket connections
export const registry = new PtySessionRegistry();

// ============================================================
// PTY Spawn
// ============================================================

/**
 * Spawn a PTY process for the given session.
 *
 * Delegates to agentic-sandbox if AIWG_SANDBOX_ENDPOINT is set or a sandbox
 * is registered; otherwise falls back to local node-pty.
 *
 * @issue #657 — sandbox transport for PTY adapter
 */
export async function spawnPty(
  session: PtySession,
  command: string,
  args: string[],
  opts: { cols?: number; rows?: number; cwd?: string; sandboxEndpoint?: string; agentId?: string } = {},
): Promise<void> {
  const sandboxEndpoint = opts.sandboxEndpoint || process.env.AIWG_SANDBOX_ENDPOINT;

  if (sandboxEndpoint) {
    // Phase 2: delegate to agentic-sandbox via HTTP REST → gRPC bridge
    await spawnSandboxPty(session, command, args, {
      ...opts,
      sandboxEndpoint,
      agentId: opts.agentId || process.env.AIWG_SANDBOX_AGENT_ID || 'agent-01',
    });
    return;
  }

  // Phase 1: local exec via node-pty
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ptyMod: any;
  try {
    ptyMod = await (new Function('m', 'return import(m)'))('node-pty');
  } catch {
    throw new Error('node-pty is required for PTY sessions. Install it: npm install node-pty');
  }

  const pty: PtyLike = ptyMod.spawn(command, args, {
    name: 'xterm-256color',
    cols: opts.cols ?? 120,
    rows: opts.rows ?? 30,
    cwd: opts.cwd ?? process.cwd(),
    env: process.env as Record<string, string>,
  });

  session.pty = pty;

  pty.onData((data: string) => {
    registry.appendOutput(session.id, data);
    registry.broadcast(session.id, { type: 'data', payload: data });
  });

  pty.onExit(({ exitCode }: { exitCode: number }) => {
    session.exited = true;
    registry.broadcast(session.id, { type: 'exit', code: exitCode });
  });
}

/**
 * Spawn a PTY session on a remote agentic-sandbox instance.
 * Submits a task and polls for log output via REST.
 *
 * @issue #657
 */
async function spawnSandboxPty(
  session: PtySession,
  command: string,
  args: string[],
  opts: { cols?: number; rows?: number; cwd?: string; sandboxEndpoint: string; agentId: string },
): Promise<void> {
  const endpoint = opts.sandboxEndpoint.replace(/\/$/, '');
  const cmdLine = [command, ...args].join(' ');

  // Submit task manifest
  const manifest = {
    manifest_yaml: [
      'version: "1"',
      'kind: Task',
      'metadata:',
      `  name: "pty-${session.id}"`,
      '  labels:',
      '    aiwg_transport: pty',
      `    aiwg_session: "${session.id}"`,
      'claude:',
      `  prompt: "${cmdLine}"`,
      '  headless: true',
      '  skip_permissions: true',
      'vm:',
      '  profile: agentic-dev',
    ].join('\n'),
  };

  const resp = await fetch(`${endpoint}/api/v1/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Sandbox task submission failed: ${resp.status} ${body}`);
  }

  const result = await resp.json() as { task_id: string };
  const taskId = result.task_id;

  // Create a PtyLike wrapper that routes I/O through the sandbox REST API
  let logOffset = 0;
  let stopped = false;

  const sandboxPty: PtyLike = {
    write(data: string) {
      if (stopped) return;
      fetch(`${endpoint}/api/v1/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stdin: data }),
      }).catch(() => { /* best-effort */ });
    },
    resize(_cols: number, _rows: number) {
      // Resize handled by browser WS direct connection to sandbox :8121
    },
    kill(_signal?: string) {
      if (stopped) return;
      stopped = true;
      fetch(`${endpoint}/api/v1/tasks/${taskId}`, { method: 'DELETE' })
        .catch(() => { /* best-effort */ });
    },
    onData(callback: (data: string) => void) {
      // Poll for log output
      const timer = setInterval(async () => {
        if (stopped) { clearInterval(timer); return; }
        try {
          const logResp = await fetch(`${endpoint}/api/v1/tasks/${taskId}/logs?offset=${logOffset}`);
          if (!logResp.ok) {
            if (logResp.status === 404) { stopped = true; clearInterval(timer); }
            return;
          }
          const text = await logResp.text();
          if (text.length > 0) {
            logOffset += text.length;
            callback(text);
          }
        } catch { /* retry next poll */ }
      }, 500);
    },
    onExit(callback: (event: { exitCode: number }) => void) {
      // Poll for task completion
      const timer = setInterval(async () => {
        if (stopped) { clearInterval(timer); return; }
        try {
          const statusResp = await fetch(`${endpoint}/api/v1/tasks/${taskId}`);
          if (!statusResp.ok) return;
          const task = await statusResp.json() as { state: string };
          if (['completed', 'failed', 'cancelled'].includes(task.state)) {
            stopped = true;
            clearInterval(timer);
            callback({ exitCode: task.state === 'completed' ? 0 : 1 });
          }
        } catch { /* retry */ }
      }, 2000);
    },
  };

  session.pty = sandboxPty;

  sandboxPty.onData((data: string) => {
    registry.appendOutput(session.id, data);
    registry.broadcast(session.id, { type: 'data', payload: data });
  });

  sandboxPty.onExit(({ exitCode }: { exitCode: number }) => {
    session.exited = true;
    registry.broadcast(session.id, { type: 'exit', code: exitCode });
  });
}

// ============================================================
// WebSocket Connection Handler
// ============================================================

let clientCounter = 0;

/**
 * Handle a new WebSocket connection for a PTY session.
 *
 * @param sessionId - PTY session ID from the URL path
 * @param ws - WebSocket-like interface
 * @param command - Command to spawn (default: 'aiwg')
 * @param args - Command arguments (default: ['mc', 'watch'])
 * @param cwd - Working directory
 */
export async function handlePtyConnection(
  sessionId: string,
  ws: WebSocketLike,
  command = 'aiwg',
  cmdArgs: string[] = ['mc', 'watch'],
  cwd?: string,
): Promise<void> {
  const clientId = `client-${++clientCounter}`;

  let session = registry.get(sessionId);

  if (!session) {
    // New session — create and spawn PTY
    session = registry.create(sessionId);
    registry.addClient(sessionId, clientId, ws);
    try {
      await spawnPty(session, command, cmdArgs, { cwd });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ws.send(JSON.stringify({ type: 'error', message: msg }));
      ws.close(1011, 'PTY spawn failed');
      registry.delete(sessionId);
      return;
    }
  } else if (!session.exited) {
    // Reconnect to existing session — replay buffer
    registry.addClient(sessionId, clientId, ws);
    if (session.outputBuffer) {
      ws.send(JSON.stringify({ type: 'data', payload: session.outputBuffer }));
    }
  } else {
    // Session exited — inform client
    ws.send(JSON.stringify({ type: 'exit', code: 0 }));
    ws.close(1000, 'Session already exited');
    return;
  }

  // Handle incoming messages from browser
  const onMessage = (rawData: string) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(rawData) as WsMessage;
    } catch {
      return; // ignore malformed frames
    }

    const s = registry.get(sessionId);
    if (!s?.pty) return;

    if (msg.type === 'data' && msg.payload !== undefined) {
      s.pty.write(msg.payload);
    } else if (msg.type === 'resize' && msg.cols && msg.rows) {
      s.pty.resize(msg.cols, msg.rows);
    } else if (msg.type === 'close') {
      s.pty.kill();
    }
  };

  const onClose = () => {
    registry.removeClient(sessionId, clientId);
  };

  return Promise.resolve().then(() => {
    // Return handlers for integration with WebSocket framework
    (ws as WebSocketLike & { _onMessage?: typeof onMessage; _onClose?: typeof onClose })._onMessage = onMessage;
    (ws as WebSocketLike & { _onClose?: typeof onClose })._onClose = onClose;
  });
}

// ============================================================
// Hono WebSocket Factory
// ============================================================

/**
 * Create a Hono-compatible WebSocket event object for the PTY route.
 *
 * Used with `upgradeWebSocket` from `@hono/node-server/ws`:
 *
 * ```ts
 * app.get('/ws/pty/:sessionId', upgradeWebSocket((c) => createPtyWsHandler(c)));
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPtyWsHandler(c: any): any {
  const sessionId: string = c.req.param('sessionId') ?? 'default';
  const q = c.req.query();
  const command: string = q.command ?? 'aiwg';
  const cmdArgs: string[] = q.args ? (q.args as string).split(',') : ['mc', 'watch'];
  const cwd: string | undefined = q.cwd;

  let wsRef: (WebSocketLike & { _onMessage?: (d: string) => void; _onClose?: () => void }) | null = null;

  return {
    onOpen(_evt: unknown, ws: WebSocketLike) {
      wsRef = ws as typeof wsRef;
      handlePtyConnection(sessionId, ws, command, cmdArgs, cwd).catch((err) => {
        ws.send(JSON.stringify({ type: 'error', message: String(err) }));
        ws.close(1011);
      });
    },
    onMessage(evt: { data: string }) {
      wsRef?._onMessage?.(evt.data);
    },
    onClose() {
      wsRef?._onClose?.();
      wsRef = null;
    },
    onError(err: unknown) {
      console.error(`[pty-bridge] WebSocket error on session ${sessionId}:`, err);
    },
  };
}
