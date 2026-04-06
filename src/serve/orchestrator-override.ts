/**
 * OrchestratorOverride — Operator HITL (Human-in-the-Loop) handoff
 *
 * Manages the override lifecycle for an orchestrator session. When a human
 * operator needs to take direct control of a PTY session, they call override()
 * to pause the orchestrator, interact with the PTY directly, then call release()
 * to hand control back to the orchestrator.
 *
 * Flow:
 *   Orchestrator running → override() →
 *     orchestrator.pause() →
 *     PTY stdin routed to operator (caller manages routing) →
 *     operator interacts directly →
 *     release() →
 *     orchestrator.resume() with updated screen context
 *
 * Safety guarantees:
 *   - override() is idempotent — calling it when already overridden is a no-op
 *   - release() is idempotent — calling it when not overridden is a no-op
 *   - Both methods are no-ops when the orchestrator is in done state
 *   - All override events are recorded for audit trail
 *
 * Future enhancement: inject a 'wait' action with operator-override reasoning
 * into the orchestrator's history once OrchestratorPTY exposes addHistory().
 *
 * @issue #758
 * @see src/serve/orchestrator-pty.ts — OrchestratorPTY with pause()/resume()
 */

import type { OrchestratorPTY } from './orchestrator-pty.js';

// ============================================================
// Public types
// ============================================================

export interface OverrideEvent {
  type: 'override-start' | 'override-end';
  timestamp: number;
  source: 'operator';
}

// ============================================================
// OrchestratorOverride
// ============================================================

export class OrchestratorOverride {
  private readonly orchestrator: OrchestratorPTY;
  private _active = false;
  private _events: OverrideEvent[] = [];
  private _overrideCount = 0;

  constructor(orchestrator: OrchestratorPTY) {
    this.orchestrator = orchestrator;
  }

  /**
   * Take manual control. Pauses the orchestrator and records an override-start
   * event. The caller is responsible for routing PTY stdin to operator input
   * while the override is active.
   *
   * No-op if already overridden or if the orchestrator is done.
   */
  override(): void {
    if (this.orchestrator.done) return;
    if (this._active) return;

    this.orchestrator.pause();
    this._active = true;
    this._events.push({
      type: 'override-start',
      timestamp: Date.now(),
      source: 'operator',
    });
  }

  /**
   * Release manual control. Resumes the orchestrator and records an
   * override-end event. The orchestrator will read the current screen state
   * on its next cycle and continue from there.
   *
   * No-op if no override is active or if the orchestrator is done.
   */
  async release(): Promise<void> {
    if (this.orchestrator.done) return;
    if (!this._active) return;

    this._active = false;
    this._overrideCount++;
    this._events.push({
      type: 'override-end',
      timestamp: Date.now(),
      source: 'operator',
    });

    await this.orchestrator.resume();
  }

  /** Whether an override is currently active */
  get active(): boolean {
    return this._active;
  }

  /** Get all override events (returns a copy for audit trail safety) */
  getEvents(): OverrideEvent[] {
    return [...this._events];
  }

  /** Number of override cycles that have completed (override + release pairs) */
  get overrideCount(): number {
    return this._overrideCount;
  }
}
