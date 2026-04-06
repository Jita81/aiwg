/**
 * OrchestratorPTY — Assess loop for Orchestrator-over-PTY
 *
 * Drives a PTY session via an LLM assessor using a read→assess→plan→act→wait
 * loop. The LLM observes the current screen state and decides whether to type,
 * wait, send a signal, or declare the mission complete.
 *
 * The LLMAssessor interface is generic — no Anthropic SDK is imported here —
 * which keeps this class fully testable with mock assessors.
 *
 * @issue #755
 * @see src/serve/screen-reader.ts — ScreenReader / ScreenState
 * @see src/serve/pty-bridge.ts    — PtyLike and session interfaces
 */

import type { ScreenReader } from './screen-reader.js';

// ============================================================
// Public types
// ============================================================

export interface OrchestratorAction {
  action: 'type' | 'wait' | 'signal' | 'complete';
  text?: string;
  signal?: string;
  reasoning: string;
}

export interface OrchestratorContext {
  /** What the orchestrator is trying to accomplish */
  mission: string;
  /** Seed actions (usually empty; advanced use-cases may pre-populate) */
  recentActions: OrchestratorAction[];
  /** Hard cap on loop iterations. Default: 100 */
  maxCycles?: number;
}

/** Minimal session interface for writing to PTY */
export interface OrchestratorSession {
  write(data: string): Promise<void>;
  signal(sig: string): Promise<void>;
}

/** Minimal LLM client interface for the assess step */
export interface LLMAssessor {
  assess(input: {
    screen_state: string;
    prompt_detected: boolean;
    prompt_text?: string;
    context: OrchestratorContext;
    history: OrchestratorAction[];
  }): Promise<OrchestratorAction>;
}

// ============================================================
// OrchestratorPTY
// ============================================================

const DEFAULT_MAX_CYCLES = 100;
const HISTORY_WINDOW = 10;
const AWAIT_CHANGE_TIMEOUT_MS = 5000;

export class OrchestratorPTY {
  private readonly session: OrchestratorSession;
  private readonly screenReader: ScreenReader;
  private readonly llm: LLMAssessor;
  private readonly context: OrchestratorContext;
  private readonly maxCycles: number;

  private _history: OrchestratorAction[] = [];
  private _done = false;
  private _paused = false;

  constructor(
    session: OrchestratorSession,
    screenReader: ScreenReader,
    llm: LLMAssessor,
    context: OrchestratorContext,
  ) {
    this.session = session;
    this.screenReader = screenReader;
    this.llm = llm;
    this.context = context;
    this.maxCycles = context.maxCycles ?? DEFAULT_MAX_CYCLES;

    // Seed history from context (advanced use-case; does not count against window)
    if (context.recentActions.length > 0) {
      this._history.push(...context.recentActions);
    }
  }

  // ----------------------------------------------------------
  // Main loop
  // ----------------------------------------------------------

  /**
   * Run the assess loop until:
   *   - the LLM returns `complete`
   *   - `maxCycles` iterations are exhausted
   *   - `pause()` is called
   */
  async run(): Promise<void> {
    let cycleCount = 0;

    while (!this._done && !this._paused && cycleCount < this.maxCycles) {
      // ---- read ----
      const screen = await this.screenReader.awaitChange({
        timeout: AWAIT_CHANGE_TIMEOUT_MS,
      });

      // Check pause again after the potentially long await
      if (this._paused) break;

      // ---- assess ----
      const decision = await this.llm.assess({
        screen_state: screen.summary,
        prompt_detected: screen.prompt_detected,
        prompt_text: screen.prompt_text,
        context: this.context,
        history: this._history.slice(-HISTORY_WINDOW),
      });

      // ---- act ----
      await this._execute(decision);

      cycleCount++;
    }

    // Auto-complete on cycle exhaustion
    if (!this._done && !this._paused && cycleCount >= this.maxCycles) {
      const capAction: OrchestratorAction = {
        action: 'complete',
        reasoning: 'Max cycles reached',
      };
      this._history.push(capAction);
      this._done = true;
    }
  }

  // ----------------------------------------------------------
  // Pause / resume
  // ----------------------------------------------------------

  /** Pause the loop at the next iteration boundary. */
  pause(): void {
    this._paused = true;
  }

  /**
   * Clear the pause flag and re-enter the assess loop.
   * Resolves when the loop exits again (complete or paused again).
   */
  async resume(): Promise<void> {
    this._paused = false;
    await this.run();
  }

  // ----------------------------------------------------------
  // Accessors
  // ----------------------------------------------------------

  /** Returns a copy of the full action history. */
  getHistory(): OrchestratorAction[] {
    return [...this._history];
  }

  /** Whether the orchestrator has reached a terminal `complete` state. */
  get done(): boolean {
    return this._done;
  }

  /** Whether the orchestrator is currently paused. */
  get paused(): boolean {
    return this._paused;
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  private async _execute(action: OrchestratorAction): Promise<void> {
    this._history.push(action);

    switch (action.action) {
      case 'type':
        await this.session.write((action.text ?? '') + '\n');
        break;

      case 'wait':
        // No-op — loop will call awaitChange again next iteration
        break;

      case 'signal':
        await this.session.signal(action.signal ?? '');
        break;

      case 'complete':
        this._done = true;
        break;
    }
  }
}
