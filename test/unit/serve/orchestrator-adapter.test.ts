/**
 * OrchestratorAdapter Tests
 *
 * Tests for the adapters that wire ScreenReader + OrchestratorPTY to live
 * PTY sessions from the WebSocket bridge.
 *
 * All dependencies (PtySession, PtyLike, LLMAssessor) are mocked — no real
 * xterm terminal or PTY process is required.
 *
 * Requires @xterm/headless (devDependency).
 *
 * @issue #756
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createScreenReaderFromSession,
  createSessionAdapter,
  attachOrchestrator,
} from '../../../src/serve/orchestrator-adapter.js';
import type { PtySession, PtyLike } from '../../../src/serve/pty-bridge.js';
import type { OrchestratorContext, LLMAssessor } from '../../../src/serve/orchestrator-pty.js';

// ============================================================
// Mock helpers
// ============================================================

/** Build a minimal PtyLike mock that captures onData callbacks */
function makeMockPty(): PtyLike & {
  writtenData: string[];
  killedSignals: Array<string | undefined>;
  triggerData(data: string): void;
} {
  const writtenData: string[] = [];
  const killedSignals: Array<string | undefined> = [];
  const dataCallbacks: Array<(data: string) => void> = [];
  const exitCallbacks: Array<(event: { exitCode: number }) => void> = [];

  return {
    writtenData,
    killedSignals,
    write: vi.fn((data: string) => { writtenData.push(data); }),
    resize: vi.fn(),
    kill: vi.fn((signal?: string) => { killedSignals.push(signal); }),
    onData: vi.fn((cb: (data: string) => void) => { dataCallbacks.push(cb); }),
    onExit: vi.fn((cb: (event: { exitCode: number }) => void) => { exitCallbacks.push(cb); }),
    triggerData(data: string) {
      dataCallbacks.forEach((cb) => cb(data));
    },
  };
}

/** Build a PtySession with the given outputBuffer and optional PtyLike */
function makeMockSession(
  outputBuffer = '',
  pty: PtyLike | null = null,
): PtySession {
  return {
    id: 'test-session',
    clients: new Map(),
    outputBuffer,
    pty,
    lastDisconnect: 0,
    exited: false,
  };
}

/** Build an LLMAssessor that immediately returns 'complete' */
function makeCompletingLLM(): LLMAssessor {
  return {
    assess: vi.fn(async () => ({
      action: 'complete' as const,
      reasoning: 'done',
    })),
  };
}

/** Build a minimal OrchestratorContext */
function makeContext(overrides: Partial<OrchestratorContext> = {}): OrchestratorContext {
  return {
    mission: 'test mission',
    recentActions: [],
    maxCycles: 5,
    ...overrides,
  };
}

// ============================================================
// createScreenReaderFromSession
// ============================================================

describe('createScreenReaderFromSession', () => {
  it('returns a ScreenReader instance', () => {
    const session = makeMockSession('', null);
    const reader = createScreenReaderFromSession(session);
    expect(reader).toBeDefined();
    expect(typeof reader.write).toBe('function');
    expect(typeof reader.getState).toBe('function');
    expect(typeof reader.awaitChange).toBe('function');
    reader.dispose();
  });

  it('replays outputBuffer into the ScreenReader on creation', async () => {
    // When the session already has buffered output, the reader should have it
    // after creation. We verify by checking that getState() does not throw.
    const session = makeMockSession('hello world\r\n$ ', null);
    const reader = createScreenReaderFromSession(session);
    // Give xterm's async write callback a chance to fire
    await new Promise((r) => setTimeout(r, 50));
    const state = reader.getState();
    expect(state).toBeDefined();
    expect(typeof state.summary).toBe('string');
    reader.dispose();
  });

  it('feeds live PTY data into the ScreenReader when pty.onData fires', async () => {
    const pty = makeMockPty();
    const session = makeMockSession('', pty);
    const reader = createScreenReaderFromSession(session);

    // Write some data through the PTY data channel
    pty.triggerData('$ ');
    // Allow xterm callback to settle
    await new Promise((r) => setTimeout(r, 50));

    const state = reader.getState();
    expect(state).toBeDefined();
    reader.dispose();
  });

  it('registers onData callback with the session PTY', () => {
    const pty = makeMockPty();
    const session = makeMockSession('', pty);
    const reader = createScreenReaderFromSession(session);
    expect(pty.onData).toHaveBeenCalledOnce();
    reader.dispose();
  });

  it('does not call pty.onData when pty is null', () => {
    // Should not throw; just replay outputBuffer and skip live attachment
    const session = makeMockSession('buffered output', null);
    expect(() => createScreenReaderFromSession(session)).not.toThrow();
    const reader = createScreenReaderFromSession(session);
    reader.dispose();
  });

  it('uses provided rows and cols for the ScreenReader dimensions', () => {
    const session = makeMockSession('', null);
    // Should not throw with custom dimensions
    const reader = createScreenReaderFromSession(session, { rows: 40, cols: 132 });
    expect(reader).toBeDefined();
    reader.dispose();
  });
});

// ============================================================
// createSessionAdapter
// ============================================================

