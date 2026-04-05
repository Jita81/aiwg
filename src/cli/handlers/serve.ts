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
import type { CommandHandler, HandlerContext, HandlerResult } from './types.js';
import { createPtyWsHandler, registry as ptyRegistry } from '../../serve/pty-bridge.js';
import { telemetryStore, createEvent } from '../../serve/telemetry.js';

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
} {
  let port = DEFAULT_PORT;
  let host = DEFAULT_HOST;
  let open = true;
  let readOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (!isNaN(parsed)) port = parsed;
      i++;
    } else if (arg === '--bind' && args[i + 1]) {
      host = args[i + 1];
      i++;
    } else if (arg === '--no-open') {
      open = false;
    } else if (arg === '--read-only') {
      readOnly = true;
    }
  }

  return { port, host, open, readOnly };
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
    throw new Error(
      'Hono is required for `aiwg serve`. Install it:\n  npm install hono @hono/node-server',
    );
  }

  const { Hono } = honoMod;
  const { serve, createNodeWebSocket } = nodeMod;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = new Hono() as any;

  // WebSocket PTY bridge (#712) — must be set up before serve() is called
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let injectWebSocket: ((server: any) => void) | null = null;
  if (!opts.readOnly) {
    try {
      const { upgradeWebSocket, injectWebSocket: inject } = createNodeWebSocket({ app });
      injectWebSocket = inject;
      app.get('/ws/pty/:sessionId', upgradeWebSocket(createPtyWsHandler));
    } catch {
      // @hono/node-server/ws not available — WebSocket routes skipped
    }
  }

  // Health check
  app.get('/api/health', (c: any) => c.json({ status: 'ok', readOnly: opts.readOnly }));

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

  // Static file serving — apps/web/dist/ (#714)
  // Served with @hono/node-server/serve-static if the dist exists
  const webDistDir = path.join(opts.frameworkRoot, 'apps', 'web', 'dist');
  try {
    const { serveStatic } = await (new Function('m', 'return import(m)'))('@hono/node-server/serve-static');
    app.use('/*', serveStatic({ root: webDistDir }));
  } catch {
    // serve-static not available yet (before #714 dist is built) — fallback below
    app.get('/', (c: any) =>
      c.text('AIWG Dashboard — run `pnpm build` inside apps/web/ to build the UI.', 503),
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

  // Inject WebSocket upgrade support into the underlying HTTP server
  if (injectWebSocket) {
    injectWebSocket(server);
  }

  return {
    url,
    close: () => {
      ptyRegistry.shutdown();
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
      const err = error as Error;
      return { exitCode: 1, message: err.message, error: err };
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

    // Keep process alive; shut down cleanly on SIGINT/SIGTERM
    await new Promise<void>((resolve) => {
      const shutdown = () => {
        server!.close();
        resolve();
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });

    return { exitCode: 0 };
  },
};
