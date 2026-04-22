/**
 * Sandbox Command Handler
 *
 * Thin CLI wrappers over aiwg serve sandbox REST endpoints.
 *
 * Subcommands:
 *   alias <sandbox-id> <agent-id> <name>   Assign a logical name to an agent (#917)
 *   resolve <ref>                          Resolve an agent by name/instanceId/agentId
 *   identities [--json]                    List all known agent identities
 *
 * @issue #917
 */

import type { CommandHandler, HandlerContext, HandlerResult } from './types.js';
import * as ui from '../ui.js';

function getServeBase(): string {
  const port = process.env['AIWG_SERVE_PORT'] ?? '7337';
  return `http://127.0.0.1:${port}`;
}

/**
 * Default timeout for CLI → local aiwg serve REST calls. A wedged serve must
 * not hang the CLI indefinitely. Overridable via AIWG_FETCH_TIMEOUT_MS for
 * slow local environments or integration tests.
 */
function fetchTimeoutMs(): number {
  const raw = process.env['AIWG_FETCH_TIMEOUT_MS'];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5_000;
}

/**
 * Format a single-line error message distinguishing fetch timeout from
 * other unreachable-serve conditions. Timeouts produced by
 * AbortSignal.timeout() surface as DOMException with `name === 'TimeoutError'`
 * under Node 20+.
 */
function reachabilityMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError') {
    return `aiwg serve timed out after ${fetchTimeoutMs()}ms. Is it wedged? Try: curl ${getServeBase()}/api/health`;
  }
  return `Cannot reach aiwg serve. Start it with: aiwg serve`;
}

/**
 * Combine the handler's user-cancel signal (Ctrl-C) with a per-call
 * timeout so fetches abort on either. Node 20+ `AbortSignal.any` is
 * required; handlers without `ctx.signal` (older test fixtures) fall
 * back to the timeout alone.
 */
function combineSignal(ctxSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!ctxSignal) return timeoutSignal;
  return AbortSignal.any([ctxSignal, timeoutSignal]);
}

