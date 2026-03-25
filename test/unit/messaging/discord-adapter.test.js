/**
 * Tests for DiscordAdapter — constructor, multi-room support, and send behavior.
 *
 * @source @tools/messaging/adapters/discord.mjs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { DiscordAdapter } = await import(
  '../../../tools/messaging/adapters/discord.mjs'
);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Stub a successful fetch() for Discord API calls. */
function stubFetch(responseBody = {}, status = 200) {
  return vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(responseBody),
    headers: { get: () => null },
  }));
}

/** Minimal valid config for single-channel mode. */
const SINGLE_CONFIG = {
  botToken: 'test-token',
  defaultChannelId: '111',
};

/** Minimal valid config for multi-room mode. */
const MULTI_CONFIG = {
  botToken: 'test-token',
  rooms: [
    { channel_id: '111', label: 'dev',    is_default: true,  purpose: 'interactive' },
    { channel_id: '222', label: 'logs',   is_default: false, purpose: 'logs' },
    { channel_id: '333', label: 'alerts', is_default: true,  purpose: 'notifications' },
  ],
};

// ── Constructor ───────────────────────────────────────────────────────────────

describe('DiscordAdapter constructor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AIWG_DISCORD_TOKEN;
    delete process.env.AIWG_DISCORD_CHANNEL_ID;
  });

  // ── Token validation ──────────────────────────────────────────────────────

  it('throws when no bot token provided', () => {
    expect(() => new DiscordAdapter({ defaultChannelId: '111' })).toThrow(
      /bot token required/i
    );
  });

  it('falls back to AIWG_DISCORD_TOKEN env var', () => {
    process.env.AIWG_DISCORD_TOKEN = 'env-token';
    process.env.AIWG_DISCORD_CHANNEL_ID = '111';
    expect(() => new DiscordAdapter()).not.toThrow();
  });

  // ── Channel validation ────────────────────────────────────────────────────

  it('throws when no channel provided in any form', () => {
    expect(() => new DiscordAdapter({ botToken: 'tok' })).toThrow(
      /at least one channel ID/i
    );
  });

  it('falls back to AIWG_DISCORD_CHANNEL_ID env var', () => {
    process.env.AIWG_DISCORD_CHANNEL_ID = '999';
    const adapter = new DiscordAdapter({ botToken: 'tok' });
    expect(adapter.getRooms().size).toBe(1);
  });

  // ── Single-channel mode ───────────────────────────────────────────────────

  it('auto-creates a single room from defaultChannelId', () => {
    const adapter = new DiscordAdapter(SINGLE_CONFIG);
    const rooms = adapter.getRooms();
    expect(rooms.size).toBe(1);
    const room = rooms.get('111');
    expect(room.roomId).toBe('111');
    expect(room.label).toBe('default');
    expect(room.isDefault).toBe(true);
    expect(room.purpose).toBe('interactive');
  });

  // ── Multi-room mode ───────────────────────────────────────────────────────

  it('registers all rooms from config.rooms array', () => {
    const adapter = new DiscordAdapter(MULTI_CONFIG);
    const rooms = adapter.getRooms();
    expect(rooms.size).toBe(3);
  });

  it('preserves room labels from config.rooms', () => {
    const adapter = new DiscordAdapter(MULTI_CONFIG);
    expect(adapter.getRooms().get('111').label).toBe('dev');
    expect(adapter.getRooms().get('222').label).toBe('logs');
    expect(adapter.getRooms().get('333').label).toBe('alerts');
  });

  it('preserves isDefault flag from config.rooms', () => {
    const adapter = new DiscordAdapter(MULTI_CONFIG);
    expect(adapter.getRooms().get('111').isDefault).toBe(true);
    expect(adapter.getRooms().get('222').isDefault).toBe(false);
    expect(adapter.getRooms().get('333').isDefault).toBe(true);
  });

  it('preserves purpose from config.rooms', () => {
    const adapter = new DiscordAdapter(MULTI_CONFIG);
    expect(adapter.getRooms().get('111').purpose).toBe('interactive');
    expect(adapter.getRooms().get('222').purpose).toBe('logs');
    expect(adapter.getRooms().get('333').purpose).toBe('notifications');
  });

  it('derives defaultChannelId from first default room when not explicit', () => {
    const adapter = new DiscordAdapter({
      botToken: 'tok',
      rooms: [
        { channel_id: '100', label: 'other',   is_default: false },
        { channel_id: '200', label: 'primary', is_default: true  },
      ],
    });
    // Should not throw — defaultChannelId derived from room 200
    expect(adapter.getRooms().size).toBe(2);
  });

  it('falls back to first room when no room has is_default', () => {
    const adapter = new DiscordAdapter({
      botToken: 'tok',
      rooms: [
        { channel_id: '100', label: 'first'  },
        { channel_id: '200', label: 'second' },
      ],
    });
    expect(adapter.getRooms().size).toBe(2);
  });

  it('skips rooms entries with missing channel_id', () => {
    const adapter = new DiscordAdapter({
      botToken: 'tok',
      defaultChannelId: '999',
      rooms: [
        { channel_id: '111', label: 'valid' },
        { label: 'no-id-missing' },          // no channel_id — skipped
      ],
    });
    // 1 from rooms + already have defaultChannelId so no auto-create
    expect(adapter.getRooms().has('111')).toBe(true);
    expect(adapter.getRooms().has(undefined)).toBe(false);
  });

  // ── camelCase aliases ─────────────────────────────────────────────────────

  it('accepts channelId (camelCase) alias', () => {
    const adapter = new DiscordAdapter({
      botToken: 'tok',
      rooms: [{ channelId: '555', label: 'camel', isDefault: true }],
    });
    expect(adapter.getRooms().get('555').roomId).toBe('555');
  });

  it('accepts isDefault (camelCase) alias', () => {
    const adapter = new DiscordAdapter({
      botToken: 'tok',
      rooms: [{ channel_id: '666', isDefault: true }],
    });
    expect(adapter.getRooms().get('666').isDefault).toBe(true);
  });

  // ── rooms co-exists with defaultChannelId ─────────────────────────────────

  it('does not auto-create extra room when rooms already registered', () => {
    const adapter = new DiscordAdapter({
      botToken: 'tok',
      defaultChannelId: '111',
      rooms: [
        { channel_id: '111', label: 'main', is_default: true },
        { channel_id: '222', label: 'secondary' },
      ],
    });
    // Only 2 rooms from config — no extra auto-created room
    expect(adapter.getRooms().size).toBe(2);
  });
});

