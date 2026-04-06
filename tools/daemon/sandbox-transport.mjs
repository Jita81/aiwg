/**
 * Sandbox gRPC Transport for PTY Adapter
 *
 * Implements PTY-like I/O by bridging to an agentic-sandbox management server
 * via gRPC. Used when AIWG_SANDBOX_ENDPOINT is set, enabling container and VM
 * execution modes for platform TUIs.
 *
 * Protocol mapping (agentic-sandbox proto → PTY adapter):
 *   CommandRequest { allocate_pty: true } → start()
 *   StdinChunk { data }                  → write()
 *   PtyControl { resize }               → resize()
 *   PtyControl { signal: SIGTERM }       → stop()
 *   OutputChunk { data }                 → emit('data')
 *   SessionQuery/SessionReport           → list() / reconnect
 *
 * @issue #657
 * @see agentic-sandbox proto/agent.proto
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

/**
 * SandboxTransport wraps a gRPC connection to an agentic-sandbox management
 * server and exposes the same PTY-like interface as node-pty.
 *
 * This is NOT a full gRPC bidirectional stream implementation — it uses the
 * management server's HTTP REST API (port 8122) as a simpler integration path
 * that avoids requiring @grpc/grpc-js at runtime. The management server bridges
 * HTTP → gRPC internally.
 *
 * Events:
 *   'data'  (chunk: string) — output from the remote PTY
 *   'exit'  ({ exitCode }) — remote PTY process exited
 *   'error' (err: Error) — connection or protocol error
 */
