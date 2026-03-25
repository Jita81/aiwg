/**
 * Tests for ConsecutiveFailureCircuitBreaker
 *
 * @implements Issue #514
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConsecutiveFailureCircuitBreaker,
  CircuitState,
} from '../../../tools/ralph-external/lib/consecutive-failure-circuit-breaker.mjs';

describe('ConsecutiveFailureCircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new ConsecutiveFailureCircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 5000,
      halfOpenMaxProbes: 1,
    });
  });

  afterEach(() => {
    breaker.destroy();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize in CLOSED state', () => {
      const state = breaker.getState();
      expect(state.state).toBe(CircuitState.CLOSED);
      expect(state.consecutiveFailures).toBe(0);
      expect(state.lastFailureAt).toBeNull();
      expect(state.cooldownRemainingMs).toBe(0);
    });

    it('should use defaults when no options provided', () => {
      const defaultBreaker = new ConsecutiveFailureCircuitBreaker();
      expect(defaultBreaker.failureThreshold).toBe(5);
      expect(defaultBreaker.cooldownMs).toBe(120_000);
      expect(defaultBreaker.halfOpenMaxProbes).toBe(1);
      defaultBreaker.destroy();
    });

    it('should accept custom configuration', () => {
      expect(breaker.failureThreshold).toBe(3);
      expect(breaker.cooldownMs).toBe(5000);
      expect(breaker.halfOpenMaxProbes).toBe(1);
    });
  });

  describe('CLOSED state', () => {
    it('should allow execution', () => {
      expect(breaker.canExecute()).toBe(true);
    });

    it('should stay CLOSED on successes', () => {
      breaker.recordSuccess();
      breaker.recordSuccess();
      expect(breaker.getState().state).toBe(CircuitState.CLOSED);
    });

    it('should track consecutive failures', () => {
      breaker.recordFailure();
      expect(breaker.getState().consecutiveFailures).toBe(1);
      breaker.recordFailure();
      expect(breaker.getState().consecutiveFailures).toBe(2);
    });

    it('should reset failure count on success', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();
      expect(breaker.getState().consecutiveFailures).toBe(0);
    });

    it('should record lastFailureAt timestamp', () => {
      const now = new Date('2026-03-25T10:00:00Z');
      vi.setSystemTime(now);
      breaker.recordFailure();
      expect(breaker.getState().lastFailureAt).toBe(now.toISOString());
    });
  });

  describe('CLOSED -> OPEN transition', () => {
    it('should trip to OPEN after threshold consecutive failures', () => {
      const changes = [];
      breaker.on('state:change', (evt) => changes.push(evt));
      const trips = [];
      breaker.on('trip', (evt) => trips.push(evt));

      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState().state).toBe(CircuitState.CLOSED);

      breaker.recordFailure(); // hits threshold of 3
      expect(breaker.getState().state).toBe(CircuitState.OPEN);

      expect(changes).toHaveLength(1);
      expect(changes[0].from).toBe(CircuitState.CLOSED);
      expect(changes[0].to).toBe(CircuitState.OPEN);

      expect(trips).toHaveLength(1);
      expect(trips[0].consecutiveFailures).toBe(3);
    });

    it('should not trip if a success intervenes', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess(); // resets counter
      breaker.recordFailure();
      expect(breaker.getState().state).toBe(CircuitState.CLOSED);
      expect(breaker.getState().consecutiveFailures).toBe(1);
    });
  });

  describe('OPEN state', () => {
    beforeEach(() => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) breaker.recordFailure();
      expect(breaker.getState().state).toBe(CircuitState.OPEN);
    });

    it('should block execution', () => {
      expect(breaker.canExecute()).toBe(false);
    });

    it('should report cooldown remaining', () => {
      const state = breaker.getState();
      expect(state.cooldownRemainingMs).toBeGreaterThan(0);
      expect(state.cooldownRemainingMs).toBeLessThanOrEqual(5000);
    });

    it('should transition to HALF_OPEN after cooldown', () => {
      const changes = [];
      breaker.on('state:change', (evt) => changes.push(evt));

      vi.advanceTimersByTime(5000);

      expect(breaker.getState().state).toBe(CircuitState.HALF_OPEN);
      expect(changes).toHaveLength(1);
      expect(changes[0].from).toBe(CircuitState.OPEN);
      expect(changes[0].to).toBe(CircuitState.HALF_OPEN);
    });

    it('should transition to HALF_OPEN on canExecute check after cooldown', () => {
      // Manually advance time without firing timers
      vi.advanceTimersByTime(5001);
      // canExecute should detect cooldown elapsed and transition
      expect(breaker.canExecute()).toBe(true);
      expect(breaker.getState().state).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(() => {
      // Trip the breaker and advance past cooldown
      for (let i = 0; i < 3; i++) breaker.recordFailure();
      vi.advanceTimersByTime(5000);
      expect(breaker.getState().state).toBe(CircuitState.HALF_OPEN);
    });

    it('should allow limited probes', () => {
      expect(breaker.canExecute()).toBe(true);
    });

    it('should transition to CLOSED on success', () => {
      const changes = [];
      breaker.on('state:change', (evt) => changes.push(evt));
      const recoveries = [];
      breaker.on('recover', () => recoveries.push(true));

      breaker.recordSuccess();

      expect(breaker.getState().state).toBe(CircuitState.CLOSED);
      expect(changes).toHaveLength(1);
      expect(changes[0].from).toBe(CircuitState.HALF_OPEN);
      expect(changes[0].to).toBe(CircuitState.CLOSED);
      expect(recoveries).toHaveLength(1);
    });

    it('should transition back to OPEN on failure', () => {
      const changes = [];
      breaker.on('state:change', (evt) => changes.push(evt));

      breaker.recordFailure();

      expect(breaker.getState().state).toBe(CircuitState.OPEN);
      expect(changes).toHaveLength(1);
      expect(changes[0].from).toBe(CircuitState.HALF_OPEN);
      expect(changes[0].to).toBe(CircuitState.OPEN);
    });

    it('should start a new cooldown after failure', () => {
      breaker.recordFailure();
      expect(breaker.getState().state).toBe(CircuitState.OPEN);
      expect(breaker.getState().cooldownRemainingMs).toBeGreaterThan(0);

      // Advance past cooldown again
      vi.advanceTimersByTime(5000);
      expect(breaker.getState().state).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('reset()', () => {
    it('should return to CLOSED from OPEN', () => {
      for (let i = 0; i < 3; i++) breaker.recordFailure();
      expect(breaker.getState().state).toBe(CircuitState.OPEN);

      breaker.reset();
      expect(breaker.getState().state).toBe(CircuitState.CLOSED);
      expect(breaker.getState().consecutiveFailures).toBe(0);
      expect(breaker.canExecute()).toBe(true);
    });

    it('should return to CLOSED from HALF_OPEN', () => {
      for (let i = 0; i < 3; i++) breaker.recordFailure();
      vi.advanceTimersByTime(5000);
      expect(breaker.getState().state).toBe(CircuitState.HALF_OPEN);

      breaker.reset();
      expect(breaker.getState().state).toBe(CircuitState.CLOSED);
    });

    it('should emit state:change on reset', () => {
      for (let i = 0; i < 3; i++) breaker.recordFailure();
      const changes = [];
      breaker.on('state:change', (evt) => changes.push(evt));

      breaker.reset();
      expect(changes).toHaveLength(1);
      expect(changes[0].reason).toBe('manual reset');
    });

    it('should not emit state:change if already CLOSED', () => {
      const changes = [];
      breaker.on('state:change', (evt) => changes.push(evt));
      breaker.reset();
      expect(changes).toHaveLength(0);
    });
  });

  describe('full lifecycle', () => {
    it('should cycle through all states correctly', () => {
      const states = [];
      breaker.on('state:change', (evt) => states.push(`${evt.from}->${evt.to}`));

      // CLOSED: 3 failures trips to OPEN
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(states).toEqual(['closed->open']);

      // OPEN: wait for cooldown -> HALF_OPEN
      vi.advanceTimersByTime(5000);
      expect(states).toEqual(['closed->open', 'open->half-open']);

      // HALF_OPEN: failure -> OPEN again
      breaker.recordFailure();
      expect(states).toEqual(['closed->open', 'open->half-open', 'half-open->open']);

      // OPEN: wait for cooldown -> HALF_OPEN
      vi.advanceTimersByTime(5000);
      expect(states).toEqual([
        'closed->open',
        'open->half-open',
        'half-open->open',
        'open->half-open',
      ]);

      // HALF_OPEN: success -> CLOSED
      breaker.recordSuccess();
      expect(states).toEqual([
        'closed->open',
        'open->half-open',
        'half-open->open',
        'open->half-open',
        'half-open->closed',
      ]);

      expect(breaker.getState().state).toBe(CircuitState.CLOSED);
      expect(breaker.canExecute()).toBe(true);
    });
  });
});
