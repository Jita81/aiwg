/**
 * Shared interactive-prompt utilities.
 *
 * Every readline-based prompt in the CLI MUST go through these helpers so
 * the CLI can never hang indefinitely on a detached or unresponsive terminal.
 * All helpers apply a hard timeout (default 60s, overridable via
 * AIWG_PROMPT_TIMEOUT_MS) after which the prompt resolves to the supplied
 * fallback and a visible warning is emitted.
 *
 * The underlying setTimeout is `.unref()`'d so a user pressing Ctrl-C mid-prompt
 * does not keep the event loop alive for the remaining wait window.
 *
 * Phase 1 of the CLI Stabilization Epic (#918). Phase 3 (#920) will migrate
 * these helpers to @clack/prompts with AbortSignal support; this file is the
 * interim abstraction that makes both call-site cleanup and that future
 * migration mechanical.
 */

import readline from 'readline';
import * as ui from './ui.js';

/**
 * Resolve the prompt timeout from env. Falsy / non-numeric / non-positive
 * values fall back to 60 seconds.
 */
export function promptTimeoutMs(): number {
  const raw = process.env['AIWG_PROMPT_TIMEOUT_MS'];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

/**
 * Create a readline interface bound to process stdio. Callers must always
 * `rl.close()` when done.
 */
export function createPromptInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a single question with a hard timeout. On timeout, resolves to `fallback`
 * and emits a warn-level UI message describing what default was used.
 *
 * The timeout timer is `.unref()`'d so the event loop can exit cleanly when
 * the caller closes the readline interface (e.g. on Ctrl-C).
 *
 * Do NOT call this from multiple sites on the same readline interface
 * concurrently — each readline interface should own exactly one in-flight
 * prompt at a time.
 */
export function askWithTimeout<T>(
  rl: readline.Interface,
  prompt: string,
  parse: (answer: string) => T,
  fallback: T,
  fallbackLabel: string,
  timeoutMs: number = promptTimeoutMs(),
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ui.warn(`  No input within ${Math.round(timeoutMs / 1000)}s — using default: ${fallbackLabel}`);
      resolve(fallback);
    }, timeoutMs);
    // Ensure the timer does not block the event loop if the readline interface
    // is closed (e.g. user hits Ctrl-C). The callback only fires if the timer
    // is still live and the event loop has other work.
    timer.unref?.();
    rl.question(prompt, (answer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(parse(answer));
    });
  });
}

/**
 * Prompt for a trimmed string with timeout and default.
 */
export async function askString(
  rl: readline.Interface,
  prompt: string,
  fallback = '',
): Promise<string> {
  return askWithTimeout(rl, prompt, (a) => a.trim(), fallback, fallback || '(empty)');
}

/**
 * Prompt for a yes/no answer with timeout and default. Answers starting with
 * 'y' (case-insensitive) are considered yes; everything else is no. On
 * timeout, returns `defaultValue`.
 */
export async function askYesNo(
  rl: readline.Interface,
  question: string,
  defaultValue = false,
): Promise<boolean> {
  return askWithTimeout(
    rl,
    question,
    (a) => a.trim().toLowerCase().startsWith('y'),
    defaultValue,
    defaultValue ? 'yes' : 'no',
  );
}

/**
 * Prompt for a numeric selection from a list. Returns the selected item, or
 * `fallback` on timeout / invalid input. If `fallback` is undefined, returns
 * `options[0]`.
 */
export async function askChoice<T>(
  rl: readline.Interface,
  prompt: string,
  options: T[],
  fallback?: T,
): Promise<T> {
  const pick = fallback ?? options[0]!;
  const label = fallback !== undefined ? String(fallback) : String(pick);
  return askWithTimeout(
    rl,
    prompt,
    (answer) => {
      const idx = parseInt(answer.trim(), 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < options.length) return options[idx]!;
      return pick;
    },
    pick,
    label,
  );
}
