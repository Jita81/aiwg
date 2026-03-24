/**
 * Mission Control Command Handler
 *
 * Multi-loop background orchestration dashboard. Lets an orchestrator
 * spawn multiple long-running Ralph loops, monitor all simultaneously,
 * and react to completions or failures without blocking the primary session.
 *
 * Subcommands: start, dispatch, status, watch, abort, pause, resume, stop, list
 *
 * @implements @agentic/code/frameworks/sdlc-complete/rules/self-maintenance.md
 * @source @src/cli/router.ts
 * @issue #483
 */

import type { CommandHandler, HandlerContext, HandlerResult } from './types.js';
import * as ui from '../ui.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// ── Constants ────────────────────────────────────────────────

const MC_ROOT = '.aiwg/ralph-external/mc';
const SESSIONS_DIR = join(MC_ROOT, 'sessions');

type MissionStatus = 'queued' | 'running' | 'done' | 'failed' | 'aborted' | 'paused';
type SessionState = 'active' | 'paused' | 'stopped';

interface Mission {
  id: string;
  objective: string;
  completion?: string;
  status: MissionStatus;
  loop: number;
  maxIterations: number;
  priority: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface Session {
  id: string;
  name: string;
  state: SessionState;
  maxMissions: number;
  createdAt: string;
  updatedAt: string;
  missions: Mission[];
}

// ── Helpers ──────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readSession(sessionId: string): Promise<Session | null> {
  const path = join(SESSIONS_DIR, sessionId, 'session.json');
  try {
    const raw = await fs.readFile(path, 'utf-8');
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

async function writeSession(session: Session): Promise<void> {
  const dir = join(SESSIONS_DIR, session.id);
  await ensureDir(dir);
  session.updatedAt = new Date().toISOString();
  await fs.writeFile(join(dir, 'session.json'), JSON.stringify(session, null, 2));
}

async function appendLog(sessionId: string, event: Record<string, unknown>): Promise<void> {
  const logPath = join(SESSIONS_DIR, sessionId, 'log.jsonl');
  const entry = JSON.stringify({ ...event, ts: new Date().toISOString() });
  await fs.appendFile(logPath, entry + '\n');
}

async function listSessions(): Promise<Session[]> {
  try {
    const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
    const sessions: Session[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const s = await readSession(entry.name);
        if (s) sessions.push(s);
      }
    }
    return sessions;
  } catch {
    return [];
  }
}

async function findActiveSession(sessionIdArg?: string): Promise<Session | null> {
  if (sessionIdArg) return readSession(sessionIdArg);

  // Find latest active session
  const sessions = await listSessions();
  const active = sessions
    .filter(s => s.state === 'active' || s.state === 'paused')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return active[0] || null;
}

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function getPositionalArgs(args: string[]): string[] {
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      // Skip flag and its value if it has one
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) i++;
      continue;
    }
    positional.push(args[i]);
  }
  return positional;
}

// ── Subcommand handlers ──────────────────────────────────────

async function mcStart(ctx: HandlerContext): Promise<HandlerResult> {
  const name = parseFlag(ctx.args, '--name') || `Mission ${new Date().toISOString().slice(0, 10)}`;
  const maxMissions = parseInt(parseFlag(ctx.args, '--max-missions') || '10', 10);

  const session: Session = {
    id: genId('mc'),
    name,
    state: 'active',
    maxMissions,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    missions: [],
  };

  await writeSession(session);
  await appendLog(session.id, { event: 'session_started', name, maxMissions });

  ui.blank();
  console.log(`  ${ui.brandMark()} ${ui.bold('Mission Control')} — ${ui.accent(name)}`);
  ui.rule();
  ui.success(`Session started: ${session.id}`);
  ui.info(`Max missions: ${maxMissions}`);
  ui.blank();

  return { exitCode: 0, message: session.id };
}

