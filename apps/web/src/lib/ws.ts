/**
 * Reconnecting WebSocket client with exponential backoff.
 *
 * Wraps native WebSocket and automatically reconnects on disconnect.
 * Replays messages received during reconnect attempts via the bridge's
 * 64KB session buffer (#712).
 */

export type WsMessage = {
  type: 'data' | 'resize' | 'close' | 'exit' | 'error';
  payload?: string;
  message?: string;
  cols?: number;
  rows?: number;
  code?: number;
};

export type WsEventHandler = (msg: WsMessage) => void;

interface ReconnectingWsOptions {
  /** Initial retry delay in ms (default: 500) */
  initialDelay?: number;
  /** Max retry delay in ms (default: 30_000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffFactor?: number;
}

export class ReconnectingWs {
  private url: string;
  private ws: WebSocket | null = null;
  private handlers = new Set<WsEventHandler>();
  private retryDelay: number;
  private readonly maxDelay: number;
  private readonly backoffFactor: number;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, opts: ReconnectingWsOptions = {}) {
    this.url = url;
    this.retryDelay = opts.initialDelay ?? 500;
    this.maxDelay = opts.maxDelay ?? 30_000;
    this.backoffFactor = opts.backoffFactor ?? 2;
    this.connect();
  }

  private connect(): void {
    if (this.destroyed) return;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.retryDelay = 500; // reset backoff on successful connect
    };

    this.ws.onmessage = (evt: MessageEvent<string>) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(evt.data) as WsMessage;
      } catch {
        return;
      }
      for (const h of this.handlers) h(msg);
    };

    this.ws.onclose = () => {
      if (this.destroyed) return;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose — reconnect handled there
    };
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * this.backoffFactor, this.maxDelay);
  }

  /** Subscribe to incoming messages */
  onMessage(handler: WsEventHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  /** Send a message to the PTY server */
  send(msg: WsMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Destroy the connection permanently */
  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
  }

  /** True if currently connected */
  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Build a WebSocket URL for a PTY session.
 *
 * Uses the current page's host so it works behind proxies.
 */
export function ptyWsUrl(sessionId: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/pty/${encodeURIComponent(sessionId)}`;
}
