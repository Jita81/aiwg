/**
 * MessageRouter — decouples daemon commands/events from delivery channels
 *
 * The router sits between the daemon's internal event model and any number of
 * outbound channel adapters (webhooks, SSE feeds, WebSocket clients, etc.).
 * Adapters register themselves; the router fans broadcast() calls out to all
 * of them and normalises inbound commands from bidirectional adapters before
 * forwarding them to the AgentSupervisor.
 *
 * @implements #521
 * @tests @test/unit/message-router.test.mjs
 */

import { EventEmitter } from 'node:events';

export class MessageRouter extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {import('./agent-supervisor.mjs').AgentSupervisor} [options.supervisor]
   *   Optional AgentSupervisor instance used to fulfil command dispatch.
   *   If omitted, all command calls return a 'supervisor unavailable' error.
   */
  constructor({ supervisor } = {}) {
    super();
    this._adapters = new Map(); // adapterId -> ChannelAdapter
    this.supervisor = supervisor || null;
  }

  // =========================================================================
  // Adapter lifecycle
  // =========================================================================

  /**
   * Register a channel adapter with the router.
   *
   * The adapter must expose: id, type, send(), start(), stop(), getInfo().
   * After registration its inbound commands are wired to handleCommand().
   *
   * @param {import('./adapters/base-adapter.mjs').ChannelAdapter} adapter
   * @throws {Error} if an adapter with the same id is already registered
   */
  registerAdapter(adapter) {
    if (!adapter || !adapter.id) {
      throw new Error('registerAdapter requires an adapter with an id property');
    }

    if (this._adapters.has(adapter.id)) {
      throw new Error(`Adapter '${adapter.id}' is already registered`);
    }

    // Wire inbound commands from bidirectional adapters
    if (typeof adapter.onCommand === 'function') {
      adapter.onCommand((payload) => this.handleCommand(payload));
    }

    this._adapters.set(adapter.id, adapter);
    this.emit('adapter:registered', { adapterId: adapter.id, type: adapter.type });
  }

  /**
   * Stop and deregister an adapter by id.
   * No-ops silently if the id is not found.
   *
   * @param {string} adapterId
   * @returns {Promise<void>}
   */
  async removeAdapter(adapterId) {
    const adapter = this._adapters.get(adapterId);
    if (!adapter) return;

    try {
      await adapter.stop();
    } catch {
      // Best-effort stop; proceed with removal regardless
    }

    this._adapters.delete(adapterId);
    this.emit('adapter:removed', { adapterId });
  }

  // =========================================================================
  // Command dispatch
  // =========================================================================

  /**
   * Normalise and dispatch an inbound command from any adapter.
   *
   * Supported commands:
   *   submit   - Submit a new agent task (args: { prompt, agent?, priority? })
   *   cancel   - Cancel a task        (args: { taskId })
   *   status   - Supervisor status    (no args)
   *   loops    - Alias for status
   *   history  - Task list            (args: { state?, limit? })
   *
   * @param {Object} payload
   * @param {string} payload.source   - Adapter id that originated the command
   * @param {string} payload.command  - Command name
   * @param {Object} [payload.args]   - Command arguments
   * @param {string} [payload.replyTo] - Optional reply-target hint for the adapter
   * @returns {Object} result object with { ok: boolean, data?, error? }
   */
  handleCommand({ source, command, args = {}, replyTo } = {}) {
    if (!this.supervisor) {
      return { ok: false, error: 'supervisor unavailable' };
    }

    try {
      switch (command) {
        case 'submit': {
          if (!args.prompt) {
            return { ok: false, error: 'submit requires args.prompt' };
          }
          const task = this.supervisor.submit(args.prompt, {
            agent: args.agent,
            priority: args.priority || 0,
          });
          return { ok: true, data: { taskId: task.id, state: task.state } };
        }

        case 'cancel': {
          if (!args.taskId) {
            return { ok: false, error: 'cancel requires args.taskId' };
          }
          const cancelled = this.supervisor.cancel(args.taskId);
          return { ok: true, data: { cancelled } };
        }

        case 'status':
        case 'loops': {
          return { ok: true, data: this.supervisor.getStatus() };
        }

        case 'history': {
          if (!this.supervisor.taskStore) {
            return { ok: false, error: 'task store unavailable' };
          }
          const tasks = this.supervisor.taskStore.getTasks({
            state: args.state,
            limit: args.limit || 20,
          });
          return { ok: true, data: tasks };
        }

        default:
          return { ok: false, error: `unknown command: ${command}` };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // =========================================================================
  // Event fan-out
  // =========================================================================

  /**
   * Fan an event out to every registered adapter.
   *
   * Delivery errors from individual adapters are caught and emitted as
   * 'adapter:error' events so one failing adapter cannot block the others.
   *
   * @param {Object} event
   * @param {string} event.type       - Event type
   * @param {*}      [event.data]     - Payload
   * @param {string} [event.timestamp] - ISO timestamp; injected if absent
   */
  broadcast(event) {
    const normalised = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    for (const [adapterId, adapter] of this._adapters) {
      Promise.resolve()
        .then(() => adapter.send(normalised))
        .catch((err) => {
          this.emit('adapter:error', { adapterId, error: err.message, event: normalised });
        });
    }
  }

  // =========================================================================
  // Introspection
  // =========================================================================

  /**
   * Return a snapshot of all registered adapters' info objects.
   *
   * @returns {Array<{ id: string, type: string, status: string, connectedAt: string|null }>}
   */
  getAdapters() {
    return Array.from(this._adapters.values()).map((a) => a.getInfo());
  }
}
