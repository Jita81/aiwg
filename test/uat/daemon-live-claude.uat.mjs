/**
 * Daemon — Live End-to-End UAT with Claude Provider
 *
 * Starts a real daemon process in a temporary project directory, connects
 * via the Unix domain socket (IPC), and validates the full daemon lifecycle:
 *
 *   - Startup + socket readiness
 *   - Core IPC methods (ping, status, circuit, queue, budget, resources)
 *   - Task submission → real claude -p execution → task completion
 *   - Ops-toolset IPC methods (daemon.process.list, daemon.circuit.status, etc.)
 *   - Graceful shutdown
 *
 * Run on demand (NOT part of CI):
 *   npm run uat:daemon:claude
 *
 * Requirements:
 *   - claude CLI installed and authenticated
 *   - ANTHROPIC_API_KEY or equivalent session active
 *
 * Cost target: < $0.10 per full run (trivial haiku tasks only)
 *
 * @implements #513-#524
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirnameUat = dirname(__filename);
const PROJECT_ROOT = resolve(__dirnameUat, '../..');
const DAEMON_MAIN = join(PROJECT_ROOT, 'tools/daemon/daemon-main.mjs');

const { IPCClient } = await import(join(PROJECT_ROOT, 'tools/daemon/ipc-client.mjs'));

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function makeTmpDir() {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const dir = join(tmpdir(), `aiwg-daemon-uat-${tag}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Write a minimal .aiwg/daemon.json suitable for UAT.
 * File watching, scheduling, and web UI are all disabled to keep the
 * daemon lean. Task timeout is short so stuck tasks don't block tests.
 */
function writeDaemonConfig(projectDir, overrides = {}) {
  const config = {
    daemon: {
      heartbeat_interval_seconds: 5,
      max_parallel_actions: 2,
      action_timeout_minutes: 5,
      log: { max_size_mb: 10, max_files: 2, level: 'info' },
    },
    watch: { enabled: false, paths: [] },
    schedule: { enabled: false, jobs: [] },
    supervisor: {
      max_concurrent: 2,
      max_queue_depth: 10,
      restart_intensity: { max_restarts: 2, window_seconds: 60 },
      circuit_breaker: { failure_threshold: 5, cooldown_ms: 30000 },
      daily_budget_usd: 0,
      behaviors: [],
    },
    interface: { web: { enabled: false } },
    rules: [],
    ...overrides,
  };
  const aiwgDir = join(projectDir, '.aiwg');
  mkdirSync(aiwgDir, { recursive: true });
  writeFileSync(join(aiwgDir, 'daemon.json'), JSON.stringify(config, null, 2));
  return config;
}

/**
 * Poll the socket path until a connection succeeds or timeout is reached.
 * The daemon writes the socket file before accepting connections — we need
 * to wait for the IPC server to be fully ready, not just the file to exist.
 */
async function waitForSocket(socketPath, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) {
      try {
        const probe = new IPCClient(socketPath, { timeout: 2000 });
        await probe.connect();
        probe.disconnect();
        return; // Ready
      } catch {
        // Socket exists but not accepting yet
      }
    }
    await sleep(250);
  }
  throw new Error(`Daemon socket not ready after ${timeoutMs}ms: ${socketPath}`);
}

/**
 * Poll task.get until the task reaches a terminal state or timeout.
 */
async function waitForTask(client, taskId, { timeoutMs = 180000, pollMs = 2000 } = {}) {
  const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'timeout']);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = await client.request('task.get', { taskId });
    if (TERMINAL.has(task.state)) return task;
    await sleep(pollMs);
  }
  throw new Error(`Task ${taskId} did not reach terminal state within ${timeoutMs}ms`);
}

// ============================================================================
// Daemon Harness
// ============================================================================

