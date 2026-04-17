/**
 * ScreenReader Tests
 *
 * Tests for the PTY screen-reader that parses raw PTY byte streams
 * into structured, LLM-readable screen state.
 *
 * Requires @xterm/headless (devDependency).
 *
 * @issue #754
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScreenReader } from '../../../src/serve/screen-reader.js';

// ============================================================
// Helpers
// ============================================================

/** Give xterm's async write a tick to process. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

// ============================================================
// ScreenReader
// ============================================================

describe('ScreenReader', () => {
  let reader: ScreenReader;

  beforeEach(() => {
    reader = new ScreenReader({ rows: 24, cols: 80 });
  });

  // -------------------------------------------------------
  // 1. Plain text
  // -------------------------------------------------------
  it('writes plain text and makes it visible in the text grid', async () => {
    reader.write('Hello World\r\n');
    await tick();
    const state = reader.getState();
    // At least one row should contain "Hello World"
    const allRows = state.text.map((r) => r.join('')).join('\n');
    expect(allRows).toContain('Hello World');
  });

  // -------------------------------------------------------
  // 2. ANSI stripping
  // -------------------------------------------------------
  it('strips ANSI escape codes from the summary', async () => {
    reader.write('\x1b[31mRed Text\x1b[0m\r\n');
    await tick();
    const summary = reader.getSummary();
    expect(summary).toContain('Red Text');
    // Raw escape sequences must not appear in the summary
    expect(summary).not.toContain('\x1b[');
    expect(summary).not.toContain('\x1b');
  });

  // -------------------------------------------------------
  // 3. Cursor tracking
  // -------------------------------------------------------
  it('updates cursor position after writing text', async () => {
    reader.write('ABC');
    await tick();
    const state = reader.getState();
    // cursor should have advanced at least to col 3
    expect(state.cursor.col).toBeGreaterThanOrEqual(3);
    expect(state.cursor.row).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------
  // 4. Prompt detection – bash-style
  // -------------------------------------------------------
  it('detects a bash-style prompt', async () => {
    reader.write('user@host:~$ ');
    await tick();
    const state = reader.getState();
    expect(state.prompt_detected).toBe(true);
    expect(state.prompt_text).toBeTruthy();
  });

  // -------------------------------------------------------
  // 5. Prompt detection – interactive (inquirer)
  // -------------------------------------------------------
  it('detects an interactive inquirer-style prompt', async () => {
    reader.write('? Select an option: ');
    await tick();
    const state = reader.getState();
    expect(state.prompt_detected).toBe(true);
  });

  // -------------------------------------------------------
  // 6. Prompt detection – not a prompt
  // -------------------------------------------------------
  it('does not flag regular output as a prompt', async () => {
    reader.write('Building project...\r\n');
    await tick();
    const state = reader.getState();
    expect(state.prompt_detected).toBe(false);
  });

  // -------------------------------------------------------
  // 7. awaitChange timeout – no new data
  // -------------------------------------------------------
  it('awaitChange resolves with current state after timeout if no data arrives', async () => {
    reader.write('initial\r\n');
    await tick();

    const start = Date.now();
    const state = await reader.awaitChange({ timeout: 100 });
    const elapsed = Date.now() - start;

    // Should resolve within ~200ms window (100ms timeout + slack)
    expect(elapsed).toBeLessThan(500);
    // Should return a valid ScreenState
    expect(state).toHaveProperty('text');
    expect(state).toHaveProperty('cursor');
    expect(state).toHaveProperty('prompt_detected');
  });

  // -------------------------------------------------------
  // 8. awaitChange – resolves on new data
  // -------------------------------------------------------
  it('awaitChange resolves quickly when new data is written', async () => {
    reader.write('line one\r\n');
    await tick();

    const changePromise = reader.awaitChange({ timeout: 3000 });

    // Write new data shortly after starting the await
    await tick();
    reader.write('line two\r\n');

    const state = await changePromise;
    const allText = state.text.map((r) => r.join('')).join('\n');
    expect(allText).toContain('line two');
  });

  // -------------------------------------------------------
  // 9. Multiple lines and scrollback
  // -------------------------------------------------------
  it('fills scrollback when more lines are written than the viewport', async () => {
    // Write more lines than the 24-row viewport
    for (let i = 1; i <= 30; i++) {
      reader.write(`Line ${i}\r\n`);
    }
    await reader.flush();
    const state = reader.getState();
    // After 30 lines written into a 24-row terminal, scrollback should exist
    expect(state.scrollback.length).toBeGreaterThan(0);
    // The visible text should contain recent lines
    const visible = state.text.map((r) => r.join('')).join('\n');
    expect(visible).toContain('Line 30');
  });

  // -------------------------------------------------------
  // 10. getSummary returns clean readable text
  // -------------------------------------------------------
  it('getSummary returns a trimmed, human-readable string', async () => {
    reader.write('Summary test line\r\n');
    await tick();
    const summary = reader.getSummary();
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain('Summary test line');
    // Should not end with trailing whitespace-only lines
    expect(summary.trimEnd()).toBe(summary.trim());
  });

  // -------------------------------------------------------
  // 11. dispose – does not throw
  // -------------------------------------------------------
  it('dispose cleans up without throwing', () => {
    reader.write('some text');
    expect(() => reader.dispose()).not.toThrow();
  });

  // -------------------------------------------------------
  // 12. getState returns a valid ScreenState shape
  // -------------------------------------------------------
  it('getState returns the correct ScreenState shape', async () => {
    reader.write('shape test\r\n');
    await tick();
    const state = reader.getState();
    expect(Array.isArray(state.text)).toBe(true);
    expect(Array.isArray(state.scrollback)).toBe(true);
    expect(typeof state.cursor.row).toBe('number');
    expect(typeof state.cursor.col).toBe('number');
    expect(typeof state.summary).toBe('string');
    expect(typeof state.prompt_detected).toBe('boolean');
  });

  // -------------------------------------------------------
  // 13. [y/N]-style prompt detection
  // -------------------------------------------------------
  it('detects [y/N] confirmation prompt', async () => {
    reader.write('Delete file? [y/N] ');
    await tick();
    const state = reader.getState();
    expect(state.prompt_detected).toBe(true);
  });

  // -------------------------------------------------------
  // 14. # prompt (root shell)
  // -------------------------------------------------------
  it('detects root shell prompt ending with # ', async () => {
    reader.write('root@server:~# ');
    await tick();
    const state = reader.getState();
    expect(state.prompt_detected).toBe(true);
  });
});