describe('createSessionAdapter', () => {
  it('returns an object with write() and signal() methods', () => {
    const pty = makeMockPty();
    const session = makeMockSession('', pty);
    const adapter = createSessionAdapter(session);
    expect(typeof adapter.write).toBe('function');
    expect(typeof adapter.signal).toBe('function');
  });

  it('write() calls pty.write() with the given data', async () => {
    const pty = makeMockPty();
    const session = makeMockSession('', pty);
    const adapter = createSessionAdapter(session);
    await adapter.write('npm test\n');
    expect(pty.write).toHaveBeenCalledOnce();
    expect(pty.writtenData[0]).toBe('npm test\n');
  });

  it('signal() calls pty.kill() with the given signal', async () => {
    const pty = makeMockPty();
    const session = makeMockSession('', pty);
    const adapter = createSessionAdapter(session);
    await adapter.signal('SIGINT');
    expect(pty.kill).toHaveBeenCalledOnce();
    expect(pty.killedSignals[0]).toBe('SIGINT');
  });

  it('write() rejects when pty is null', async () => {
    const session = makeMockSession('', null);
    const adapter = createSessionAdapter(session);
    await expect(adapter.write('data')).rejects.toThrow();
  });

  it('signal() rejects when pty is null', async () => {
    const session = makeMockSession('', null);
    const adapter = createSessionAdapter(session);
    await expect(adapter.signal('SIGINT')).rejects.toThrow();
  });

  it('write() forwards multiple calls in order', async () => {
    const pty = makeMockPty();
    const session = makeMockSession('', pty);
    const adapter = createSessionAdapter(session);
    await adapter.write('first\n');
    await adapter.write('second\n');
    expect(pty.writtenData).toEqual(['first\n', 'second\n']);
  });
});

// ============================================================
// attachOrchestrator
// ============================================================

describe('attachOrchestrator', () => {
  it('returns orchestrator, screenReader, and detach function', () => {
    const pty = makeMockPty();
    const session = makeMockSession('', pty);
    const { orchestrator, screenReader, detach } = attachOrchestrator({
      session,
      llm: makeCompletingLLM(),
      context: makeContext(),
    });

    expect(orchestrator).toBeDefined();
    expect(screenReader).toBeDefined();
    expect(typeof detach).toBe('function');
    expect(typeof orchestrator.run).toBe('function');
    expect(typeof orchestrator.pause).toBe('function');

    detach();
    screenReader.dispose();
  });

  it('orchestrator is not done before run() is called', () => {
    const pty = makeMockPty();
    const session = makeMockSession('', pty);
    const { orchestrator, screenReader, detach } = attachOrchestrator({
      session,
      llm: makeCompletingLLM(),
      context: makeContext(),
    });

    expect(orchestrator.done).toBe(false);
    detach();
    screenReader.dispose();
  });

  it('detach() pauses the orchestrator without throwing', () => {
    const pty = makeMockPty();
    const session = makeMockSession('', pty);
    const { orchestrator, screenReader, detach } = attachOrchestrator({
      session,
      llm: makeCompletingLLM(),
      context: makeContext(),
    });

    expect(() => detach()).not.toThrow();
    expect(orchestrator.paused).toBe(true);
    screenReader.dispose();
  });

  it('detach() stops live PTY data from reaching the ScreenReader', async () => {
    const pty = makeMockPty();
    const session = makeMockSession('', pty);
    const { screenReader, detach } = attachOrchestrator({
      session,
      llm: makeCompletingLLM(),
      context: makeContext(),
    });

    detach();

    // After detach, triggering PTY data should not cause the screenReader to process it.
    // We verify this by spying on screenReader.write after detach.
    const writeSpy = vi.spyOn(screenReader, 'write');
    pty.triggerData('post-detach data');
    await new Promise((r) => setTimeout(r, 30));

    expect(writeSpy).not.toHaveBeenCalled();
    screenReader.dispose();
  });

  it('re-attach after detach picks up fresh outputBuffer content', () => {
    const pty = makeMockPty();
    const session = makeMockSession('initial output', pty);

    const first = attachOrchestrator({
      session,
      llm: makeCompletingLLM(),
      context: makeContext(),
    });
    first.detach();
    first.screenReader.dispose();

    // Simulate new output accumulated while detached
    session.outputBuffer = 'initial output\r\nnew output';

    const second = attachOrchestrator({
      session,
      llm: makeCompletingLLM(),
      context: makeContext(),
    });

    expect(second.screenReader).toBeDefined();
    expect(second.orchestrator).toBeDefined();

    second.detach();
    second.screenReader.dispose();
  });

  it('uses custom rows and cols when provided', () => {
    const pty = makeMockPty();
    const session = makeMockSession('', pty);
    const { screenReader, detach } = attachOrchestrator({
      session,
      llm: makeCompletingLLM(),
      context: makeContext(),
      rows: 50,
      cols: 200,
    });

    expect(screenReader).toBeDefined();
    detach();
    screenReader.dispose();
  });
});

// ============================================================
// Null PTY handling (cross-cutting)
// ============================================================

describe('null PTY handling', () => {
  it('createSessionAdapter.write() throws when pty is null', async () => {
    const session = makeMockSession('', null);
    const adapter = createSessionAdapter(session);
    await expect(adapter.write('data')).rejects.toThrow(/pty/i);
  });

  it('createSessionAdapter.signal() throws when pty is null', async () => {
    const session = makeMockSession('', null);
    const adapter = createSessionAdapter(session);
    await expect(adapter.signal('SIGTERM')).rejects.toThrow(/pty/i);
  });

  it('attachOrchestrator works with null pty (bufferOnly mode)', () => {
    // Session may have buffered output but no live PTY yet
    const session = makeMockSession('buffered output from replay', null);
    expect(() => {
      const { detach, screenReader } = attachOrchestrator({
        session,
        llm: makeCompletingLLM(),
        context: makeContext(),
      });
      detach();
      screenReader.dispose();
    }).not.toThrow();
  });
});