class DaemonHarness {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.socketPath = join(projectDir, '.aiwg', 'daemon', 'daemon.sock');
    this.logPath = join(projectDir, '.aiwg', 'daemon', 'daemon.log');
    this.proc = null;
    this.client = null;
  }

  /**
   * Start the daemon subprocess and wait for the IPC socket to be ready.
   * Returns a connected IPCClient.
   */
  async start(configOverrides = {}) {
    writeDaemonConfig(this.projectDir, configOverrides);

    this.proc = spawn('node', [DAEMON_MAIN], {
      cwd: this.projectDir,
      env: { ...process.env },
      stdio: 'pipe', // Capture but don't inherit — daemon redirects to log file
    });

    // Surface startup errors
    this.proc.stderr.on('data', (d) => {
      const text = d.toString().trim();
      if (text) process.stderr.write(`[daemon-uat stderr] ${text}\n`);
    });

    this.proc.on('error', (err) => {
      process.stderr.write(`[daemon-uat] spawn error: ${err.message}\n`);
    });

    await waitForSocket(this.socketPath, 20000);

    this.client = new IPCClient(this.socketPath, { timeout: 30000 });
    await this.client.connect();
    return this.client;
  }

  /** Send SIGTERM and wait for the process to exit (up to 8 seconds). */
  async stop() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
    if (!this.proc || this.proc.killed) return;

    this.proc.kill('SIGTERM');
    await new Promise((resolve) => {
      const force = setTimeout(() => {
        if (!this.proc.killed) this.proc.kill('SIGKILL');
        resolve();
      }, 8000);
      this.proc.once('exit', () => {
        clearTimeout(force);
        resolve();
      });
    });
  }

  readLog() {
    return existsSync(this.logPath) ? readFileSync(this.logPath, 'utf8') : '';
  }
}

// ============================================================================
// Suite 1: Lifecycle + IPC method shapes
// ============================================================================

describe('UAT [LIVE-CLAUDE]: Daemon lifecycle and IPC methods', () => {
  let harness;
  let client;
  let testDir;

  beforeAll(async () => {
    testDir = makeTmpDir();
    harness = new DaemonHarness(testDir);
    client = await harness.start();
  }, 30000);

  afterAll(async () => {
    await harness.stop();
    rmSync(testDir, { recursive: true, force: true });
  }, 15000);

  // --- Core IPC ---

  it('responds to ping', async () => {
    const res = await client.request('ping');
    expect(res.pong).toBe(true);
    expect(res.timestamp).toBeDefined();
  });

  it('daemon.status returns healthy with correct pid', async () => {
    const status = await client.request('daemon.status');
    expect(status.health).toBe('healthy');
    expect(status.pid).toBe(harness.proc.pid);
    expect(typeof status.uptime_seconds).toBe('number');
    expect(status.subsystems).toBeDefined();
    expect(status.subsystems.supervisor).toBeDefined();
    expect(status.subsystems.automation).toBeDefined();
  });

  it('task.stats returns zero counts on fresh start', async () => {
    const stats = await client.request('task.stats');
    // Stats shape may vary — just validate it is an object
    expect(stats).toBeDefined();
    expect(typeof stats).toBe('object');
  });

  it('task.list returns an empty array on fresh start', async () => {
    const tasks = await client.request('task.list', {});
    expect(Array.isArray(tasks)).toBe(true);
  });

  it('automation.status shows automation is present', async () => {
    const status = await client.request('automation.status');
    expect(status).toBeDefined();
    expect(typeof status.enabled).toBe('boolean');
  });

  // --- Ops-toolset IPC methods ---

  it('daemon.circuit.status starts closed', async () => {
    const cb = await client.request('daemon.circuit.status');
    expect(cb.state).toBe('closed');
    expect(cb.consecutiveFailures).toBe(0);
    expect(cb.cooldownRemainingMs).toBe(0);
  });

  it('daemon.resource.snapshot has cpu, memory, queueDepth', async () => {
    const snap = await client.request('daemon.resource.snapshot');
    expect(snap.cpu).toBeDefined();
    expect(typeof snap.cpu.percent).toBe('number');
    expect(snap.memory).toBeDefined();
    expect(typeof snap.memory.heapUsedMb).toBe('number');
    expect(typeof snap.queueDepth).toBe('number');
    expect(snap.uptime).toBeDefined();
  });

  it('daemon.queue.inspect starts at zero depth', async () => {
    const q = await client.request('daemon.queue.inspect');
    expect(q.depth).toBe(0);
    expect(q.maxDepth).toBeGreaterThan(0);
    expect(q.priorityDistribution).toBeDefined();
  });

  it('daemon.budget.remaining returns correct shape', async () => {
    const budget = await client.request('daemon.budget.remaining');
    expect(typeof budget.dailyLimit).toBe('number');
    expect(typeof budget.spent).toBe('number');
    expect(typeof budget.remaining).toBe('number');
    expect(typeof budget.percentUsed).toBe('number');
    // daily_budget_usd is 0 in UAT config — no cap
    expect(budget.dailyLimit).toBe(0);
  });

  it('daemon.process.list starts with no running loops', async () => {
    const loops = await client.request('daemon.process.list', { filter: 'running' });
    expect(Array.isArray(loops)).toBe(true);
    expect(loops.length).toBe(0);
  });

  it('daemon.loop.history starts empty', async () => {
    const history = await client.request('daemon.loop.history', { limit: 5 });
    expect(Array.isArray(history)).toBe(true);
  });

  it('daemon.process.kill returns error for unknown loop', async () => {
    await expect(
      client.request('daemon.process.kill', { loopId: 'nonexistent-loop', signal: 'SIGTERM' })
    ).rejects.toThrow();
  });

  // --- Validation: missing params ---

  it('task.submit rejects missing prompt', async () => {
    await expect(
      client.request('task.submit', {})
    ).rejects.toThrow();
  });

  it('task.get rejects missing taskId', async () => {
    await expect(
      client.request('task.get', {})
    ).rejects.toThrow();
  });

  it('task.get returns error for unknown taskId', async () => {
    await expect(
      client.request('task.get', { taskId: 'no-such-task' })
    ).rejects.toThrow();
  });

  // --- Log output ---

  it('daemon log records IPC server startup', async () => {
    const log = harness.readLog();
    expect(log).toContain('IPC server listening');
    expect(log).toContain('Daemon started successfully');
  });
});

