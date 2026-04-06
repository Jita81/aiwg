/**
 * OrchestratorPTY Tests
 *
 * Tests for the assess loop that drives a PTY session via an LLM assessor.
 * All dependencies (ScreenReader, session, LLMAssessor) are mocked so no
 * real xterm/PTY process is required.
 *
 * @issue #755
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OrchestratorPTY,
  type OrchestratorAction,
  type OrchestratorContext,
  type OrchestratorSession,
  type LLMAssessor,
} from '../../../src/serve/orchestrator-pty.js';
import type { ScreenState } from '../../../src/serve/screen-reader.js';

// ============================================================
// Mock helpers
// ============================================================

function makeScreenState(overrides: Partial<ScreenState> = {}): ScreenState {
  return {
    text: [['$', ' ']],
    cursor: { row: 0, col: 2 },
    scrollback: [],
    summary: 'user@host:~$ ',
    prompt_detected: true,
    prompt_text: 'user@host:~$ ',
    ...overrides,
  };
}

function makeMockScreenReader(states: ScreenState[]) {
  let callIndex = 0;
  return {
    awaitChange: vi.fn(async (_opts?: { timeout?: number }): Promise<ScreenState> => {
      const state = states[Math.min(callIndex, states.length - 1)];
      callIndex++;
      return state;
    }),
    getState: vi.fn(() => makeScreenState()),
  };
}

function makeMockSession(): OrchestratorSession & {
  writeCalls: string[];
  signalCalls: string[];
} {
  const writeCalls: string[] = [];
  const signalCalls: string[] = [];
  return {
    writeCalls,
    signalCalls,
    write: vi.fn(async (data: string) => { writeCalls.push(data); }),
    signal: vi.fn(async (sig: string) => { signalCalls.push(sig); }),
  };
}

function makeMockLLM(actions: OrchestratorAction[]): LLMAssessor & {
  assessCalls: Parameters<LLMAssessor['assess']>[0][];
} {
  let callIndex = 0;
  const assessCalls: Parameters<LLMAssessor['assess']>[0][] = [];
  return {
    assessCalls,
    assess: vi.fn(async (input) => {
      assessCalls.push(input);
      const action = actions[Math.min(callIndex, actions.length - 1)];
      callIndex++;
      return action;
    }),
  };
}

function makeContext(overrides: Partial<OrchestratorContext> = {}): OrchestratorContext {
  return {
    mission: 'Run npm test and ensure it passes',
    recentActions: [],
    maxCycles: 20,
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe('OrchestratorPTY', () => {
  // -------------------------------------------------------
  // 1. Wait action — loop continues, awaitChange called again
  // -------------------------------------------------------
  it('wait action: calls awaitChange again without writing to session', async () => {
    const screenState = makeScreenState();
    const screenReader = makeMockScreenReader([screenState, screenState]);
    const session = makeMockSession();
    const llm = makeMockLLM([
      { action: 'wait', reasoning: 'still loading' },
      { action: 'complete', reasoning: 'done' },
    ]);
    const ctx = makeContext({ maxCycles: 10 });

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);
    await orch.run();

    expect(screenReader.awaitChange).toHaveBeenCalledTimes(2);
    expect(session.write).not.toHaveBeenCalled();
    expect(orch.done).toBe(true);
  });

  // -------------------------------------------------------
  // 2. Type action — session.write called with text + '\n'
  // -------------------------------------------------------
  it('type action: calls session.write with text + newline', async () => {
    const screenState = makeScreenState();
    const screenReader = makeMockScreenReader([screenState, screenState]);
    const session = makeMockSession();
    const llm = makeMockLLM([
      { action: 'type', text: 'npm test', reasoning: 'run the tests' },
      { action: 'complete', reasoning: 'done' },
    ]);
    const ctx = makeContext({ maxCycles: 10 });

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);
    await orch.run();

    expect(session.write).toHaveBeenCalledOnce();
    expect(session.writeCalls[0]).toBe('npm test\n');
  });

  // -------------------------------------------------------
  // 3. Signal action — session.signal called with the signal name
  // -------------------------------------------------------
  it('signal action: calls session.signal with the signal name', async () => {
    const screenState = makeScreenState();
    const screenReader = makeMockScreenReader([screenState, screenState]);
    const session = makeMockSession();
    const llm = makeMockLLM([
      { action: 'signal', signal: 'SIGINT', reasoning: 'interrupt stuck process' },
      { action: 'complete', reasoning: 'done' },
    ]);
    const ctx = makeContext({ maxCycles: 10 });

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);
    await orch.run();

    expect(session.signal).toHaveBeenCalledOnce();
    expect(session.signalCalls[0]).toBe('SIGINT');
  });

  // -------------------------------------------------------
  // 4. Complete action — loop exits, done is true
  // -------------------------------------------------------
  it('complete action: exits the loop immediately and marks done', async () => {
    const screenState = makeScreenState();
    const screenReader = makeMockScreenReader([screenState]);
    const session = makeMockSession();
    const llm = makeMockLLM([
      { action: 'complete', reasoning: 'mission accomplished' },
    ]);
    const ctx = makeContext({ maxCycles: 100 });

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);
    expect(orch.done).toBe(false);
    await orch.run();

    expect(orch.done).toBe(true);
    // Only one awaitChange before the complete
    expect(screenReader.awaitChange).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------
  // 5. Max cycles — exits after N cycles when no complete action
  // -------------------------------------------------------
  it('max cycles: exits after maxCycles when LLM always returns wait', async () => {
    const screenState = makeScreenState();
    const screenReader = makeMockScreenReader(Array(10).fill(screenState));
    const session = makeMockSession();
    const waitAction: OrchestratorAction = { action: 'wait', reasoning: 'still waiting' };
    const llm = makeMockLLM(Array(10).fill(waitAction));
    const ctx = makeContext({ maxCycles: 3 });

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);
    await orch.run();

    // Should have exited after exactly 3 cycles
    expect(screenReader.awaitChange).toHaveBeenCalledTimes(3);
    // done is true because max cycles auto-completes
    expect(orch.done).toBe(true);
  });

  // -------------------------------------------------------
  // 6. Pause / resume
  // -------------------------------------------------------
  it('pause: stops the loop at the next iteration boundary; resume: continues', async () => {
    const screenState = makeScreenState();
    // Enough states for several cycles
    const screenReader = makeMockScreenReader(Array(20).fill(screenState));
    const session = makeMockSession();

    let cycleCount = 0;
    const llm: LLMAssessor = {
      assess: vi.fn(async () => {
        cycleCount++;
        return { action: 'wait', reasoning: 'waiting' } as OrchestratorAction;
      }),
    };
    const ctx = makeContext({ maxCycles: 100 });

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);

    // Pause after 2 LLM calls by intercepting the 3rd awaitChange call
    let awaitCallCount = 0;
    const originalAwaitChange = screenReader.awaitChange;
    screenReader.awaitChange = vi.fn(async (opts) => {
      awaitCallCount++;
      if (awaitCallCount === 2) {
        // Pause the orchestrator just before returning from this call
        orch.pause();
      }
      return originalAwaitChange(opts);
    });

    // run() should return because it was paused
    await orch.run();

    expect(orch.paused).toBe(true);
    expect(orch.done).toBe(false);
    const cyclesBeforePause = cycleCount;
    expect(cyclesBeforePause).toBeGreaterThanOrEqual(1);

    // Now resume — should continue running
    // Add a complete action to stop the loop after resuming
    llm.assess = vi.fn(async () => ({
      action: 'complete',
      reasoning: 'done after resume',
    } as OrchestratorAction));

    await orch.resume();

    expect(orch.done).toBe(true);
  });

  // -------------------------------------------------------
  // 7. Action history — getHistory() returns correct sequence
  // -------------------------------------------------------
  it('getHistory returns all recorded actions in order', async () => {
    const screenState = makeScreenState();
    const screenReader = makeMockScreenReader(Array(5).fill(screenState));
    const session = makeMockSession();
    const actions: OrchestratorAction[] = [
      { action: 'type', text: 'ls', reasoning: 'list files' },
      { action: 'wait', reasoning: 'waiting for output' },
      { action: 'signal', signal: 'SIGINT', reasoning: 'interrupt' },
      { action: 'complete', reasoning: 'done' },
    ];
    const llm = makeMockLLM(actions);
    const ctx = makeContext({ maxCycles: 20 });

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);
    await orch.run();

    const history = orch.getHistory();
    // history should contain type, wait, signal, complete actions
    expect(history.length).toBe(4);
    expect(history[0].action).toBe('type');
    expect(history[1].action).toBe('wait');
    expect(history[2].action).toBe('signal');
    expect(history[3].action).toBe('complete');
  });

  // -------------------------------------------------------
  // 8. getHistory() returns a copy — mutations don't affect internal state
  // -------------------------------------------------------
  it('getHistory returns a copy, not a reference to the internal array', async () => {
    const screenState = makeScreenState();
    const screenReader = makeMockScreenReader([screenState]);
    const session = makeMockSession();
    const llm = makeMockLLM([{ action: 'complete', reasoning: 'done' }]);
    const ctx = makeContext({ maxCycles: 10 });

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);
    await orch.run();

    const history1 = orch.getHistory();
    history1.push({ action: 'wait', reasoning: 'injected' });

    const history2 = orch.getHistory();
    // The injected action must not appear in subsequent calls
    expect(history2.length).toBe(history1.length - 1);
  });

  // -------------------------------------------------------
  // 9. LLM receives correct context: mission, screen state, history
  // -------------------------------------------------------
  it('LLM assess call includes mission, screen state, and history window', async () => {
    const screenState = makeScreenState({
      summary: 'user@host:~$ npm test',
      prompt_detected: true,
      prompt_text: 'user@host:~$ ',
    });
    const screenReader = makeMockScreenReader([screenState, screenState]);
    const session = makeMockSession();
    const llm = makeMockLLM([
      { action: 'type', text: 'npm test', reasoning: 'run tests' },
      { action: 'complete', reasoning: 'done' },
    ]);
    const ctx = makeContext({ mission: 'Ensure tests pass' });

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);
    await orch.run();

    const firstCall = (llm as ReturnType<typeof makeMockLLM>).assessCalls[0];
    expect(firstCall.screen_state).toBe('user@host:~$ npm test');
    expect(firstCall.prompt_detected).toBe(true);
    expect(firstCall.prompt_text).toBe('user@host:~$ ');
    expect(firstCall.context.mission).toBe('Ensure tests pass');
    expect(Array.isArray(firstCall.history)).toBe(true);
  });

  // -------------------------------------------------------
  // 10. History window — LLM only receives last 10 actions
  // -------------------------------------------------------
  it('LLM assess call receives at most the last 10 actions', async () => {
    const screenState = makeScreenState();
    // 13 wait cycles + 1 complete
    const screenReader = makeMockScreenReader(Array(15).fill(screenState));
    const session = makeMockSession();

    let assessCallCount = 0;
    let lastHistoryLength = 0;
    const llm: LLMAssessor = {
      assess: vi.fn(async (input) => {
        assessCallCount++;
        lastHistoryLength = input.history.length;
        if (assessCallCount >= 14) {
          return { action: 'complete', reasoning: 'done' };
        }
        return { action: 'wait', reasoning: 'waiting' };
      }),
    };
    const ctx = makeContext({ maxCycles: 50 });

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);
    await orch.run();

    // After 13 wait + 1 complete calls, last history window should cap at 10
    expect(lastHistoryLength).toBeLessThanOrEqual(10);
  });

  // -------------------------------------------------------
  // 11. Default maxCycles is 100
  // -------------------------------------------------------
  it('uses default maxCycles of 100 when not specified in context', async () => {
    const screenState = makeScreenState();
    const screenReader = makeMockScreenReader(Array(101).fill(screenState));
    const session = makeMockSession();
    const waitAction: OrchestratorAction = { action: 'wait', reasoning: 'waiting' };
    const llm = makeMockLLM(Array(101).fill(waitAction));
    // Omit maxCycles to test default
    const ctx: OrchestratorContext = {
      mission: 'Test default maxCycles',
      recentActions: [],
    };

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);
    await orch.run();

    expect(screenReader.awaitChange).toHaveBeenCalledTimes(100);
    expect(orch.done).toBe(true);
  });

  // -------------------------------------------------------
  // 12. paused getter returns false initially
  // -------------------------------------------------------
  it('paused getter returns false before any pause() call', () => {
    const screenReader = makeMockScreenReader([makeScreenState()]);
    const session = makeMockSession();
    const llm = makeMockLLM([{ action: 'complete', reasoning: 'done' }]);
    const ctx = makeContext();

    const orch = new OrchestratorPTY(session, screenReader as never, llm, ctx);
    expect(orch.paused).toBe(false);
  });
});