// ── Room management ───────────────────────────────────────────────────────────

describe('DiscordAdapter room management', () => {
  let adapter;

  beforeEach(() => {
    adapter = new DiscordAdapter(MULTI_CONFIG);
  });

  it('addRoom() registers a new room dynamically', () => {
    adapter.addRoom('444', { label: 'extra', isDefault: false, purpose: 'logs' });
    expect(adapter.getRooms().size).toBe(4);
    expect(adapter.getRooms().get('444').label).toBe('extra');
  });

  it('removeRoom() removes a registered room', () => {
    adapter.removeRoom('222');
    expect(adapter.getRooms().size).toBe(2);
    expect(adapter.getRooms().has('222')).toBe(false);
  });

  it('removeRoom() returns false for unknown room', () => {
    expect(adapter.removeRoom('nonexistent')).toBe(false);
  });

  it('getRooms() returns a Map', () => {
    expect(adapter.getRooms()).toBeInstanceOf(Map);
  });
});

// ── send() and broadcastToRooms() ─────────────────────────────────────────────

describe('DiscordAdapter send behavior', () => {
  let adapter;

  const MOCK_MESSAGE = {
    title: 'Test',
    body: 'Hello',
    severity: 'info',
    fields: [],
    project: 'test-project',
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    adapter = new DiscordAdapter(MULTI_CONFIG);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('send() posts to the specified channelId', async () => {
    stubFetch({ id: 'msg-abc' });
    const result = await adapter.send(MOCK_MESSAGE, '222');
    expect(result.success).toBe(true);
    expect(result.channelId).toBe('222');
    const [, path] = vi.mocked(fetch).mock.calls[0];
    // fetch call is to Discord API for the specified channel
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/channels/222/messages'),
      expect.any(Object)
    );
  });

  it('send() returns success: false and records error on API failure', async () => {
    stubFetch({ message: 'Missing Access' }, 403);
    const result = await adapter.send(MOCK_MESSAGE, '111');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(adapter.getStatus().errors).toBeGreaterThan(0);
  });

  it('broadcastToRooms() sends only to isDefault:true rooms', async () => {
    stubFetch({ id: 'msg-1' });
    const results = await adapter.broadcastToRooms(MOCK_MESSAGE);
    // MULTI_CONFIG has 2 default rooms (111 and 333)
    expect(results.length).toBe(2);
    expect(results.every(r => r.success)).toBe(true);
  });

  it('broadcastToRooms() skips non-default rooms', async () => {
    stubFetch({ id: 'msg-1' });
    await adapter.broadcastToRooms(MOCK_MESSAGE);
    const calledUrls = vi.mocked(fetch).mock.calls.map(([url]) => url);
    // Channel 222 (is_default: false) should NOT be called
    expect(calledUrls.every(url => !url.includes('/channels/222/'))).toBe(true);
  });

  it('sendToRoom() sends to the given room ID', async () => {
    stubFetch({ id: 'msg-2' });
    const result = await adapter.sendToRoom(MOCK_MESSAGE, '333');
    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/channels/333/messages'),
      expect.any(Object)
    );
  });

  it('incrementing send counter on success', async () => {
    stubFetch({ id: 'msg-3' });
    await adapter.send(MOCK_MESSAGE, '111');
    expect(adapter.getStatus().messagesSent).toBe(1);
  });
});

// ── initialize() and shutdown() ───────────────────────────────────────────────

describe('DiscordAdapter lifecycle', () => {
  let adapter;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initialize() marks adapter connected on valid token', async () => {
    stubFetch({ username: 'TestBot', discriminator: '0001' });
    adapter = new DiscordAdapter(SINGLE_CONFIG);
    await adapter.initialize();
    expect(adapter.getStatus().connected).toBe(true);
  });

  it('initialize() throws on invalid token', async () => {
    stubFetch({ message: '401: Unauthorized' }, 401);
    adapter = new DiscordAdapter(SINGLE_CONFIG);
    await expect(adapter.initialize()).rejects.toThrow(/initialization failed/i);
  });

  it('shutdown() marks adapter disconnected', async () => {
    stubFetch({ username: 'TestBot', discriminator: '0001' });
    adapter = new DiscordAdapter(SINGLE_CONFIG);
    await adapter.initialize();
    await adapter.shutdown();
    expect(adapter.getStatus().connected).toBe(false);
  });
});