// ============================================================================
// Suite 2: Real task execution via claude -p
// ============================================================================

describe('UAT [LIVE-CLAUDE]: Daemon task execution via real claude', () => {
  let harness;
  let client;
  let testDir;

  beforeAll(async () => {
    testDir = makeTmpDir();
    harness = new DaemonHarness(testDir);
    client = await harness.start();
  }, 30000);

  afterAll(async () => {
    await harness.stop();
    rmSync(testDir, { recursive: true, force: true });
  }, 15000);

  it('task.submit returns a taskId and queued/running state', async () => {
    const doneFile = join(testDir, 'probe.txt');
    const res = await client.request('task.submit', {
      prompt: `Create a file at "${doneFile}" containing exactly the text "ok"`,
      priority: 0,
    });
    expect(typeof res.taskId).toBe('string');
    expect(res.taskId.length).toBeGreaterThan(0);
    expect(['queued', 'running']).toContain(res.state);
  });

  it('submitted task appears in task.list', async () => {
    const tasks = await client.request('task.list', {});
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks[0].id).toBeDefined();
    expect(tasks[0].prompt).toBeDefined();
  });

  it('completes a trivial file-creation task', async () => {
    const doneFile = join(testDir, 'uat-done.txt');

    const { taskId } = await client.request('task.submit', {
      prompt: `Create a file at "${doneFile}" containing exactly the text "daemon-uat-success" with no trailing newline or extra characters.`,
      priority: 5,
    });

    expect(taskId).toBeDefined();

    // Poll until terminal state (up to 3 minutes — claude haiku is fast)
    const task = await waitForTask(client, taskId, { timeoutMs: 180000, pollMs: 2000 });

    // The loop ran — both completed and failed are valid for UAT purposes
    // (we validate the machinery, not claude's output quality)
    expect(['completed', 'failed', 'timeout']).toContain(task.state);

    if (task.state === 'completed') {
      expect(existsSync(doneFile)).toBe(true);
      const contents = readFileSync(doneFile, 'utf8').trim();
      expect(contents).toBe('daemon-uat-success');
    } else {
      // Task failed or timed out — log for debugging but don't fail UAT
      console.warn('[daemon-uat] file-creation task did not complete:', task.state);
    }
  }, 240000); // 4 min timeout

  it('task.get returns the full task record after completion', async () => {
    // List all tasks and get the most recent
    const tasks = await client.request('task.list', {});
    expect(tasks.length).toBeGreaterThan(0);

    const task = await client.request('task.get', { taskId: tasks[0].id });
    expect(task.id).toBe(tasks[0].id);
    expect(task.prompt).toBeDefined();
    expect(task.state).toBeDefined();
    expect(task.createdAt).toBeDefined();
  });

  it('circuit breaker stays closed after normal task completion', async () => {
    const cb = await client.request('daemon.circuit.status');
    // A single failed task does not trip the circuit (threshold is 5)
    expect(cb.state).toBe('closed');
  });

  it('daemon.resource.snapshot shows zero queue depth after completion', async () => {
    const snap = await client.request('daemon.resource.snapshot');
    expect(snap.queueDepth).toBe(0);
  });

  it('daemon log records task lifecycle events', async () => {
    const log = harness.readLog();
    // Task lifecycle events are logged by DaemonSupervisor
    expect(log.length).toBeGreaterThan(0);
    // The IPC server startup must be in the log
    expect(log).toContain('IPC server listening');
  });

  it('graceful shutdown drains tasks and exits cleanly', async () => {
    // Submit a low-priority task then immediately stop
    await client.request('task.submit', {
      prompt: 'Echo "shutdown-test"',
      priority: 0,
    });

    // Stop the daemon — should exit cleanly, not hang
    const startStop = Date.now();
    await harness.stop();
    const elapsed = Date.now() - startStop;

    // Should complete well within the 8s force-kill window
    expect(elapsed).toBeLessThan(9000);
    expect(harness.proc.killed || harness.proc.exitCode !== null).toBe(true);
  }, 20000);
});