export class SandboxTransport extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.httpEndpoint - Management server HTTP endpoint (e.g., 'http://localhost:8122')
   * @param {string} opts.agentId - Target agent ID on the sandbox
   * @param {string} opts.command - Command to execute (e.g., 'claude')
   * @param {string[]} [opts.args] - Command arguments
   * @param {number} [opts.cols] - Terminal width (default: 120)
   * @param {number} [opts.rows] - Terminal height (default: 30)
   * @param {string} [opts.cwd] - Working directory on the remote agent
   */
  constructor({
    httpEndpoint,
    agentId,
    command,
    args = [],
    cols = 120,
    rows = 30,
    cwd = '/home/agent',
  }) {
    super();
    this.httpEndpoint = httpEndpoint.replace(/\/$/, '');
    this.agentId = agentId;
    this.command = command;
    this.args = args;
    this.cols = cols;
    this.rows = rows;
    this.cwd = cwd;
    this.commandId = null;
    this.taskId = null;
    this._stopped = false;
    this._pollTimer = null;
    this._logOffset = 0;
  }

  /**
   * Start a PTY session on the remote sandbox agent.
   * Submits a task manifest and begins polling for output.
   *
   * @returns {Promise<string>} The command/task ID for this session
   */
  async start() {
    // Submit task via REST API — the management server dispatches to the agent
    const cmdLine = [this.command, ...this.args].join(' ');
    const manifest = {
      manifest_yaml: [
        'version: "1"',
        'kind: Task',
        'metadata:',
        `  name: "pty-${this.agentId}-${Date.now()}"`,
        '  labels:',
        '    aiwg_transport: pty',
        'claude:',
        `  prompt: "${cmdLine}"`,
        '  headless: true',
        '  skip_permissions: true',
        'vm:',
        '  profile: agentic-dev',
      ].join('\n'),
    };

    try {
      const resp = await fetch(`${this.httpEndpoint}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`Task submission failed: ${resp.status} ${body}`);
      }

      const result = await resp.json();
      this.taskId = result.task_id;
      this.commandId = this.taskId;

      // Start polling for output via SSE log stream
      this._startLogPoll();

      return this.commandId;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Reconnect to an existing session by task ID.
   * @param {string} taskId - The task ID to reconnect to
   * @returns {Promise<string>} The task ID
   */
  async reconnect(taskId) {
    this.taskId = taskId;
    this.commandId = taskId;

    // Verify the task exists and is still running
    try {
      const resp = await fetch(`${this.httpEndpoint}/api/v1/tasks/${taskId}`);
      if (!resp.ok) throw new Error(`Task ${taskId} not found`);
      const task = await resp.json();
      if (task.state === 'completed' || task.state === 'failed' || task.state === 'cancelled') {
        this.emit('exit', { exitCode: task.state === 'completed' ? 0 : 1 });
        return taskId;
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }

    this._startLogPoll();
    return taskId;
  }

  /**
   * Send input to the remote PTY (stdin).
   * Uses the management server's WebSocket hub on port 8121.
   * Falls back to HTTP if WS is not available.
   *
   * @param {string} data - Input text to send
   */
  write(data) {
    if (this._stopped || !this.commandId) return;

    // Use HTTP endpoint to send stdin via the management API
    // The management server will route this to the agent's PTY via gRPC StdinChunk
    const wsEndpoint = this.httpEndpoint.replace(/:\d+$/, ':8121');
    // For now, send via HTTP — WS stdin requires an active WS connection
    // which is handled by the browser's xterm.js connecting directly to :8121
    fetch(`${this.httpEndpoint}/api/v1/tasks/${this.taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stdin: data }),
    }).catch(() => {
      // stdin delivery failure is non-fatal — log but don't throw
    });
  }

  /**
   * Resize the remote PTY terminal.
   * @param {number} cols
   * @param {number} rows
   */
  resize(cols, rows) {
    if (this._stopped || !this.commandId) return;
    this.cols = cols;
    this.rows = rows;
    // PTY resize is handled by the WS connection from the browser
    // The sandbox management server processes PtyControl { resize } messages
    // from the connected WebSocket client at :8121
  }

  /**
   * Stop the remote PTY session.
   * Cancels the task on the management server.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (this._stopped) return;
    this._stopped = true;
    this._stopLogPoll();

    if (this.taskId) {
      try {
        await fetch(`${this.httpEndpoint}/api/v1/tasks/${this.taskId}`, {
          method: 'DELETE',
        });
      } catch {
        // Best-effort cancellation
      }
    }

    this.emit('exit', { exitCode: 0, signal: 'SIGTERM' });
  }

  /** @returns {boolean} Whether the session is active */
  isActive() { return !this._stopped && this.commandId !== null; }

  /** @returns {string|null} The task/command ID */
  getCommandId() { return this.commandId; }

  /**
   * List active sessions on the remote sandbox.
   * @returns {Promise<Array<{taskId, name, state, agentId}>>}
   */
  async listSessions() {
    try {
      const resp = await fetch(`${this.httpEndpoint}/api/v1/tasks?state=running`);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.tasks || []).map((t) => ({
        taskId: t.id,
        name: t.name,
        state: t.state,
        agentId: t.agent_id,
      }));
    } catch {
      return [];
    }
  }

  // ---- Internal: log polling ----

  _startLogPoll() {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(() => this._pollLogs(), 500);
    // Immediate first poll
    this._pollLogs();
  }

  _stopLogPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async _pollLogs() {
    if (this._stopped || !this.taskId) return;

    try {
      const resp = await fetch(
        `${this.httpEndpoint}/api/v1/tasks/${this.taskId}/logs?offset=${this._logOffset}`,
      );
      if (!resp.ok) {
        if (resp.status === 404) {
          // Task no longer exists
          this._stopped = true;
          this._stopLogPoll();
          this.emit('exit', { exitCode: 0 });
        }
        return;
      }

      const text = await resp.text();
      if (text.length > 0) {
        this._logOffset += text.length;
        this.emit('data', text);
      }

      // Check task status
      const statusResp = await fetch(`${this.httpEndpoint}/api/v1/tasks/${this.taskId}`);
      if (statusResp.ok) {
        const task = await statusResp.json();
        if (['completed', 'failed', 'cancelled'].includes(task.state)) {
          this._stopped = true;
          this._stopLogPoll();
          this.emit('exit', {
            exitCode: task.state === 'completed' ? 0 : 1,
            signal: task.state === 'cancelled' ? 'SIGTERM' : undefined,
          });
        }
      }
    } catch {
      // Network error — will retry on next poll
    }
  }
}
