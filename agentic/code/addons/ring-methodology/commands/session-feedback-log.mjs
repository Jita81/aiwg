/**
 * session-feedback-log.mjs — SessionEnd hook
 *
 * Logs reflection data at session end:
 * - Computes session spectral gap
 * - Records morpholepsis signals observed
 * - Summarizes kernel growth
 * - Appends to .aiwg/working/ring/perinoesis.jsonl
 * - Carries unresolved KENOPHORIA state into next session
 *
 * @implements #479
 */

import { readFile, appendFile, mkdir } from 'fs/promises';
import { join } from 'path';

const RING_DIR = '.aiwg/working/ring';

async function readJsonl(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content.trim().split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function readJson(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export default async function sessionFeedbackLog(args, ctx) {
  const ringDir = join(ctx.cwd, RING_DIR);
  const features = await readJsonl(join(ringDir, 'features.jsonl'));
  const kernels = await readJsonl(join(ringDir, 'kernels.jsonl'));
  const sessionState = await readJson(join(ringDir, 'session-state.json'));

  if (features.length === 0) {
    console.log('Session feedback: No features tracked this session. Nothing to log.');
    return { exitCode: 0 };
  }

  // Compute spectral gap
  const total = features.length;
  const cFirst = features.filter(f => f.layer_c_first === true).length;
  const spectralGap = total > 0 ? cFirst / total : 1.0;

  // Collect morpholepsis signals
  const signalCounts = {};
  for (const f of features) {
    for (const sig of (f.morpholepsis_signals || [])) {
      signalCounts[sig] = (signalCounts[sig] || 0) + 1;
    }
  }

  // Unique archetypes from kernels
  const archetypes = [...new Set(kernels.map(k => k.archetype || 'unknown'))];

  // Ring completions
  const ringCompleteCount = features.filter(f => f.ring_complete === true).length;

  // Kenophoria state
  const kenophoriaUnresolved = sessionState?.health === 'KENOPHORIA';

  // Build perinoesis record
  const record = {
    ring_position: 'reflection',
    trigger: 'session_end',
    timestamp: new Date().toISOString(),
    session_metrics: {
      features_attempted: total,
      features_ring_complete: ringCompleteCount,
      spectral_gap: Math.round(spectralGap * 1000) / 1000,
      layer_c_first_pass_count: cFirst,
      kernels_extracted: kernels.length,
      unique_archetypes: archetypes,
      morpholepsis_signals: signalCounts,
    },
    questions_asked: [
      'Which verification layer fails most?',
      'Which failure archetype recurs?',
      'Are retries using kernels or starting from zero?',
      'Which morpholepsis signals fired?',
      'Is Layer D producing real insight?',
    ],
    answers: [],
    actions_taken: [],
    document_updated: false,
    kenophoria_unresolved: kenophoriaUnresolved,
  };

  // Append to perinoesis.jsonl
  await mkdir(ringDir, { recursive: true });
  await appendFile(join(ringDir, 'perinoesis.jsonl'), JSON.stringify(record) + '\n');

  // Report
  const health = spectralGap >= 0.618 ? 'PEAK'
    : spectralGap >= 0.382 ? 'STABLE'
    : spectralGap >= 0.236 ? 'DEGRADED'
    : 'CRITICAL';

  console.log('Session feedback logged:');
  console.log(`  Features: ${total} attempted, ${ringCompleteCount} ring-complete`);
  console.log(`  Spectral gap: ${(spectralGap * 100).toFixed(1)}% (${health})`);
  console.log(`  Kernels: ${kernels.length} extracted`);

  if (Object.keys(signalCounts).length > 0) {
    const sigStr = Object.entries(signalCounts).map(([k, v]) => `${k} (${v})`).join(', ');
    console.log(`  Morpholepsis signals: ${sigStr}`);
  }

  if (kenophoriaUnresolved) {
    console.log('  WARNING: Unresolved KENOPHORIA state carried to next session');
  }

  return { exitCode: 0 };
}