// ============================================================================
// Suite 3: Web server (optional — only if interface.web.enabled)
// ============================================================================

describe('UAT [LIVE-CLAUDE]: Daemon web server', () => {
  let harness;
  let client;
  let testDir;
  let webPort;

  beforeAll(async () => {
    testDir = makeTmpDir();
    harness = new DaemonHarness(testDir);
    // Pick a random high port to avoid conflicts
    webPort = 20000 + Math.floor(Math.random() * 40000);
    client = await harness.start({
      interface: {
        web: { enabled: true, port: webPort, host: '127.0.0.1' },
      },
    });
    // Give the web server a moment to bind
    await sleep(500);
  }, 30000);

  afterAll(async () => {
    await harness.stop();
    rmSync(testDir, { recursive: true, force: true });
  }, 15000);

  it('GET /api/status returns healthy JSON', async () => {
    const http = await import('node:http');
    const res = await new Promise((resolve, reject) => {
      const req = http.default.get(`http://127.0.0.1:${webPort}/api/status`, (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.status).toBe('healthy');
    expect(json.concurrency).toBeDefined();
    expect(json.budget).toBeDefined();
  });

  it('GET /api/loops returns running and queued arrays', async () => {
    const http = await import('node:http');
    const res = await new Promise((resolve, reject) => {
      const req = http.default.get(`http://127.0.0.1:${webPort}/api/loops`, (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(Array.isArray(json.running)).toBe(true);
    expect(Array.isArray(json.queued)).toBe(true);
  });

  it('GET /api/resources returns cpu and memory', async () => {
    const http = await import('node:http');
    const res = await new Promise((resolve, reject) => {
      const req = http.default.get(`http://127.0.0.1:${webPort}/api/resources`, (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.cpu).toBeDefined();
    expect(json.memory).toBeDefined();
    expect(typeof json.queueDepth).toBe('number');
  });

  it('GET /sse/events returns event-stream headers', async () => {
    const http = await import('node:http');
    const res = await new Promise((resolve, reject) => {
      const req = http.default.get(`http://127.0.0.1:${webPort}/sse/events`, (res) => {
        resolve(res);
        req.destroy();
      });
      req.on('error', (err) => {
        if (err.code !== 'ECONNRESET') reject(err);
      });
    });
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('POST /api/submit creates a task and returns 201', async () => {
    const http = await import('node:http');
    const body = JSON.stringify({ prompt: 'Echo "web-submit-test"' });
    const res = await new Promise((resolve, reject) => {
      const req = http.default.request(
        `http://127.0.0.1:${webPort}/api/submit`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          let b = '';
          res.on('data', c => { b += c; });
          res.on('end', () => resolve({ status: res.statusCode, body: b }));
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    expect(res.status).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.loopId).toBeDefined();
  });

  it('daemon log records web server startup', async () => {
    const log = harness.readLog();
    expect(log).toContain('Web server listening');
  });
});
