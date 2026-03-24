/**
 * session-health-check.mjs — SessionStart hook
 *
 * Reads prior session state and surfaces:
 * - Unresolved KENOPHORIA from previous session
 * - DEGRADED or CRITICAL health phase
 * - Pending perinoetic review
 * - Feature/kernel summary for context
 *
 * Always exits 0 (informational only).
 *
 * @implements #479
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

const RING_DIR = '.aiwg/working/ring';

async function readJson(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function countLines(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

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

async function checkPendingPerinoesis(ringDir) {
  const featureCount = await countLines(join(ringDir, 'features.jsonl'));
  if (featureCount === 0) return false;

  const reviews = await readJsonl(join(ringDir, 'perinoesis.jsonl'));
  if (reviews.length === 0) return featureCount >= 3;

  const lastReview = reviews[reviews.length - 1];
  const lastTs = lastReview.timestamp || '';

  // Count features after last review timestamp
  const features = await readJsonl(join(ringDir, 'features.jsonl'));
  const featuresSince = features.filter(f => (f.timestamp || '') > lastTs).length;

  return featuresSince >= 3;
}

export default async function sessionHealthCheck(args, ctx) {
  const ringDir = join(ctx.cwd, RING_DIR);

  // Check if ring directory exists (read session state as probe)
  const state = await readJson(join(ringDir, 'session-state.json'));

  if (!state) {
    console.log('Ring methodology: No prior session state. Starting fresh.');
    return { exitCode: 0 };
  }

  const health = state.health || 'unknown';
  const spectralGap = state.spectral_gap || 0;
  const halted = state.halted || false;
  const haltReason = state.halt_reason;
  const featuresTracked = state.features_tracked || 0;
  const kernelsAccumulated = state.kernels_accumulated || 0;

  console.log('Ring methodology — prior session state:');
  console.log(`  Health: ${health} (spectral gap: ${(spectralGap * 100).toFixed(1)}%)`);
  console.log(`  Features: ${featuresTracked}, Kernels: ${kernelsAccumulated}`);

  // Check for unresolved halt
  if (halted) {
    console.log('');
    console.log('  WARNING: Prior session ended in HALT state.');
    console.log(`  Reason: ${haltReason}`);
    console.log('  Review the halt condition before resuming feature work.');
  }

  // Check for unresolved kenophoria
  if (health === 'KENOPHORIA') {
    console.log('');
    console.log('  KENOPHORIA: Prior session was blocked on external dependency.');
    console.log('  Check if the blocking condition has been resolved.');
  }

  // Check for degraded health
  if (health === 'DEGRADED' || health === 'CRITICAL') {
    console.log('');
    console.log(`  Process health ${health}. Consider perinoetic review before new features.`);
  }

  // Check for pending perinoetic review
  if (await checkPendingPerinoesis(ringDir)) {
    console.log('');
    console.log('  Perinoetic review overdue (3+ features since last review).');
    console.log('  Run review protocol before starting next feature.');
  }

  return { exitCode: 0 };
}