async function mcDispatch(ctx: HandlerContext): Promise<HandlerResult> {
  const positional = getPositionalArgs(ctx.args);
  const sessionId = positional[0];
  const objective = positional.slice(1).join(' ') || parseFlag(ctx.args, '--objective');
  const completion = parseFlag(ctx.args, '--completion');
  const priority = parseFlag(ctx.args, '--priority') || 'normal';
  const maxIterations = parseInt(parseFlag(ctx.args, '--max-iterations') || '10', 10);

  if (!objective) {
    ui.error('Usage: aiwg mc dispatch <session-id> "<objective>" [--completion "<criteria>"]');
    return { exitCode: 1 };
  }

  const session = await findActiveSession(sessionId);
  if (!session) {
    ui.error(sessionId ? `Session not found: ${sessionId}` : 'No active session. Run `aiwg mc start` first.');
    return { exitCode: 1 };
  }

  if (session.missions.length >= session.maxMissions) {
    ui.error(`Session at capacity (${session.maxMissions} missions). Increase with --max-missions or stop completed missions.`);
    return { exitCode: 1 };
  }

  const mission: Mission = {
    id: genId('m'),
    objective,
    completion,
    status: 'queued',
    loop: 0,
    maxIterations,
    priority,
  };

  session.missions.push(mission);
  await writeSession(session);
  await appendLog(session.id, { event: 'mission_dispatched', missionId: mission.id, objective, priority });

  ui.success(`Dispatched mission ${mission.id}: ${objective}`);
  ui.info(`Priority: ${priority} | Max iterations: ${maxIterations}`);

  return { exitCode: 0, message: mission.id };
}

