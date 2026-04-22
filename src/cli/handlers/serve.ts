/**
 * Serve Command Handler
 *
 * Starts a local HTTP + WebSocket server and opens the browser dashboard.
 * Server stack: Hono serving static files, WebSocket PTY bridge, REST API.
 *
 * @issue #711
 * @see #712 — WebSocket PTY bridge
 * @see #714 — React app scaffold
 */

import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import type { CommandHandler, HandlerContext, HandlerResult } from './types.js';
import { createPtyWsHandler, registry as ptyRegistry } from '../../serve/pty-bridge.js';
import { telemetryStore, createEvent } from '../../serve/telemetry.js';
import {
  sandboxRegistry,
  type RegisterRequest,
  type SandboxEvent,
} from '../../serve/sandbox-registry.js';
import { routeTask, type AgentFilter } from '../../serve/agent-router.js';
import { AiwgError, EXIT_CODES } from '../errors.js';

const DEFAULT_PORT = 7337;
const DEFAULT_HOST = '127.0.0.1';

/**
 * Parse --port, --bind, --no-open, --read-only flags from args
 */
function parseServeArgs(args: string[]): {
  port: number;
  host: string;
  open: boolean;
  readOnly: boolean;
  sandbox: string | null;
} {
  let port = DEFAULT_PORT;
  let host = DEFAULT_HOST;
  let open = true;
  let readOnly = false;
  let sandbox: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (!isNaN(parsed)) port = parsed;
      i++;
    } else if (arg === '--bind' && args[i + 1]) {
      host = args[i + 1];
      i++;
    } else if (arg === '--sandbox' && args[i + 1]) {
      sandbox = args[i + 1];
      i++;
    } else if (arg === '--no-open') {
      open = false;
    } else if (arg === '--read-only') {
      readOnly = true;
    }
  }

  return { port, host, open, readOnly, sandbox };
}