async function sandboxAlias(ctx: HandlerContext): Promise<HandlerResult> {
  const [sandboxId, agentId, ...nameParts] = ctx.args;
  const name = nameParts.join(' ');

  if (!sandboxId || !agentId || !name) {
    ui.error('Usage: aiwg sandbox alias <sandbox-id> <agent-id> <name>');
    ui.info('Example: aiwg sandbox alias sb-abc123 agent-01 security-01');
    return { exitCode: 1 };
  }

  const base = getServeBase();
  try {
    const resp = await fetch(`${base}/api/sandboxes/${encodeURIComponent(sandboxId)}/agents/${encodeURIComponent(agentId)}/alias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: combineSignal(ctx.signal, fetchTimeoutMs()),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ error: resp.statusText })) as { error?: string };
      ui.error(`alias failed (${resp.status}): ${body.error ?? resp.statusText}`);
      return { exitCode: 1 };
    }
    const result = await resp.json() as { ok: boolean; logicalName: string };
    ui.success(`Agent ${agentId} aliased as "${result.logicalName}"`);
    return { exitCode: 0 };
  } catch (err) {
    ui.error(reachabilityMessage(err));
    return { exitCode: 1 };
  }
}

async function sandboxResolve(ctx: HandlerContext): Promise<HandlerResult> {
  const ref = ctx.args[0];
  if (!ref) {
    ui.error('Usage: aiwg sandbox resolve <name-or-instanceId-or-agentId>');
    return { exitCode: 1 };
  }

  const base = getServeBase();
  try {
    const resp = await fetch(`${base}/api/agents/resolve/${encodeURIComponent(ref)}`, {
      signal: combineSignal(ctx.signal, fetchTimeoutMs()),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ error: resp.statusText })) as { error?: string };
      ui.error(`resolve failed (${resp.status}): ${body.error ?? resp.statusText}`);
      return { exitCode: 1 };
    }
    const result = await resp.json() as { sandboxId: string; sandboxName: string; agent: Record<string, unknown> };
    const agent = result.agent;
    console.log(`sandbox:    ${result.sandboxName} (${result.sandboxId})`);
    console.log(`agentId:    ${agent['agentId'] ?? '?'}`);
    console.log(`instanceId: ${agent['instanceId'] ?? '(none)'}`);
    console.log(`name:       ${agent['logicalName'] ?? '(none)'}`);
    console.log(`status:     ${agent['status'] ?? '?'}`);
    return { exitCode: 0 };
  } catch (err) {
    ui.error(reachabilityMessage(err));
    return { exitCode: 1 };
  }
}

async function sandboxIdentities(ctx: HandlerContext): Promise<HandlerResult> {
  const json = ctx.args.includes('--json');
  const base = getServeBase();
  try {
    const resp = await fetch(`${base}/api/agents/identities`, {
      signal: combineSignal(ctx.signal, fetchTimeoutMs()),
    });
    if (!resp.ok) {
      ui.error(`identities failed (${resp.status}): ${resp.statusText}`);
      return { exitCode: 1 };
    }
    const result = await resp.json() as { identities: Record<string, unknown>[] };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return { exitCode: 0 };
    }
    if (!result.identities.length) {
      ui.info('No agent identities recorded yet.');
      return { exitCode: 0 };
    }
    ui.blank();
    console.log(`  ${ui.brandMark()} ${ui.bold('Agent Identities')}`);
    ui.rule();
    for (const id of result.identities) {
      const name = id['logicalName'] as string | undefined;
      const instanceId = id['instanceId'] as string;
      const lastSeen = id['lastSeenAt'] as string;
      console.log(`  • ${ui.bold(name ?? instanceId)}`);
      if (name) console.log(`      instanceId: ${instanceId}`);
      console.log(`      lastSeen:   ${lastSeen}`);
    }
    ui.blank();
    return { exitCode: 0 };
  } catch (err) {
    ui.error(reachabilityMessage(err));
    return { exitCode: 1 };
  }
}

const subcommands: Record<string, (ctx: HandlerContext) => Promise<HandlerResult>> = {
  alias: sandboxAlias,
  resolve: sandboxResolve,
  identities: sandboxIdentities,
};

function showSandboxHelp(): void {
  ui.blank();
  console.log(`  ${ui.brandMark()} ${ui.bold('Sandbox')} — CLI access to sandbox agent management`);
  ui.rule();
  console.log(`
  ${ui.bold('Usage:')} aiwg sandbox <subcommand> [options]

  ${ui.bold('Subcommands:')}
    alias <sb> <agent> <name>   Assign a stable logical name to an agent (#917)
    resolve <ref>               Resolve agent by name / instanceId / agentId
    identities [--json]         List all known persistent agent identities

  ${ui.bold('Examples:')}
    aiwg sandbox alias sb-abc123 agent-01 security-01
    aiwg sandbox resolve security-01
    aiwg sandbox identities
`);
}

export const sandboxHandler: CommandHandler = {
  id: 'sandbox',
  name: 'Sandbox',
  description: 'Sandbox agent management (alias, resolve, identities)',
  category: 'sandbox',
  aliases: [],

  async execute(ctx: HandlerContext): Promise<HandlerResult> {
    const subcmd = ctx.args[0];
    if (!subcmd || subcmd === '--help' || subcmd === '-h') {
      showSandboxHelp();
      return { exitCode: 0 };
    }

    const handler = subcommands[subcmd];
    if (!handler) {
      ui.error(`Unknown subcommand: ${subcmd}. Run 'aiwg sandbox --help' for usage.`);
      return { exitCode: 1 };
    }

    return handler({ ...ctx, args: ctx.args.slice(1) });
  },
};

export const sandboxHandlers: CommandHandler[] = [sandboxHandler];
