/**
 * ChannelAdapter — base class for all delivery channel adapters
 *
 * Channel adapters bridge the MessageRouter to external delivery mechanisms
 * (webhooks, websockets, SSE, etc.). Subclasses implement send() and may
 * override start()/stop() for lifecycle management.
 *
 * @implements #521
 */

export class ChannelAdapter {
  /**
   * @param {Object} options
   * @param {string} options.id   - Unique adapter identifier within the router
   * @param {string} options.type - Adapter type label (e.g. 'webhook', 'sse')
   */
  constructor({ id, type }) {
    if (!id) throw new Error('ChannelAdapter requires an id');
    if (!type) throw new Error('ChannelAdapter requires a type');

    this.id = id;
    this.type = type;
    this.status = 'stopped';
    this._commandHandler = null;
    this._connectedAt = null;
  }

  /**
   * Register a handler that will be called when the adapter receives an
   * inbound command (e.g. over a bidirectional channel like WebSocket).
   *
   * @param {Function} handler - Called with ({ source, command, args, replyTo })
   */
  onCommand(handler) {
    this._commandHandler = handler;
  }

  /**
   * Send an event/message through this channel.
   * Must be implemented by subclasses.
   *
   * @param {Object} message  - Event object (shape: { type, data, timestamp })
   * @param {Object} [options]
   * @returns {Promise<void>}
   */
  async send(message, options) {
    throw new Error(`${this.constructor.name}.send() must be implemented`);
  }

  /**
   * Start the adapter (open connections, begin listening, etc.).
   * Subclasses may override but should call super.start() to set state.
   *
   * @returns {Promise<void>}
   */
  async start() {
    this.status = 'running';
    this._connectedAt = new Date().toISOString();
  }

  /**
   * Stop the adapter (close connections, release resources, etc.).
   * Subclasses may override but should call super.stop() to set state.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    this.status = 'stopped';
  }

  /**
   * Return a plain-object snapshot of this adapter's identity and state.
   *
   * @returns {{ id: string, type: string, status: string, connectedAt: string|null }}
   */
  getInfo() {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      connectedAt: this._connectedAt,
    };
  }
}
