/**
 * ConsecutiveFailureCircuitBreaker - Three-state circuit breaker
 *
 * Implements the standard circuit breaker pattern:
 *   CLOSED (normal) -> N consecutive failures -> OPEN (blocking)
 *   OPEN -> cooldown expires -> HALF_OPEN (probe)
 *   HALF_OPEN -> success -> CLOSED
 *   HALF_OPEN -> failure -> OPEN (reset cooldown)
 *
 * @implements #514
 * @tests @test/unit/circuit-breaker.test.mjs
 */

import { EventEmitter } from 'node:events';

export const CircuitState = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open',
});

export class ConsecutiveFailureCircuitBreaker extends EventEmitter {
  /**
   * @param {object} options
   * @param {number} [options.failureThreshold=5] Consecutive failures to trip open
   * @param {number} [options.cooldownMs=120000] Time in OPEN before transitioning to HALF_OPEN
   * @param {number} [options.halfOpenMaxProbes=1] Max concurrent probes in HALF_OPEN
   */
  constructor(options = {}) {
    super();
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 120_000;
    this.halfOpenMaxProbes = options.halfOpenMaxProbes ?? 1;

    this._state = CircuitState.CLOSED;
    this._consecutiveFailures = 0;
    this._lastFailureAt = null;
    this._openedAt = null;
    this._cooldownTimer = null;
    this._activeProbes = 0;
  }

  /**
   * Check whether execution is allowed in the current state.
   * In HALF_OPEN, limits concurrent probes.
   */
  canExecute() {
    switch (this._state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN: {
        // Check if cooldown has elapsed (in case timer hasn't fired yet)
        if (this._openedAt && Date.now() - this._openedAt >= this.cooldownMs) {
          this._transitionTo(CircuitState.HALF_OPEN, 'cooldown elapsed on check');
          return this._activeProbes < this.halfOpenMaxProbes;
        }
        return false;
      }

      case CircuitState.HALF_OPEN:
        return this._activeProbes < this.halfOpenMaxProbes;

      default:
        return false;
    }
  }

  /**
   * Record a successful execution. Resets failure counter.
   * In HALF_OPEN, transitions back to CLOSED.
   */
  recordSuccess() {
    this._consecutiveFailures = 0;
    this._activeProbes = Math.max(0, this._activeProbes - 1);

    if (this._state === CircuitState.HALF_OPEN) {
      this._transitionTo(CircuitState.CLOSED, 'probe succeeded');
      this.emit('recover');
    }
  }

  /**
   * Record a failed execution. Increments failure counter.
   * May trip the breaker open.
   */
  recordFailure() {
    this._consecutiveFailures++;
    this._lastFailureAt = Date.now();
    this._activeProbes = Math.max(0, this._activeProbes - 1);

    if (this._state === CircuitState.HALF_OPEN) {
      // Probe failed — back to OPEN with fresh cooldown
      this._transitionTo(CircuitState.OPEN, 'probe failed');
      return;
    }

    if (this._state === CircuitState.CLOSED && this._consecutiveFailures >= this.failureThreshold) {
      this._transitionTo(CircuitState.OPEN, `${this._consecutiveFailures} consecutive failures`);
      this.emit('trip', { consecutiveFailures: this._consecutiveFailures });
    }
  }

  /**
   * Get current breaker state snapshot.
   */
  getState() {
    const now = Date.now();
    let cooldownRemainingMs = 0;

    if (this._state === CircuitState.OPEN && this._openedAt) {
      cooldownRemainingMs = Math.max(0, this.cooldownMs - (now - this._openedAt));
    }

    return {
      state: this._state,
      consecutiveFailures: this._consecutiveFailures,
      lastFailureAt: this._lastFailureAt ? new Date(this._lastFailureAt).toISOString() : null,
      cooldownRemainingMs,
    };
  }

  /**
   * Force-reset the breaker to CLOSED state.
   */
  reset() {
    this._clearCooldownTimer();
    this._consecutiveFailures = 0;
    this._lastFailureAt = null;
    this._openedAt = null;
    this._activeProbes = 0;
    const from = this._state;
    this._state = CircuitState.CLOSED;
    if (from !== CircuitState.CLOSED) {
      this.emit('state:change', { from, to: CircuitState.CLOSED, reason: 'manual reset' });
    }
  }

  /**
   * Clean up timers. Call when done with the breaker.
   */
  destroy() {
    this._clearCooldownTimer();
    this.removeAllListeners();
  }

  // --- Private ---

  _transitionTo(newState, reason) {
    const from = this._state;
    if (from === newState) return;

    this._state = newState;
    this.emit('state:change', { from, to: newState, reason });

    if (newState === CircuitState.OPEN) {
      this._openedAt = Date.now();
      this._startCooldownTimer();
    } else {
      this._clearCooldownTimer();
      this._openedAt = null;
    }

    if (newState === CircuitState.HALF_OPEN) {
      this._activeProbes = 0;
    }
  }

  _startCooldownTimer() {
    this._clearCooldownTimer();
    this._cooldownTimer = setTimeout(() => {
      if (this._state === CircuitState.OPEN) {
        this._transitionTo(CircuitState.HALF_OPEN, 'cooldown expired');
      }
    }, this.cooldownMs);
    // Allow process to exit even if timer is pending
    if (this._cooldownTimer.unref) {
      this._cooldownTimer.unref();
    }
  }

  _clearCooldownTimer() {
    if (this._cooldownTimer) {
      clearTimeout(this._cooldownTimer);
      this._cooldownTimer = null;
    }
  }
}
