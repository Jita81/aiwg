/**
 * OrchestratorAdapter — wires ScreenReader + OrchestratorPTY to live PTY sessions
 *
 * Provides factory functions that connect the orchestrator assess loop to a
 * real PTY session from the WebSocket bridge:
 *
 *   createScreenReaderFromSession — attach ScreenReader to a PtySession's output
 *   createSessionAdapter          — implement OrchestratorSession over PtyLike
 *   attachOrchestrator            — full attach: reader + adapter + orchestrator
 *
 * @issue #756
 * @see src/serve/screen-reader.ts   — ScreenReader / ScreenState
 * @see src/serve/orchestrator-pty.ts — OrchestratorPTY / OrchestratorSession
 * @see src/serve/pty-bridge.ts      — PtySession / PtyLike
 */

import { ScreenReader } from './screen-reader.js';
import { OrchestratorPTY, type OrchestratorSession, type OrchestratorContext, type LLMAssessor } from './orchestrator-pty.js';
import type { PtySession } from './pty-bridge.js';

// ============================================================
// createScreenReaderFromSession
// ============================================================

/**
 * Creates a ScreenReader that consumes data from a PtySession's output.
 *
 * - Replays session.outputBuffer immediately so the reader has current screen
 *   state from the moment it is constructed.
 * - If the session's PTY is live, registers an onData listener so subsequent
 *   output continues to flow into the reader.
 *
 * Callers are responsible for calling reader.dispose() when done.
 */
export function createScreenReaderFromSession(
  session: PtySession,
  opts?: { rows?: number; cols?: number },
): ScreenReader {
  const reader = new ScreenReader({
    rows: opts?.rows ?? 24,
    cols: opts?.cols ?? 80,
  });

  // Replay any buffered output so the orchestrator starts with current state
  if (session.outputBuffer) {
    reader.write(session.outputBuffer);
  }

  // Attach to live PTY output when a PTY is running
  if (session.pty) {
    session.pty.onData((data: string) => {
      reader.write(data);
    });
  }

  return reader;
}

// ============================================================
// createSessionAdapter
// ============================================================

/**
 * Creates an OrchestratorSession adapter that writes to a PtySession's PTY stdin.
 *
 * Translates orchestrator write() and signal() calls into direct PTY operations.
 * Rejects if the session's PTY is null (not yet spawned or already cleaned up).
 */
export function createSessionAdapter(session: PtySession): OrchestratorSession {
  return {
    async write(data: string): Promise<void> {
      if (!session.pty) {
        throw new Error('PTY session has no active pty — cannot write');
      }
      session.pty.write(data);
    },

    async signal(sig: string): Promise<void> {
      if (!session.pty) {
        throw new Error('PTY session has no active pty — cannot send signal');
      }
      session.pty.kill(sig);
    },
  };
}

// ============================================================
// attachOrchestrator
// ============================================================

export interface AttachOrchestratorResult {
  /** The orchestrator instance — call run() to start the assess loop */
  orchestrator: OrchestratorPTY;
  /** The ScreenReader feeding screen state to the orchestrator */
  screenReader: ScreenReader;
  /**
   * Stop data flow to the ScreenReader and pause the orchestrator.
   * Does NOT kill the underlying PTY session.
   */
  detach: () => void;
}

/**
 * Attaches an orchestrator to a running PTY session.
 *
 * Creates a ScreenReader (with outputBuffer replay), creates a session adapter,
 * and wires them together in an OrchestratorPTY instance ready to call run() on.
 *
 * The returned detach() function stops data flow and pauses the orchestrator
 * without killing the PTY. Re-attaching is supported by calling attachOrchestrator
 * again on the same session — it will replay the updated outputBuffer.
 */
export function attachOrchestrator(opts: {
  session: PtySession;
  llm: LLMAssessor;
  context: OrchestratorContext;
  rows?: number;
  cols?: number;
}): AttachOrchestratorResult {
  const { session, llm, context, rows, cols } = opts;

  // Track whether we have detached so the forwarding closure can skip writes
  let detached = false;

  // Build the ScreenReader with detach-aware live data forwarding.
  // We inline the attachment here (rather than delegating to createScreenReaderFromSession)
  // so that the onData callback is guarded by the detached flag from the start.
  const guardedReader = new ScreenReader({ rows: rows ?? 24, cols: cols ?? 80 });

  // Replay outputBuffer so the orchestrator starts with current screen state
  if (session.outputBuffer) {
    guardedReader.write(session.outputBuffer);
  }

  // Attach live data feed through a detach guard
  if (session.pty) {
    session.pty.onData((data: string) => {
      if (!detached) {
        guardedReader.write(data);
      }
    });
  }

  // Build the session adapter (write/signal → PTY)
  const sessionAdapter = createSessionAdapter(session);

  // Build the orchestrator
  const orchestrator = new OrchestratorPTY(sessionAdapter, guardedReader, llm, context);

  const detach = (): void => {
    detached = true;
    orchestrator.pause();
  };

  return { orchestrator, screenReader: guardedReader, detach };
}