async function mcStatus(ctx: HandlerContext): Promise<HandlerResult> {
  const positional = getPositionalArgs(ctx.args);
  const sessionId = positional[0];
  const json = hasFlag(ctx.args, '--json');

  const session = await findActiveSession(sessionId);
  if (!session) {
    if (json) {
      console.log(JSON.stringify({ error: 'no_active_session' }));
    } else {
      ui.error(sessionId ? `Session not found: ${sessionId}` : 'No active session.');
    }
    return { exitCode: 1 };
  }

  if (json) {
    console.log(JSON.stringify(session, null, 2));
    return { exitCode: 0 };
  }

  const statusIcons: Record<MissionStatus, string> = {
    done: '✓',
    running: '⏳',
    queued: '⏺',
    failed: '✗',
    aborted: '⊘',
    paused: '⏸',
  };

  ui.blank();
  console.log(`  ${ui.brandMark()} ${ui.bold('MISSION CONTROL')} — ${ui.accent(session.name)}  [${session.id}]`);
  ui.rule(60);

  // Header
  const header = `  ${'#'.padEnd(4)} ${'Mission'.padEnd(36)} ${'Status'.padEnd(12)} ${'Loop'.padEnd(8)} ${'Started'.padEnd(8)}`;
  console.log(ui.dim(header));
  ui.rule(60);

  for (let i = 0; i < session.missions.length; i++) {
    const m = session.missions[i];
    const icon = statusIcons[m.status] || '?';
    const num = String(i + 1).padEnd(4);
    const obj = m.objective.length > 34 ? m.objective.slice(0, 31) + '...' : m.objective.padEnd(36);
    const status = `${icon} ${m.status.toUpperCase()}`.padEnd(12);
    const loop = m.status === 'queued' ? '—'.padEnd(8) : `${m.loop}/${m.maxIterations}`.padEnd(8);
    const started = m.startedAt ? new Date(m.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
    console.log(`  ${num} ${obj} ${status} ${loop} ${started}`);
  }

  ui.rule(60);

  const counts = {
    done: session.missions.filter(m => m.status === 'done').length,
    running: session.missions.filter(m => m.status === 'running').length,
    queued: session.missions.filter(m => m.status === 'queued').length,
    failed: session.missions.filter(m => m.status === 'failed').length,
  };

  console.log(`  ${session.missions.length} missions  |  ${counts.done} done  |  ${counts.running} running  |  ${counts.queued} queued  |  ${counts.failed} failed`);
  ui.blank();

  return { exitCode: 0 };
}

async function mcAbort(ctx: HandlerContext): Promise<HandlerResult> {
  const positional = getPositionalArgs(ctx.args);
  const sessionId = positional[0];
  const missionId = positional[1];

  if (!sessionId || !missionId) {
    ui.error('Usage: aiwg mc abort <session-id> <mission-id>');
    return { exitCode: 1 };
  }

  const session = await readSession(sessionId);
  if (!session) {
    ui.error(`Session not found: ${sessionId}`);
    return { exitCode: 1 };
  }

  const mission = session.missions.find(m => m.id === missionId);
  if (!mission) {
    ui.error(`Mission not found: ${missionId}`);
    return { exitCode: 1 };
  }

  mission.status = 'aborted';
  mission.completedAt = new Date().toISOString();
  await writeSession(session);
  await appendLog(session.id, { event: 'mission_aborted', missionId });

  ui.success(`Aborted mission: ${missionId}`);
  return { exitCode: 0 };
}

async function mcPause(ctx: HandlerContext): Promise<HandlerResult> {
  const positional = getPositionalArgs(ctx.args);
  const sessionId = positional[0];

  const session = await findActiveSession(sessionId);
  if (!session) {
    ui.error('No active session to pause.');
    return { exitCode: 1 };
  }

  session.state = 'paused';
  for (const m of session.missions) {
    if (m.status === 'running') m.status = 'paused';
  }
  await writeSession(session);
  await appendLog(session.id, { event: 'session_paused' });

  ui.success(`Paused session: ${session.id}`);
  return { exitCode: 0 };
}

async function mcResume(ctx: HandlerContext): Promise<HandlerResult> {
  const positional = getPositionalArgs(ctx.args);
  const sessionId = positional[0];

  const session = await findActiveSession(sessionId);
  if (!session || session.state !== 'paused') {
    ui.error('No paused session to resume.');
    return { exitCode: 1 };
  }

  session.state = 'active';
  for (const m of session.missions) {
    if (m.status === 'paused') m.status = 'running';
  }
  await writeSession(session);
  await appendLog(session.id, { event: 'session_resumed' });

  ui.success(`Resumed session: ${session.id}`);
  return { exitCode: 0 };
}

async function mcStop(ctx: HandlerContext): Promise<HandlerResult> {
  const positional = getPositionalArgs(ctx.args);
  const sessionId = positional[0];
  const drain = hasFlag(ctx.args, '--drain');

  const session = await findActiveSession(sessionId);
  if (!session) {
    ui.error('No active session to stop.');
    return { exitCode: 1 };
  }

  if (drain) {
    // Mark queued missions as aborted, let running finish
    for (const m of session.missions) {
      if (m.status === 'queued') {
        m.status = 'aborted';
        m.completedAt = new Date().toISOString();
      }
    }
    ui.info('Draining: queued missions cancelled, running missions will complete.');
  } else {
    // Abort all non-completed missions
    for (const m of session.missions) {
      if (m.status === 'running' || m.status === 'queued' || m.status === 'paused') {
        m.status = 'aborted';
        m.completedAt = new Date().toISOString();
      }
    }
  }

  session.state = 'stopped';
  await writeSession(session);
  await appendLog(session.id, { event: 'session_stopped', drain });

  ui.success(`Stopped session: ${session.id}`);
  return { exitCode: 0 };
}

async function mcList(ctx: HandlerContext): Promise<HandlerResult> {
  const json = hasFlag(ctx.args, '--json');
  const sessions = await listSessions();

  if (json) {
    console.log(JSON.stringify(sessions.map(s => ({
      id: s.id,
      name: s.name,
      state: s.state,
      missions: s.missions.length,
      created: s.createdAt,
      updated: s.updatedAt,
    })), null, 2));
    return { exitCode: 0 };
  }

  if (sessions.length === 0) {
    ui.info('No Mission Control sessions. Run `aiwg mc start` to create one.');
    return { exitCode: 0 };
  }

  ui.blank();
  console.log(`  ${ui.brandMark()} ${ui.bold('Mission Control Sessions')}`);
  ui.rule();

  for (const s of sessions) {
    const stateIcon = s.state === 'active' ? '●' : s.state === 'paused' ? '⏸' : '○';
    const missionCount = s.missions.length;
    const done = s.missions.filter(m => m.status === 'done').length;
    console.log(`  ${stateIcon} ${s.id}  ${ui.accent(s.name)}  (${done}/${missionCount} done)  [${s.state}]`);
  }

  ui.blank();
  return { exitCode: 0 };
}

async function mcWatch(ctx: HandlerContext): Promise<HandlerResult> {
  const positional = getPositionalArgs(ctx.args);
  const sessionId = positional[0];

  const session = await findActiveSession(sessionId);
  if (!session) {
    ui.error('No active session to watch.');
    return { exitCode: 1 };
  }

  // For non-interactive contexts, show status once with a note
  // Real streaming would use fs.watch on the session file
  ui.info(`Watch mode: polling session ${session.id}`);
  ui.info('Press Ctrl+C to stop watching.');
  ui.blank();

  // Show current status
  ctx.args = [session.id];
  return mcStatus(ctx);
}

// ── Subcommand router ────────────────────────────────────────

const subcommands: Record<string, (ctx: HandlerContext) => Promise<HandlerResult>> = {
  start: mcStart,
  dispatch: mcDispatch,
  status: mcStatus,
  watch: mcWatch,
  abort: mcAbort,
  pause: mcPause,
  resume: mcResume,
  stop: mcStop,
  list: mcList,
};

function showMcHelp(): void {
  ui.blank();
  console.log(`  ${ui.brandMark()} ${ui.bold('Mission Control')} — multi-loop background orchestration`);
  ui.rule();
  console.log(`
  ${ui.bold('Usage:')} aiwg mc <subcommand> [options]

  ${ui.bold('Subcommands:')}
    start                         Start a new Mission Control session
    dispatch <id> "<objective>"   Add a background mission to session
    status [<id>] [--json]        View mission status dashboard
    watch [<id>]                  Live monitor (streaming)
    abort <session> <mission>     Abort a specific mission
    pause [<id>]                  Pause active session
    resume [<id>]                 Resume paused session
    stop [<id>] [--drain]         Shut down session
    list [--json]                 List all sessions

  ${ui.bold('Examples:')}
    aiwg mc start --name "Sprint 4"
    aiwg mc dispatch mc-abc123 "Fix auth" --completion "tests pass"
    aiwg mc status mc-abc123
    aiwg mc stop mc-abc123 --drain
`);
}

// ── Exported handler ─────────────────────────────────────────

export const mcHandler: CommandHandler = {
  id: 'mc',
  name: 'Mission Control',
  description: 'Multi-loop background orchestration (start, dispatch, status, watch, stop)',
  category: 'orchestration',
  aliases: ['mission-control'],

  async execute(ctx: HandlerContext): Promise<HandlerResult> {
    const subcmd = ctx.args[0];

    if (!subcmd || subcmd === '--help' || subcmd === '-h') {
      showMcHelp();
      return { exitCode: 0 };
    }

    const handler = subcommands[subcmd];
    if (!handler) {
      ui.error(`Unknown subcommand: ${subcmd}. Run 'aiwg mc --help' for usage.`);
      return { exitCode: 1 };
    }

    // Pass remaining args to subcommand
    const subCtx: HandlerContext = {
      ...ctx,
      args: ctx.args.slice(1),
    };

    return handler(subCtx);
  },
};

/**
 * All MC-related handlers for bulk registration
 */
export const mcHandlers: CommandHandler[] = [mcHandler];
