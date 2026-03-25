import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../../../tools/messaging/room-manager.mjs';

describe('RoomManager', () => {
  let rm;

  beforeEach(() => {
    rm = new RoomManager();
  });

  describe('addRoom / removeRoom', () => {
    it('adds a room and returns its config', () => {
      const room = rm.addRoom('telegram', '-100123');
      expect(room.id).toBe('telegram:-100123');
      expect(room.platform).toBe('telegram');
      expect(room.platformRoomId).toBe('-100123');
      expect(room.purpose).toBe('interactive');
      expect(rm.size).toBe(1);
    });

    it('returns existing room on duplicate add', () => {
      const r1 = rm.addRoom('telegram', '-100123', { label: 'first' });
      const r2 = rm.addRoom('telegram', '-100123', { label: 'second' });
      expect(r1).toBe(r2);
      expect(rm.size).toBe(1);
    });

    it('removes a room', () => {
      rm.addRoom('discord', '999');
      expect(rm.removeRoom('discord', '999')).toBe(true);
      expect(rm.size).toBe(0);
    });

    it('returns false for non-existent room removal', () => {
      expect(rm.removeRoom('telegram', 'nope')).toBe(false);
    });

    it('unbinds tasks when room is removed', () => {
      rm.addRoom('telegram', '-100123');
      rm.bindTask('task-1', 'telegram', '-100123');
      rm.removeRoom('telegram', '-100123');
      expect(rm.getRoomForTask('task-1')).toBeNull();
    });
  });

  describe('task binding', () => {
    it('binds a task to a room', () => {
      rm.addRoom('telegram', '-100123', { label: 'dev' });
      rm.bindTask('task-42', 'telegram', '-100123');

      const room = rm.getRoomForTask('task-42');
      expect(room).not.toBeNull();
      expect(room.label).toBe('dev');
    });

    it('returns null for unbound task', () => {
      expect(rm.getRoomForTask('unknown')).toBeNull();
    });

    it('unbinds a task', () => {
      rm.addRoom('telegram', '-100123');
      rm.bindTask('task-1', 'telegram', '-100123');
      rm.unbindTask('task-1');
      expect(rm.getRoomForTask('task-1')).toBeNull();
    });
  });

  describe('getBroadcastRooms', () => {
    it('returns only default rooms', () => {
      rm.addRoom('telegram', '-100', { isDefault: true, label: 'default' });
      rm.addRoom('telegram', '-200', { isDefault: false, label: 'other' });
      rm.addRoom('discord', '300', { isDefault: true, label: 'discord-default' });

      const broadcast = rm.getBroadcastRooms();
      expect(broadcast).toHaveLength(2);
      expect(broadcast.map(r => r.label)).toContain('default');
      expect(broadcast.map(r => r.label)).toContain('discord-default');
    });

    it('filters by platform', () => {
      rm.addRoom('telegram', '-100', { isDefault: true });
      rm.addRoom('discord', '300', { isDefault: true });

      const tgOnly = rm.getBroadcastRooms('telegram');
      expect(tgOnly).toHaveLength(1);
      expect(tgOnly[0].platform).toBe('telegram');
    });
  });

  describe('visibility / shouldSeeTask', () => {
    it('own visibility only sees bound tasks', () => {
      const room = rm.addRoom('telegram', '-100', { visibility: 'own' });
      rm.bindTask('task-1', 'telegram', '-100');
      rm.addRoom('telegram', '-200', { visibility: 'own' });

      expect(rm.shouldSeeTask(room, 'task-1')).toBe(true);
      expect(rm.shouldSeeTask(rm.getRoom('telegram', '-200'), 'task-1')).toBe(false);
    });

    it('all visibility sees everything', () => {
      const room = rm.addRoom('telegram', '-100', { visibility: 'all' });
      expect(rm.shouldSeeTask(room, 'any-task')).toBe(true);
    });

    it('explicit task list visibility', () => {
      const room = rm.addRoom('telegram', '-100', { visibility: ['task-1', 'task-3'] });
      expect(rm.shouldSeeTask(room, 'task-1')).toBe(true);
      expect(rm.shouldSeeTask(room, 'task-2')).toBe(false);
    });
  });

  describe('getRoomsForTaskEvent', () => {
    it('returns rooms that should see a task event', () => {
      rm.addRoom('telegram', '-100', { visibility: 'own' });
      rm.addRoom('telegram', '-200', { visibility: 'all' });
      rm.bindTask('task-1', 'telegram', '-100');

      const rooms = rm.getRoomsForTaskEvent('task-1');
      expect(rooms).toHaveLength(2);
    });
  });

  describe('loadFromConfig', () => {
    it('loads rooms from messaging config', () => {
      rm.loadFromConfig({
        telegram: {
          rooms: [
            { chat_id: '-100', label: 'ops', is_default: true, purpose: 'notifications' },
            { chat_id: '-200', label: 'dev', purpose: 'interactive' },
          ],
        },
        discord: {
          rooms: [
            { channel_id: '999', label: 'alerts', is_default: true },
          ],
        },
      });

      expect(rm.size).toBe(3);
      const tgRooms = rm.getRooms('telegram');
      expect(tgRooms).toHaveLength(2);
      expect(tgRooms[0].purpose).toBe('notifications');
    });

    it('skips platforms without rooms array', () => {
      rm.loadFromConfig({ telegram: { token: 'abc' } });
      expect(rm.size).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('returns serializable status', () => {
      rm.addRoom('telegram', '-100', { label: 'ops', isDefault: true });
      rm.bindTask('task-1', 'telegram', '-100');

      const status = rm.getStatus();
      expect(status.totalRooms).toBe(1);
      expect(status.totalBindings).toBe(1);
      expect(status.platforms.telegram).toHaveLength(1);
      expect(status.platforms.telegram[0].boundTasks).toContain('task-1');
    });
  });

  describe('constructor with initial rooms', () => {
    it('accepts rooms in constructor options', () => {
      const rm2 = new RoomManager({
        rooms: [
          { platform: 'telegram', platformRoomId: '-100', label: 'init-room', isDefault: true },
        ],
      });
      expect(rm2.size).toBe(1);
      expect(rm2.getRoom('telegram', '-100').label).toBe('init-room');
    });
  });
});
