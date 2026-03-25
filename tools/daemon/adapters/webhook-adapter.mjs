/**
 * WebhookAdapter — sends daemon events as HTTP POST with optional HMAC signature
 *
 * Each call to send() POSTs the event as JSON to the configured URL.
 * When a secret is provided the request includes an X-AIWG-Signature header
 * computed as HMAC-SHA256 over the serialised body (same convention as
 * GitHub webhooks).  An event-type filter can be supplied so the adapter
 * only forwards events the consumer cares about.
 *
 * @implements #521
 */

import { ChannelAdapter } from './base-adapter.mjs';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

export class WebhookAdapter extends ChannelAdapter {
  /**
   * @param {Object} options
   * @param {string} [options.id='webhook']    - Adapter identifier
   * @param {string} options.url               - Destination URL (http or https)
   * @param {string} [options.secret]          - HMAC secret; omit to skip signing
   * @param {string[]|null} [options.events]   - Allowlist of event types; null = all
   */
  constructor({ id, url, secret, events } = {}) {
    super({ id: id || 'webhook', type: 'webhook' });

    if (!url) throw new Error('WebhookAdapter requires a url');

    this.url = new URL(url);
    this.secret = secret || null;
    this.events = events || null; // null means accept every event type
  }

  /**
   * POST an event to the webhook URL.
   *
   * Skipped silently when an events allowlist is configured and the
   * message type is not in that list.
   *
   * @param {Object} message          - Event object
   * @param {string} message.type     - Event type used for filtering and headers
   * @param {*}      [message.data]   - Arbitrary event payload
   * @param {string} [message.timestamp]
   * @returns {Promise<{ statusCode: number, body: string }>}
   */
  async send(message) {
    // Apply event-type filter
    if (this.events !== null && !this.events.includes(message.type)) {
      return;
    }

    const body = JSON.stringify(message);

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'X-AIWG-Event': message.type || 'unknown',
    };

    if (this.secret) {
      const sig = crypto
        .createHmac('sha256', this.secret)
        .update(body)
        .digest('hex');
      headers['X-AIWG-Signature'] = `sha256=${sig}`;
    }

    return this._post(body, headers);
  }

  // --- Private helpers ---

  /**
   * Perform the HTTP(S) POST and return a promise that resolves to
   * { statusCode, body } or rejects on a network error.
   *
   * @param {string} body
   * @param {Object} headers
   * @returns {Promise<{ statusCode: number, body: string }>}
   */
  _post(body, headers) {
    const transport = this.url.protocol === 'https:' ? https : http;

    const options = {
      hostname: this.url.hostname,
      port: this.url.port || (this.url.protocol === 'https:' ? 443 : 80),
      path: this.url.pathname + this.url.search,
      method: 'POST',
      headers,
    };

    return new Promise((resolve, reject) => {
      const req = transport.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: responseBody }));
      });

      req.on('error', reject);

      req.write(body);
      req.end();
    });
  }
}