// ============================================================
// WebSocket routing (#851)
//
// @hono/node-server v1.x does not export createNodeWebSocket.
// We wire WebSocket routes directly via the Node.js HTTP server's
// 'upgrade' event and the `ws` npm package instead.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleSandboxWs(ws: any, sandboxId: string, token: string): void {
  if (!sandboxRegistry.authenticate(sandboxId, token)) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  sandboxRegistry.setConnected(sandboxId, true);

  ws.on('message', (data: Buffer | string) => {
    if (!sandboxRegistry.authenticate(sandboxId, token)) return;
    try {
      const event: SandboxEvent = JSON.parse(data.toString());
      event.sandboxId = sandboxId;
      if (!event.timestamp) event.timestamp = new Date().toISOString();
      sandboxRegistry.handleEvent(event);
    } catch { /* ignore malformed events */ }
  });

  ws.on('close', () => {
    sandboxRegistry.setConnected(sandboxId, false);
  });

  ws.on('error', (err: unknown) => {
    console.error(`[sandbox-registry] WebSocket error for ${sandboxId}:`, err);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handlePtyWs(ws: any, sessionId: string, command: string, cmdArgs: string[], cwd?: string, wsEndpoint?: string, agentId?: string): void {
  // createPtyWsHandler expects a Hono-context-like object for param/query extraction.
  // We provide a minimal shim since we've already parsed the URL.
  const mockContext = {
    req: {
      param: (key: string) => key === 'sessionId' ? sessionId : undefined,
      query: () => ({
        command,
        args: cmdArgs.join(','),
        ...(cwd ? { cwd } : {}),
        ...(wsEndpoint ? { wsEndpoint } : {}),
        ...(agentId ? { agentId } : {}),
      }),
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = createPtyWsHandler(mockContext as any);
  handler.onOpen?.(null, ws);

  ws.on('message', (data: Buffer | string) => {
    handler.onMessage?.({ data: data.toString() });
  });
  ws.on('close', () => {
    handler.onClose?.();
  });
  ws.on('error', (err: unknown) => {
    handler.onError?.(err);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setupWebSockets(httpServer: any, readOnly: boolean): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let wsMod: any;
  try {
    wsMod = await (new Function('m', 'return import(m)'))('ws');
  } catch {
    console.warn('[serve] ws package not available — WebSocket routes disabled. Install with: npm install ws');
    return;
  }

  // ws ships as CJS; ESM import may wrap in .default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WebSocketServer: any =
    wsMod.WebSocketServer ??
    wsMod.default?.WebSocketServer ??
    wsMod.Server ??
    wsMod.default?.Server;

  if (!WebSocketServer) {
    console.warn('[serve] Could not resolve WebSocketServer from ws package — WebSocket routes disabled.');
    return;
  }

  const wss = new WebSocketServer({ noServer: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  httpServer.on('upgrade', (req: any, socket: any, head: any) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    // /ws/sandbox/:sandboxId
    const sandboxMatch = pathname.match(/^\/ws\/sandbox\/([^/]+)$/);
    if (sandboxMatch) {
      const sandboxId = sandboxMatch[1];
      const token = url.searchParams.get('token') ?? '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wss.handleUpgrade(req, socket, head, (ws: any) => {
        handleSandboxWs(ws, sandboxId, token);
      });
      return;
    }

    // /ws/pty/:sessionId (disabled in read-only mode)
    // Optional query params:
    //   ?sandbox=<sandboxId>  — target a specific registered sandbox
    //   ?agent=<agentId>      — target a specific agent within that sandbox
    //   ?wsEndpoint=<url>     — explicit management WS URL (overrides sandbox lookup)
    // Without these params the PTY bridge auto-detects the first connected sandbox.
    if (!readOnly) {
      const ptyMatch = pathname.match(/^\/ws\/pty\/([^/]+)$/);
      if (ptyMatch) {
        const sessionId = ptyMatch[1];
        const command = url.searchParams.get('command') ?? 'aiwg';
        const argsParam = url.searchParams.get('args');
        const cmdArgs = argsParam ? argsParam.split(',') : ['mc', 'watch'];
        const cwd = url.searchParams.get('cwd') ?? undefined;
        const agentId = url.searchParams.get('agent') ?? undefined;

        // Resolve wsEndpoint: explicit param takes precedence over sandbox registry lookup
        let wsEndpoint = url.searchParams.get('wsEndpoint') ?? undefined;
        if (!wsEndpoint) {
          const sandboxId = url.searchParams.get('sandbox') ?? undefined;
          if (sandboxId) {
            const sb = sandboxRegistry.get(sandboxId);
            if (sb?.wsEndpoint) wsEndpoint = sb.wsEndpoint;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wss.handleUpgrade(req, socket, head, (ws: any) => {
          handlePtyWs(ws, sessionId, command, cmdArgs, cwd, wsEndpoint, agentId);
        });
        return;
      }
    }

    // /ws/sandbox/:sandboxId/sessions/:sessionId/orchestrate
    // Proxies to the sandbox management server's orchestrate WS endpoint.
    // Browser speaks the orchestrate protocol (screen_update frames) directly;
    // this bridge is purely a cross-origin WS relay.
    const orchMatch = pathname.match(/^\/ws\/sandbox\/([^/]+)\/sessions\/([^/]+)\/orchestrate$/);
    if (orchMatch) {
      const sandboxId = orchMatch[1];
      const sessionId = orchMatch[2];
      const sandbox = sandboxRegistry.get(sandboxId);
      if (!sandbox?.connected) {
        socket.destroy();
        return;
      }
      // Convert httpEndpoint to ws:// URL for the sandbox orchestrate path
      const orchWsUrl = sandbox.httpEndpoint.replace(/^http/, 'ws') + `/ws/sessions/${sessionId}/orchestrate`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wss.handleUpgrade(req, socket, head, async (browserWs: any) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const WS: any = wsMod.WebSocket ?? wsMod.default?.WebSocket ?? wsMod.default;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sandboxWs = new WS(orchWsUrl) as any;

          sandboxWs.on('open', () => {
            // Relay sandbox → browser
            sandboxWs.on('message', (data: Buffer | string) => {
              if (browserWs.readyState === 1) {
                try { browserWs.send(typeof data === 'string' ? data : data.toString()); } catch { /* ignore */ }
              }
            });
            sandboxWs.on('close', () => { try { browserWs.close(1001, 'Sandbox closed'); } catch { /* ignore */ } });
            sandboxWs.on('error', () => { try { browserWs.close(1011, 'Sandbox WS error'); } catch { /* ignore */ } });

            // Relay browser → sandbox
            browserWs.on('message', (data: Buffer | string) => {
              if (sandboxWs.readyState === 1) {
                try { sandboxWs.send(typeof data === 'string' ? data : data.toString()); } catch { /* ignore */ }
              }
            });
            browserWs.on('close', () => { try { sandboxWs.close(); } catch { /* ignore */ } });
          });

          sandboxWs.on('error', () => {
            try { browserWs.close(1011, 'Could not connect to sandbox orchestrate WS'); } catch { /* ignore */ }
          });
        } catch {
          try { browserWs.close(1011, 'Orchestrate proxy error'); } catch { /* ignore */ }
        }
      });
      return;
    }

    // /ws/sandbox/:sandboxId/management
    // Proxies to the sandbox management WS bus (wsEndpoint).
    // The management WS is a multicast bus — all agents and sessions share one connection.
    // The browser sends attach_session / send_input / pty_resize frames and receives
    // output / session_attached / session_detached frames for all agents.
    const mgmtMatch = pathname.match(/^\/ws\/sandbox\/([^/]+)\/management$/);
    if (mgmtMatch) {
      const sandboxId = mgmtMatch[1];
      const sandbox = sandboxRegistry.get(sandboxId);
      if (!sandbox?.connected) {
        socket.destroy();
        return;
      }
      // wsEndpoint is already a full ws:// URL (e.g. ws://localhost:8121)
      const mgmtWsUrl = sandbox.wsEndpoint;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wss.handleUpgrade(req, socket, head, async (browserWs: any) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const WS: any = wsMod.WebSocket ?? wsMod.default?.WebSocket ?? wsMod.default;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sandboxWs = new WS(mgmtWsUrl) as any;

          sandboxWs.on('open', () => {
            // Relay sandbox → browser
            sandboxWs.on('message', (data: Buffer | string) => {
              if (browserWs.readyState === 1) {
                try { browserWs.send(typeof data === 'string' ? data : data.toString()); } catch { /* ignore */ }
              }
            });
            sandboxWs.on('close', () => { try { browserWs.close(1001, 'Sandbox closed'); } catch { /* ignore */ } });
            sandboxWs.on('error', () => { try { browserWs.close(1011, 'Sandbox WS error'); } catch { /* ignore */ } });

            // Relay browser → sandbox
            browserWs.on('message', (data: Buffer | string) => {
              if (sandboxWs.readyState === 1) {
                try { sandboxWs.send(typeof data === 'string' ? data : data.toString()); } catch { /* ignore */ }
              }
            });
            browserWs.on('close', () => { try { sandboxWs.close(); } catch { /* ignore */ } });
          });

          sandboxWs.on('error', () => {
            try { browserWs.close(1011, 'Could not connect to sandbox management WS'); } catch { /* ignore */ }
          });
        } catch {
          try { browserWs.close(1011, 'Management proxy error'); } catch { /* ignore */ }
        }
      });
      return;
    }

    // Unknown WS path — reject cleanly
    socket.destroy();
  });
}

/**
 * Start the Hono HTTP server
 *
 * Uses dynamic require-style imports to avoid compile-time resolution of
 * optional deps (hono, @hono/node-server) that are not yet in package.json.
 * TypeScript sees only `unknown`-typed module shapes here.
 */
async function startServer(opts: {
  port: number;
  host: string;
  readOnly: boolean;
  frameworkRoot: string;
}): Promise<{ url: string; close: () => void }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let honoMod: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nodeMod: any;
  try {
    // Use Function constructor to prevent static analysis of the import path
    honoMod = await (new Function('m', 'return import(m)'))('hono');
    nodeMod = await (new Function('m', 'return import(m)'))('@hono/node-server');
  } catch {
    // Auto-install optional serve dependencies on first use
    console.log('Installing serve dependencies (hono, @hono/node-server, ws)...');
    const result = spawnSync(
      'npm',
      ['install', '--save-optional', 'hono', '@hono/node-server', 'ws'],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) {
      throw new AiwgError({
        code: 'ERR_SERVE_DEPS_INSTALL_FAILED',
        message: 'Failed to install serve dependencies (hono, @hono/node-server, ws)',
        hint: 'Install manually: npm install hono @hono/node-server ws',
        exitCode: EXIT_CODES.GENERAL,
      });
    }
    // Retry imports after install
    try {
      honoMod = await (new Function('m', 'return import(m)'))('hono');
      nodeMod = await (new Function('m', 'return import(m)'))('@hono/node-server');
    } catch (err) {
      throw new AiwgError({
        code: 'ERR_SERVE_DEPS_LOAD_FAILED',
        message: 'Serve dependencies installed but could not be loaded',
        hint: 'Try: npm install hono @hono/node-server ws',
        exitCode: EXIT_CODES.GENERAL,
        cause: err,
      });
    }
  }

  const { Hono } = honoMod;
  const { serve } = nodeMod;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = new Hono() as any;

  // WebSocket routes are handled via Node.js upgrade event below (see setupWebSockets).
  // @hono/node-server v1.x does not export createNodeWebSocket.

  // Health check
  app.get('/api/health', (c: any) => c.json({ status: 'ok', readOnly: opts.readOnly }));

  // Connection status — server health, PTY sessions, sandboxes, subsystem status (#887)
  const serverStartTime = Date.now();
  app.get('/api/connections', (c: any) => {
    const uptime = Date.now() - serverStartTime;

    // PTY sessions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessions: string[] = [...(ptyRegistry as any)['sessions'].keys()];

    // Sandboxes
    const allSandboxes = sandboxRegistry.list().map((s) => ({
      id: s.id,
      name: s.name,
      connected: s.connected,
      agentCount: s.agentCount,
    }));

    // Ralph subsystem — read .aiwg/ralph/registry.json if present
    let ralphStatus: 'active' | 'idle' | 'unknown' = 'unknown';
    let activeLoops = 0;
    try {
      const ralphPath = path.join(process.cwd(), '.aiwg', 'ralph', 'registry.json');
      if (existsSync(ralphPath)) {
        const data = JSON.parse(readFileSync(ralphPath, 'utf-8')) as {
          active_loops?: Array<{ status: string }>;
        };
        activeLoops = (data.active_loops ?? []).filter((l) => l.status === 'running').length;
        ralphStatus = activeLoops > 0 ? 'active' : 'idle';
      }
    } catch { /* ignore */ }

    // Missions subsystem — check for mc session directory
    let missionsStatus = 'unknown';
    let missionsCount = 0;
    try {
      const mcPath = path.join(process.cwd(), '.aiwg', 'mc');
      if (existsSync(mcPath)) {
        missionsStatus = 'idle';
        const registryPath = path.join(mcPath, 'registry.json');
        if (existsSync(registryPath)) {
          const data = JSON.parse(readFileSync(registryPath, 'utf-8')) as {
            sessions?: Array<{ status: string }>;
          };
          const activeSessions = (data.sessions ?? []).filter((s) => s.status === 'running');
          missionsCount = activeSessions.length;
          if (missionsCount > 0) missionsStatus = 'active';
        }
      }
    } catch { /* ignore */ }

    // Daemon subsystem — check for daemon PID file
    let daemonStatus = 'unknown';
    try {
      const daemonPid = path.join(process.cwd(), '.aiwg', 'daemon', 'daemon.pid');
      daemonStatus = existsSync(daemonPid) ? 'running' : 'stopped';
    } catch { /* ignore */ }

    // RLM subsystem — check for rlm state
    let rlmStatus = 'unknown';
    try {
      const rlmPath = path.join(process.cwd(), '.aiwg', 'rlm');
      rlmStatus = existsSync(rlmPath) ? 'idle' : 'stopped';
    } catch { /* ignore */ }

    // Semantic memory — check for memory index
    let memoryStatus = 'unknown';
    try {
      const memPath = path.join(process.cwd(), '.aiwg', 'memory');
      memoryStatus = existsSync(memPath) ? 'active' : 'stopped';
    } catch { /* ignore */ }

    return c.json({
      server: { status: 'ok', readOnly: opts.readOnly, uptime },
      ptySessions: sessions,
      sandboxes: allSandboxes,
      mcpServers: [] as Array<{ name: string; status: string }>,
      subsystems: {
        ralph: { status: ralphStatus, activeLoops },
        missions: { status: missionsStatus, count: missionsCount },
        daemon: { status: daemonStatus },
        rlm: { status: rlmStatus },
        memory: { status: memoryStatus },
      },
    });
  });

  // REST stubs — filled in by #715 / #716
  app.get('/api/sessions', (c: any) => {
    const sessions = [...ptyRegistry['sessions'].keys()];
    return c.json({ sessions });
  });
  // Mission Control API stubs (#715)
  app.get('/api/missions', (c: any) => c.json({ missions: [], sessions: [] }));
  app.get('/api/sessions/:id/missions', (c: any) => c.json({ missions: [] }));
  app.post('/api/sessions/:id/dispatch', async (c: any) => {
    const { task = '', completion = '' } = await c.req.json().catch(() => ({}));
    const sessionId: string = c.req.param('id');
    const missionId = `mission-${Date.now()}`;
    telemetryStore.ingest(createEvent('mission.dispatch', sessionId, { task, completion }, missionId));
    return c.json({ id: missionId, task, completion, status: 'queued' }, 202);
  });
  app.put('/api/missions/:id/pause', (c: any) => c.json({ ok: true }));
  app.put('/api/missions/:id/resume', (c: any) => c.json({ ok: true }));
  app.delete('/api/missions/:id', (c: any) => c.json({ ok: true }));

  // Telemetry API (#716)
  app.get('/api/telemetry', (c: any) => {
    const sid = c.req.query('sessionId');
    const limit = parseInt(c.req.query('limit') ?? '100', 10);
    const events = telemetryStore.query(sid || 'default', { limit });
    return c.json({ events });
  });
  app.get('/api/telemetry/metrics', (c: any) => {
    const sid = c.req.query('sessionId') || 'default';
    return c.json(telemetryStore.metrics(sid));
  });
  app.post('/api/telemetry', async (c: any) => {
    try {
      const body = await c.req.json();
      telemetryStore.ingest(body);
      return c.json({ ok: true }, 201);
    } catch {
      return c.json({ error: 'Invalid event' }, 400);
    }
  });

  if (!opts.readOnly) {
    app.post('/api/sessions', (c: any) => c.json({ id: null, error: 'Use /ws/pty/:sessionId to start a PTY session' }, 501));
  }

  // ---- Sandbox Registration API (#731) ----

  // Register a sandbox instance
  app.post('/api/sandboxes/register', async (c: any) => {
    try {
      const body: RegisterRequest = await c.req.json();
      if (!body.name || !body.grpc_endpoint || !body.ws_endpoint || !body.http_endpoint) {
        return c.json({ error: 'Missing required fields: name, grpc_endpoint, ws_endpoint, http_endpoint' }, 400);
      }
      const result = sandboxRegistry.register(body);
      return c.json(result, 201);
    } catch {
      return c.json({ error: 'Invalid request body' }, 400);
    }
  });

  // Clear all disconnected sandboxes (forces re-registration)
  app.delete('/api/sandboxes/offline', (c: any) => {
    const removed = sandboxRegistry.clearOffline();
    return c.json({ ok: true, removed });
  });

  // Admin-force deregister any sandbox by id (no sandbox token required — local dashboard only).
  // Idempotent: returns ok even if the sandbox is already gone (e.g. server restarted since last poll).
  app.delete('/api/sandboxes/:id/forget', (c: any) => {
    sandboxRegistry.deregister(c.req.param('id'));
    return c.json({ ok: true });
  });

  // Deregister a sandbox
  app.delete('/api/sandboxes/:id', (c: any) => {
    const id: string = c.req.param('id');
    const token = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!sandboxRegistry.authenticate(id, token)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    sandboxRegistry.deregister(id);
    return c.json({ ok: true });
  });

  // List all registered sandboxes
  app.get('/api/sandboxes', (c: any) => {
    return c.json({ sandboxes: sandboxRegistry.list() });
  });

  // Get a single sandbox
  app.get('/api/sandboxes/:id', (c: any) => {
    const summary = sandboxRegistry.getSummary(c.req.param('id'));
    if (!summary) return c.json({ error: 'Sandbox not found' }, 404);
    return c.json(summary);
  });

  // List agents for a specific sandbox
  app.get('/api/sandboxes/:id/agents', (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    return c.json({ agents: [...sandbox.agents.values()] });
  });

  // List all agents across all sandboxes
  app.get('/api/agents', (c: any) => {
    return c.json({ agents: sandboxRegistry.allAgents() });
  });

  // Routing candidates — returns all agents ranked by filter match + load score (#916)
  // Query params map directly to AgentFilter fields (JSON-encoded or comma-separated).
  app.get('/api/agents/candidates', (c: any) => {
    const q = c.req.query();
    const filter: AgentFilter = {};
    if (q.sandbox_id) filter.sandbox_id = q.sandbox_id;
    if (q.agent_id) filter.agent_id = q.agent_id;
    if (q.agent_name) filter.agent_name = q.agent_name;
    if (q.frameworks) filter.frameworks = q.frameworks.split(',').filter(Boolean);
    if (q.agents) filter.agents = q.agents.split(',').filter(Boolean);
    if (q.skills) filter.skills = q.skills.split(',').filter(Boolean);
    if (q.max_cpu_percent) filter.max_cpu_percent = parseFloat(q.max_cpu_percent);
    if (q.min_memory_gb) filter.min_memory_gb = parseFloat(q.min_memory_gb);

    const allAgents = sandboxRegistry.allAgents();
    const result = routeTask(allAgents, filter);
    return c.json(result);
  });

  // Proxy endpoints for sandbox lifecycle (#733)
  // These forward to the registered sandbox's HTTP endpoint
  app.get('/api/sandboxes/:id/loadouts', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const resp = await fetch(`${sandbox.httpEndpoint}/api/v1/loadouts`);
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  app.post('/api/sandboxes/:id/provision', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const body = await c.req.json() as {
        name: string;
        loadout: string;
        overrides?: {
          add_packages?: string[];
          aiwg_frameworks?: string[];
          memory_mb?: number;
          vcpus?: number;
        };
      };
      // Map ProvisionRequest → CreateVmRequest (sandbox /api/v1/vms schema).
      // The sandbox uses `loadout` field directly; resource overrides are top-level.
      // `add_packages` has no direct equivalent in CreateVmRequest — dropped for now.
      // `aiwg_frameworks` override maps to composition.aiwg.frameworks when set.
      const vmBody: Record<string, unknown> = {
        name: body.name,
        loadout: body.loadout,
      };
      if (body.overrides?.vcpus !== undefined) vmBody['vcpus'] = body.overrides.vcpus;
      if (body.overrides?.memory_mb !== undefined) vmBody['memory_mb'] = body.overrides.memory_mb;
      if (body.overrides?.aiwg_frameworks?.length) {
        vmBody['composition'] = { aiwg: { frameworks: body.overrides.aiwg_frameworks } };
      }
      const resp = await fetch(`${sandbox.httpEndpoint}/api/v1/vms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vmBody),
      });
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  // Proxy agent lifecycle actions to sandbox
  for (const action of ['start', 'stop', 'destroy', 'reprovision'] as const) {
    app.post(`/api/sandboxes/:id/agents/:aid/${action}`, async (c: any) => {
      const sandbox = sandboxRegistry.get(c.req.param('id'));
      if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
      try {
        const resp = await fetch(`${sandbox.httpEndpoint}/api/v1/agents/${c.req.param('aid')}/${action}`, {
          method: 'POST',
        });
        return c.json(await resp.json(), resp.status);
      } catch (err) {
        return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
      }
    });
  }

  app.delete('/api/sandboxes/:id/agents/:aid', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const resp = await fetch(`${sandbox.httpEndpoint}/api/v1/agents/${c.req.param('aid')}`, {
        method: 'DELETE',
      });
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  // Agent identity alias endpoint (#917)
  // Assigns a stable human-readable logical name to an agent.
  // Persists in ~/.config/aiwg/sandbox-agents.json so name survives AIWG restarts.
  app.post('/api/sandboxes/:id/agents/:aid/alias', async (c: any) => {
    const sandboxId = c.req.param('id');
    const agentId = c.req.param('aid');
    const body = await c.req.json().catch(() => ({}));
    const { name } = body as { name?: string };
    if (!name || typeof name !== 'string' || !name.trim()) {
      return c.json({ error: 'name is required' }, 400);
    }
    const ok = sandboxRegistry.aliasAgent(sandboxId, agentId, name.trim());
    if (!ok) return c.json({ error: 'Agent or sandbox not found' }, 404);
    return c.json({ ok: true, logicalName: name.trim() });
  });

  // Resolve agent by agentId, instanceId, or logicalName (#917)
  app.get('/api/agents/resolve/:ref', (c: any) => {
    const ref = c.req.param('ref');
    const result = sandboxRegistry.resolveAgent(ref);
    if (!result) return c.json({ error: `Agent '${ref}' not found` }, 404);
    return c.json({
      sandboxId: result.sandbox.id,
      sandboxName: result.sandbox.name,
      agent: result.agent,
    });
  });

  // List known agent identities from persistent store (#917)
  app.get('/api/agents/identities', (c: any) => {
    return c.json({ identities: sandboxRegistry.knownAgentIdentities() });
  });

  // Session management proxy endpoints (#896)
  // Forwards to sandbox management HTTP API: GET/POST /api/v1/agents/:aid/sessions
  // and DELETE /api/v1/sessions/:sid
  // Will 502 gracefully until agentic-sandbox#140 lands these endpoints.

  app.get('/api/sandboxes/:id/agents/:aid/sessions', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const resp = await fetch(`${sandbox.httpEndpoint}/api/v1/agents/${c.req.param('aid')}/sessions`);
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  app.post('/api/sandboxes/:id/agents/:aid/sessions', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const body = await c.req.json().catch(() => ({}));
      const resp = await fetch(`${sandbox.httpEndpoint}/api/v1/agents/${c.req.param('aid')}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  // DELETE /api/sandboxes/:id/agents/:aid/sessions/:session
  // Path key `:session` is the session_name (not session_id) — sandbox returns 204 No Content.
  app.delete('/api/sandboxes/:id/agents/:aid/sessions/:session', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const resp = await fetch(
        `${sandbox.httpEndpoint}/api/v1/agents/${c.req.param('aid')}/sessions/${c.req.param('session')}`,
        { method: 'DELETE' },
      );
      if (resp.status === 204) return new Response(null, { status: 204 });
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  // HITL endpoints (#732)
  app.get('/api/hitl', (c: any) => {
    return c.json({ requests: sandboxRegistry.pendingHitl() });
  });

  app.post('/api/hitl/:id/respond', async (c: any) => {
    const hitlId: string = c.req.param('id');
    // Use getHitl (not resolveHitl) — don't remove from queue until sandbox confirms (#908)
    const hitl = sandboxRegistry.getHitl(hitlId);
    if (!hitl) return c.json({ error: 'HITL request not found or already resolved' }, 404);
    const sandbox = sandboxRegistry.get(hitl.sandboxId);
    if (!sandbox) return c.json({ error: 'Sandbox no longer registered' }, 410);
    try {
      const { text } = await c.req.json();
      const resp = await fetch(`${sandbox.httpEndpoint}/api/v1/hitl/${hitlId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (resp.ok || resp.status === 204) {
        // Remove from queue only after sandbox confirms receipt (#908)
        sandboxRegistry.resolveHitl(hitlId);
        // Notify browser subscribers that the HITL was responded to (#908)
        sandboxRegistry.emit({
          type: 'hitl.responded',
          sandboxId: hitl.sandboxId,
          agentId: hitl.agentId,
          timestamp: new Date().toISOString(),
          hitlId,
          sessionId: hitl.sessionId,
        });
      }
      // Return 200 regardless of sandbox's 204 (body-less responses cause issues on some clients)
      return c.json({ ok: resp.ok }, resp.ok ? 200 : resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  app.post('/api/hitl/:id/dismiss', (c: any) => {
    const hitl = sandboxRegistry.resolveHitl(c.req.param('id'));
    if (!hitl) return c.json({ error: 'HITL request not found or already resolved' }, 404);
    return c.json({ ok: true });
  });

  // Task proxy endpoints (#907)
  // Forward to sandbox /api/v1/tasks — enables the serve dashboard task submission UI

  app.get('/api/sandboxes/:id/tasks', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const url = new URL(`${sandbox.httpEndpoint}/api/v1/tasks`);
      const qs = c.req.query() as Record<string, string>;
      for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
      const resp = await fetch(url.toString());
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  app.post('/api/sandboxes/:id/tasks', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const body = await c.req.json().catch(() => ({}));
      const resp = await fetch(`${sandbox.httpEndpoint}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  app.get('/api/sandboxes/:id/tasks/:taskId', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const resp = await fetch(`${sandbox.httpEndpoint}/api/v1/tasks/${c.req.param('taskId')}`);
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  app.delete('/api/sandboxes/:id/tasks/:taskId', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const resp = await fetch(`${sandbox.httpEndpoint}/api/v1/tasks/${c.req.param('taskId')}`, {
        method: 'DELETE',
      });
      if (resp.status === 204) return new Response(null, { status: 204 });
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  // Screen state proxy (#913)
  // Forwards to sandbox GET /api/v1/sessions/:sessionId/screen — already exists in sandbox.
  app.get('/api/sandboxes/:id/sessions/:sessionId/screen', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const resp = await fetch(
        `${sandbox.httpEndpoint}/api/v1/sessions/${c.req.param('sessionId')}/screen`,
      );
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  // Remote AIWG exec proxy (#914)
  // Forwards to sandbox POST /api/v1/aiwg/exec — requires sandbox companion issue.
  // Will 502 gracefully until that endpoint is implemented.
  app.post('/api/sandboxes/:id/agents/:aid/aiwg/exec', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const body = await c.req.json().catch(() => ({}));
      const resp = await fetch(
        `${sandbox.httpEndpoint}/api/v1/agents/${c.req.param('aid')}/aiwg/exec`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  // Framework update proxy (#910)
  // Instructs a sandbox agent to update a named framework.
  // Requires sandbox companion issue (PATCH /api/v1/agents/:id/frameworks/:name).
  app.patch('/api/sandboxes/:id/agents/:aid/frameworks/:name', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const body = await c.req.json().catch(() => ({}));
      const resp = await fetch(
        `${sandbox.httpEndpoint}/api/v1/agents/${c.req.param('aid')}/frameworks/${c.req.param('name')}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (resp.status === 204) return new Response(null, { status: 204 });
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  // Agent manifest discovery and push (#909)
  // GET  — list deployed manifests for a platform (with content hashes for drift detection)
  // POST — push/replace a single agent manifest
  // Requires sandbox companion issue (GET/POST /api/v1/agents/:id/manifests/:platform).
  app.get('/api/sandboxes/:id/agents/:aid/manifests/:platform', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const resp = await fetch(
        `${sandbox.httpEndpoint}/api/v1/agents/${c.req.param('aid')}/manifests/${c.req.param('platform')}`,
      );
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  app.post('/api/sandboxes/:id/agents/:aid/manifests/:platform', async (c: any) => {
    const sandbox = sandboxRegistry.get(c.req.param('id'));
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404);
    try {
      const body = await c.req.json().catch(() => ({}));
      const resp = await fetch(
        `${sandbox.httpEndpoint}/api/v1/agents/${c.req.param('aid')}/manifests/${c.req.param('platform')}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      return c.json(await resp.json(), resp.status);
    } catch (err) {
      return c.json({ error: `Sandbox unreachable: ${err instanceof Error ? err.message : String(err)}` }, 502);
    }
  });

  // Static file serving — apps/web/dist/ (#714)
  // Only register serveStatic when the dist directory actually exists.
  // When it doesn't, fall back to a helpful HTML placeholder so the
  // browser gets a 503 with context rather than a bare "Not found".
  const webDistDir = path.join(opts.frameworkRoot, 'apps', 'web', 'dist');
  if (existsSync(webDistDir)) {
    try {
      const { serveStatic } = await (new Function('m', 'return import(m)'))('@hono/node-server/serve-static');
      app.use('/*', serveStatic({ root: webDistDir }));
    } catch {
      // serve-static import failed — fall through to placeholder below
    }
  }

  if (!existsSync(webDistDir)) {
    app.get('/*', (c: any) =>
      c.html(
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>AIWG Dashboard</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:80px auto;padding:0 20px;color:#333}
code{background:#f4f4f4;padding:2px 6px;border-radius:3px}
a{color:#0070f3}</style></head><body>
<h1>AIWG Dashboard</h1>
<p>The dashboard UI has not been built yet.</p>
<p>The <strong>API is fully operational</strong> — try
<a href="/api/health">/api/health</a> or
<a href="/api/sandboxes">/api/sandboxes</a>.</p>
<hr>
<p>To build the UI, run:<br><code>pnpm --filter @aiwg/web build</code></p>
</body></html>`,
        503,
      ),
    );
  }

  // Fallback: 404 for API routes not matched above
  app.notFound((c: any) => {
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/ws/')) {
      return c.json({ error: 'Not found' }, 404);
    }
    // SPA fallback — serve index.html for client-side routing
    return c.text('Not found', 404);
  });

  const url = `http://${opts.host}:${opts.port}`;

  const server = serve({ fetch: app.fetch, port: opts.port, hostname: opts.host });

  // Wire up WebSocket routes via Node.js upgrade event (#851)
  await setupWebSockets(server, opts.readOnly);

  return {
    url,
    close: () => {
      ptyRegistry.shutdown();
      sandboxRegistry.shutdown();
      if (typeof (server as { close?: () => void }).close === 'function') {
        (server as { close: () => void }).close();
      }
    },
  };
}

/**
 * Serve command handler
 */
export const serveHandler: CommandHandler = {
  id: 'serve',
  name: 'Serve',
  description: 'Start local HTTP dashboard server',
  category: 'project',
  aliases: [],

  async execute(ctx: HandlerContext): Promise<HandlerResult> {
    const { port, host, open, readOnly } = parseServeArgs(ctx.args);

    let server: { url: string; close: () => void } | undefined;

    try {
      server = await startServer({ port, host, readOnly, frameworkRoot: ctx.frameworkRoot });
    } catch (error) {
      const { handlerResultFromError } = await import('../errors.js');
      return handlerResultFromError(error);
    }

    const { url } = server;

    console.log(`Dashboard: ${url}`);
    if (readOnly) console.log('  (read-only mode)');
    console.log('Press Ctrl+C to stop.');

    // Auto-open browser
    if (open) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const openMod: any = await (new Function('m', 'return import(m)'))('open');
        const openBrowser = openMod.default ?? openMod;
        await openBrowser(url);
      } catch {
        // open is optional — not a fatal error
      }
    }

    // Keep process alive; shut down cleanly on SIGINT/SIGTERM.
    //
    // Registered listeners are removed on the resolve path so that the only
    // handler we install does not outlive this command (important for tests
    // or future in-process CLI flows). A 5-second hard deadline after signal
    // receipt forces process.exit() in case server.close() hangs draining
    // websocket connections.
    await new Promise<void>((resolve) => {
      let settled = false;
      const shutdown = () => {
        if (settled) return;
        settled = true;
        // Immediately remove both handlers so a second signal doesn't
        // re-enter shutdown().
        process.removeListener('SIGINT', shutdown);
        process.removeListener('SIGTERM', shutdown);
        try {
          server!.close();
        } catch {
          // Server may already be closing; safe to ignore.
        }
        // Hard deadline: if server.close() doesn't drain in 5s, force exit.
        const forceExit = setTimeout(() => {
          process.exit(143); // SIGTERM convention
        }, 5_000);
        forceExit.unref?.();
        resolve();
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });

    return { exitCode: 0 };
  },
};
