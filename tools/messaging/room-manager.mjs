/**
 * RoomManager — Multi-room coordination for messaging adapters.
 *
 * Manages a registry of rooms across all platforms, room-to-task bindings,
 * and targeted message delivery. Each room has a purpose classification
 * (interactive, notifications, logs) and visibility settings.
 *
 * @implements Plan: Daemon Starter — Multi-Room Messaging
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} RoomConfig
 * @property {string} id - Composite key "platform:platformRoomId"
 * @property {string} platform - "telegram" | "discord" | "slack"
 * @property {string} platformRoomId - Native channel/chat ID
 * @property {string} label - Human-readable name
 * @property {'interactive'|'notifications'|'logs'} purpose - Room purpose
 * @property {boolean} isDefault - Receives broadcast messages
 * @property {'own'|'all'|string[]} visibility - Task visibility scope
 * @property {'static'|'dynamic'} source - How the room was added
 * @property {string} joinedAt - ISO-8601 timestamp
 */

/**
 * @typedef {Object} RoomManagerOptions
 * @property {RoomConfig[]} [rooms] - Initial rooms from config
 */

export class RoomManager extends EventEmitter {
  /** @type {Map<string, RoomConfig>} */
  #rooms = new Map();

  /** @type {Map<string, string>} taskId -> room composite key */
  #taskBindings = new Map();

  /**
   * @param {RoomManagerOptions} [options]
   */
  constructor(options = {}) {
    super();
    if (options.rooms) {
      for (const room of options.rooms) {
        this.addRoom(room.platform, room.platformRoomId, room);
      }
    }
  }

  /**
   * Register a room.
   *
   * @param {string} platform
   * @param {string} platformRoomId
   * @param {Partial<RoomConfig>} [options]
   * @returns {RoomConfig}
   */
  addRoom(platform, platformRoomId, options = {}) {
    const id = `${platform}:${platformRoomId}`;

    if (this.#rooms.has(id)) {
      return this.#rooms.get(id);
    }

    /** @type {RoomConfig} */
    const room = {
      id,
      platform,
      platformRoomId,
      label: options.label || platformRoomId,
      purpose: options.purpose || 'interactive',
      isDefault: options.isDefault ?? options.is_default ?? false,
      visibility: options.visibility || 'own',
      source: options.source || 'static',
      joinedAt: new Date().toISOString(),
    };

    this.#rooms.set(id, room);
    this.emit('room:added', room);
    return room;
  }

  /**
   * Remove a room.
   *
   * @param {string} platform
   * @param {string} platformRoomId
   * @returns {boolean}
   */
  removeRoom(platform, platformRoomId) {
    const id = `${platform}:${platformRoomId}`;
    const room = this.#rooms.get(id);
    if (!room) return false;

    // Unbind any tasks associated with this room
    for (const [taskId, roomId] of this.#taskBindings) {
      if (roomId === id) {
        this.#taskBindings.delete(taskId);
      }
    }

    this.#rooms.delete(id);
    this.emit('room:removed', room);
    return true;
  }

  /**
   * Bind a task to a room so its output is routed there.
   *
   * @param {string} taskId
   * @param {string} platform
   * @param {string} platformRoomId
   */
  bindTask(taskId, platform, platformRoomId) {
    const roomId = `${platform}:${platformRoomId}`;
    this.#taskBindings.set(taskId, roomId);
    this.emit('task:bound', { taskId, roomId });
  }

  /**
   * Remove a task-room binding.
   *
   * @param {string} taskId
   */
  unbindTask(taskId) {
    this.#taskBindings.delete(taskId);
  }

  /**
   * Look up which room a task is bound to.
   *
   * @param {string} taskId
   * @returns {RoomConfig|null}
   */
  getRoomForTask(taskId) {
    const roomId = this.#taskBindings.get(taskId);
    if (!roomId) return null;
    return this.#rooms.get(roomId) || null;
  }

  /**
   * Get all rooms marked as default (receive broadcast messages).
   *
   * @param {string} [platform] - Filter by platform
   * @returns {RoomConfig[]}
   */
  getBroadcastRooms(platform) {
    const rooms = [];
    for (const room of this.#rooms.values()) {
      if (!room.isDefault) continue;
      if (platform && room.platform !== platform) continue;
      rooms.push(room);
    }
    return rooms;
  }

  /**
   * Get all rooms, optionally filtered by platform.
   *
   * @param {string} [platform]
   * @returns {RoomConfig[]}
   */
  getRooms(platform) {
    if (!platform) return [...this.#rooms.values()];
    return [...this.#rooms.values()].filter(r => r.platform === platform);
  }

  /**
   * Get a specific room.
   *
   * @param {string} platform
   * @param {string} platformRoomId
   * @returns {RoomConfig|null}
   */
  getRoom(platform, platformRoomId) {
    return this.#rooms.get(`${platform}:${platformRoomId}`) || null;
  }

  /**
   * Check if a room should see a task's events based on visibility settings.
   *
   * @param {RoomConfig} room
   * @param {string} taskId
   * @returns {boolean}
   */
  shouldSeeTask(room, taskId) {
    if (room.visibility === 'all') return true;
    if (room.visibility === 'own') {
      const boundRoom = this.#taskBindings.get(taskId);
      return boundRoom === room.id;
    }
    if (Array.isArray(room.visibility)) {
      return room.visibility.includes(taskId);
    }
    return false;
  }

  /**
   * Get rooms that should receive events for a specific task.
   *
   * @param {string} taskId
   * @returns {RoomConfig[]}
   */
  getRoomsForTaskEvent(taskId) {
    const rooms = [];
    for (const room of this.#rooms.values()) {
      if (this.shouldSeeTask(room, taskId)) {
        rooms.push(room);
      }
    }
    return rooms;
  }

  /** @returns {number} */
  get size() {
    return this.#rooms.size;
  }

  /** @returns {number} */
  get bindingCount() {
    return this.#taskBindings.size;
  }

  /**
   * Load rooms from a messaging config section.
   *
   * @param {Object} messagingConfig - The messaging section of daemon config
   */
  loadFromConfig(messagingConfig) {
    if (!messagingConfig) return;

    for (const [platform, platformConfig] of Object.entries(messagingConfig)) {
      if (!platformConfig?.rooms || !Array.isArray(platformConfig.rooms)) continue;

      for (const roomDef of platformConfig.rooms) {
        const platformRoomId = roomDef.chat_id || roomDef.channel_id || roomDef.roomId;
        if (!platformRoomId) continue;

        this.addRoom(platform, platformRoomId, {
          label: roomDef.label || roomDef.name || platformRoomId,
          purpose: roomDef.purpose || 'interactive',
          isDefault: roomDef.is_default ?? roomDef.isDefault ?? false,
          visibility: roomDef.visibility || 'own',
          source: 'static',
        });
      }
    }
  }

  /**
   * Serialize room state for status reporting.
   *
   * @returns {Object}
   */
  getStatus() {
    const platforms = {};
    for (const room of this.#rooms.values()) {
      if (!platforms[room.platform]) platforms[room.platform] = [];
      platforms[room.platform].push({
        id: room.platformRoomId,
        label: room.label,
        purpose: room.purpose,
        isDefault: room.isDefault,
        boundTasks: [...this.#taskBindings.entries()]
          .filter(([, rid]) => rid === room.id)
          .map(([tid]) => tid),
      });
    }
    return {
      totalRooms: this.#rooms.size,
      totalBindings: this.#taskBindings.size,
      platforms,
    };
  }
}

export default RoomManager;
