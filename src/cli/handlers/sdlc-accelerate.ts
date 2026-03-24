/**
 * SDLC Accelerate Handler
 *
 * Launches the SDLC Accelerate pipeline — taking a project from idea (or existing
 * codebase) to construction-ready by orchestrating intake → inception → elaboration
 * → construction prep via the sdlc-accelerate Claude skill.
 *
 * Invokes `claude` with the user's description so the skill can run interactively.
 * When `--provider` is set (non-claude), prints guidance to use the native toolset.
 *
 * @implements @.aiwg/architecture/decisions/ADR-001-unified-extension-system.md
 * @issue #485
 */

import { spawn } from 'child_process';
import { CommandHandler, HandlerContext, HandlerResult } from './types.js';

/**
 * SDLC Accelerate Handler
 *
 * Primary CTA after `aiwg use sdlc`. Launches the end-to-end SDLC pipeline.
 */
export class SdlcAccelerateHandler implements CommandHandler {
  id = 'sdlc-accelerate';
  name = 'SDLC Accelerate';
  description = 'End-to-end SDLC ramp-up from idea to construction-ready';
  category = 'orchestration' as const;
  aliases = ['sdlc-accelerate'];

  async execute(ctx: HandlerContext): Promise<HandlerResult> {
    const args = ctx.args;

    if (args.includes('--help') || args.includes('-h')) {
      return {
        exitCode: 0,
        message: this.getHelpText(),
      };
    }

    // Build the Claude message that will trigger the sdlc-accelerate skill
    const positional = args.filter(a => !a.startsWith('-')).join(' ');
    const flags = args.filter(a => a.startsWith('-')).join(' ');
    const prompt = positional
      ? `/sdlc-accelerate ${positional}${flags ? ' ' + flags : ''}`
      : `/sdlc-accelerate${flags ? ' ' + flags : ''}`;

    // Spawn claude interactively — the skill takes over from here
    return new Promise<HandlerResult>((resolve) => {
      try {
        const child = spawn('claude', [prompt], {
          stdio: 'inherit',
          env: process.env,
        });

        child.on('close', (code) => {
          resolve({ exitCode: code ?? 0 });
        });

        child.on('error', (err) => {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            resolve({
              exitCode: 1,
              message: this.getManualInstructions(prompt),
            });
          } else {
            resolve({
              exitCode: 1,
              message: `Failed to launch Claude: ${err.message}\n\n${this.getManualInstructions(prompt)}`,
              error: err,
            });
          }
        });
      } catch (err) {
        resolve({
          exitCode: 1,
          message: `Failed to start SDLC pipeline: ${err instanceof Error ? err.message : String(err)}\n\n${this.getManualInstructions(prompt)}`,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    });
  }

  private getManualInstructions(prompt: string): string {
    return `To run the SDLC pipeline manually, open Claude Code and run:\n  ${prompt}`;
  }

  private getHelpText(): string {
    return `
SDLC Accelerate — End-to-end SDLC ramp-up

USAGE:
  aiwg sdlc-accelerate "<description>" [options]
  aiwg sdlc-accelerate --from-codebase <path> [options]
  aiwg sdlc-accelerate --resume

ARGUMENTS:
  <description>           Project description (idea entry)

OPTIONS:
  --from-codebase <path>  Scan existing codebase instead of starting from idea
  --interactive           Full interactive mode at every step
  --guidance "text"       Project-level guidance for all phases
  --auto                  Auto-proceed on CONDITIONAL gates
  --dry-run               Show pipeline plan without executing
  --skip-to <phase>       Jump to phase: inception, elaboration, construction
  --resume                Resume from detected current phase

PIPELINE:
  Intake → LOM Gate → Elaboration → ABM Gate → Construction Prep → Brief

EXAMPLES:
  aiwg sdlc-accelerate "Customer portal with real-time chat"
  aiwg sdlc-accelerate --from-codebase ./src "E-commerce platform"
  aiwg sdlc-accelerate --resume
  aiwg sdlc-accelerate --dry-run "Mobile banking app"

This command launches Claude Code with the sdlc-accelerate skill.
In Claude Code you can also run: /sdlc-accelerate "<description>"
`;
  }
}

/**
 * Export handler instance
 */
export const sdlcAccelerateHandler = new SdlcAccelerateHandler();
