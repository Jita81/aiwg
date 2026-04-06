/**
 * OrchestratorOverride Tests
 *
 * Tests for the HITL (Human-in-the-Loop) override lifecycle manager.
 * Verifies pause/resume orchestration, event recording, idempotency,
 * multiple override cycles, and done-state guards.
 *
 * @issue #758
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OrchestratorOverride,
  type OverrideEvent,
} from '../../../src/serve/orchestrator-override.js';

// ============================================================
// Mock helpers
// ============================================================

function makeMockOrchestrator(opts: { done?: boolean } = {}) {
  const isDone = opts.done ?? false;
  return {
    pause: vi.fn(),
    resume: vi.fn(async () => {}),
    get done() { return isDone; },
  };
}

// ============================================================
// Tests
// ============================================================

describe('OrchestratorOverride', () => {
  // -------------------------------------------------------
  // 1. override() pauses the orchestrator
  // -------------------------------------------------------
  it('override: calls orchestrator.pause()', () => {
    const orch = makeMockOrchestrator();
    const override = new OrchestratorOverride(orch as never);
    override.override();
    expect(orch.pause).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------
  // 2. release() resumes the orchestrator
  // -------------------------------------------------------
  it('release: calls orchestrator.resume()', async () => {
    const orch = makeMockOrchestrator();
    const override = new OrchestratorOverride(orch as never);
    override.override();
    await override.release();
    expect(orch.resume).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------
  // 3. Active state transitions
  // -------------------------------------------------------
  it('active is false initially, true after override(), false after release()', async () => {
    const orch = makeMockOrchestrator();
    const override = new OrchestratorOverride(orch as never);

    expect(override.active).toBe(false);
    override.override();
    expect(override.active).toBe(true);
    await override.release();
    expect(override.active).toBe(false);
  });

  // -------------------------------------------------------
  // 4. Events recorded correctly
  // -------------------------------------------------------
  it('records override-start and override-end events with correct types and timestamps', async () => {
    const orch = makeMockOrchestrator();
    const override = new OrchestratorOverride(orch as never);

    const before = Date.now();
    override.override();
    await override.release();
    const after = Date.now();

    const events = override.getEvents();
    expect(events).toHaveLength(2);

    expect(events[0].type).toBe('override-start');
    expect(events[0].source).toBe('operator');
    expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(events[0].timestamp).toBeLessThanOrEqual(after);

    expect(events[1].type).toBe('override-end');
    expect(events[1].source).toBe('operator');
    expect(events[1].timestamp).toBeGreaterThanOrEqual(before);
    expect(events[1].timestamp).toBeLessThanOrEqual(after);
  });

  // -------------------------------------------------------
  // 5. Idempotent override — calling override() twice is safe
  // -------------------------------------------------------
  it('idempotent override: calling override() twice calls pause() only once and records only one start event', () => {
    const orch = makeMockOrchestrator();
    const override = new OrchestratorOverride(orch as never);

    override.override();
    override.override();

    expect(orch.pause).toHaveBeenCalledOnce();
    const events = override.getEvents();
    const startEvents = events.filter(e => e.type === 'override-start');
    expect(startEvents).toHaveLength(1);
  });

  // -------------------------------------------------------
  // 6. Idempotent release — calling release() without override is a no-op
  // -------------------------------------------------------
  it('idempotent release: calling release() without active override does not call resume() and records no events', async () => {
    const orch = makeMockOrchestrator();
    const override = new OrchestratorOverride(orch as never);

    await override.release();

    expect(orch.resume).not.toHaveBeenCalled();
    expect(override.getEvents()).toHaveLength(0);
  });

  // -------------------------------------------------------
  // 7. Multiple override/release cycles
  // -------------------------------------------------------
  it('multiple cycles: override → release → override → release produces 4 events in correct sequence', async () => {
    const orch = makeMockOrchestrator();
    const override = new OrchestratorOverride(orch as never);

    override.override();
    await override.release();
    override.override();
    await override.release();

    const events = override.getEvents();
    expect(events).toHaveLength(4);
    expect(events[0].type).toBe('override-start');
    expect(events[1].type).toBe('override-end');
    expect(events[2].type).toBe('override-start');
    expect(events[3].type).toBe('override-end');
  });

  // -------------------------------------------------------
  // 8. Override count
  // -------------------------------------------------------
  it('overrideCount reflects number of completed override cycles', async () => {
    const orch = makeMockOrchestrator();
    const override = new OrchestratorOverride(orch as never);

    expect(override.overrideCount).toBe(0);

    override.override();
    await override.release();
    expect(override.overrideCount).toBe(1);

    override.override();
    await override.release();
    expect(override.overrideCount).toBe(2);

    override.override();
    await override.release();
    expect(override.overrideCount).toBe(3);
  });

  // -------------------------------------------------------
  // 9. Done orchestrator — override is a no-op
  // -------------------------------------------------------
  it('override is a no-op when orchestrator is done', () => {
    const orch = makeMockOrchestrator({ done: true });
    const override = new OrchestratorOverride(orch as never);

    override.override();

    expect(orch.pause).not.toHaveBeenCalled();
    expect(override.active).toBe(false);
    expect(override.getEvents()).toHaveLength(0);
  });

  // -------------------------------------------------------
  // 10. getEvents() returns a copy
  // -------------------------------------------------------
  it('getEvents returns a copy — mutations do not affect internal state', async () => {
    const orch = makeMockOrchestrator();
    const override = new OrchestratorOverride(orch as never);

    override.override();
    await override.release();

    const events1 = override.getEvents();
    events1.push({ type: 'override-start', timestamp: 0, source: 'operator' });

    const events2 = override.getEvents();
    expect(events2).toHaveLength(2);
  });

  // -------------------------------------------------------
  // 11. Release also no-op when orchestrator is done
  // -------------------------------------------------------
  it('release is a no-op when orchestrator is done', async () => {
    const orch = makeMockOrchestrator({ done: true });
    const override = new OrchestratorOverride(orch as never);

    // Force active=true by going through a normal orchestrator first,
    // but since done prevents override, active stays false, and release won't fire.
    // We test that release() on a fresh done instance does not call resume().
    await override.release();

    expect(orch.resume).not.toHaveBeenCalled();
  });
});
