/**
 * ring-status.mjs — User-facing dashboard
 *
 * Shows ring methodology health dashboard: spectral gap,
 * feature history, kernel count, morpholepsis signals.
 *
 * @implements #479
 */

import { readFile } from 'fs/promises';
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

export default async function ringStatus(args, ctx) {
  const ringDir = join(ctx.cwd, RING_DIR);

  const features = await readJsonl(join(ringDir, 'features.jsonl'));
  const kernels = await readJsonl(join(ringDir, 'kernels.jsonl'));
  const reviews = await readJsonl(join(ringDir, 'perinoesis.jsonl'));
  const state = await readJson(join(ringDir, 'session-state.json'));

  if (features.length === 0 && !state) {
    console.log('Ring Methodology — Not Initialized');
    console.log('');
    console.log('  No features tracked yet. Ring tracking begins on first feature.');
    console.log('  Deploy with: aiwg use ring');
    return { exitCode: 0 };
  }

  // Compute metrics
  const total = features.length;
  const cFirst = features.filter(f => f.layer_c_first === true).length;
  const spectralGap = total > 0 ? cFirst / total : 1.0;
  const ringComplete = features.filter(f => f.ring_complete === true).length;

  const health = spectralGap >= 0.618 ? 'PEAK'
    : spectralGap >= 0.382 ? 'STABLE'
    : spectralGap >= 0.236 ? 'DEGRADED'
    : 'CRITICAL';

  // Unique archetypes
  const archetypes = [...new Set(kernels.map(k => k.archetype || 'unknown'))];

  // Morpholepsis signals across all features
  const signalCounts = {};
  for (const f of features) {
    for (const sig of (f.morpholepsis_signals || [])) {
      signalCounts[sig] = (signalCounts[sig] || 0) + 1;
    }
  }

  // Features since last review
  let featuresSinceReview = total;
  if (reviews.length > 0) {
    const lastTs = reviews[reviews.length - 1].timestamp || '';
    featuresSinceReview = features.filter(f => (f.timestamp || '') > lastTs).length;
  }

  // Halted state
  const halted = state?.halted || false;
  const haltReason = state?.halt_reason;

  // Print dashboard
  console.log('Ring Methodology — Project Health');
  console.log('');
  console.log(`  Health:       ${health} (spectral gap: ${(spectralGap * 100).toFixed(1)}%)`);
  console.log(`  Features:     ${total} tracked, ${ringComplete} ring-complete`);
  console.log(`  Kernels:      ${kernels.length} extracted (${archetypes.length} archetypes)`);
  console.log(`  Last review:  ${featuresSinceReview} features ago`);

  if (Object.keys(signalCounts).length > 0) {
    console.log('');
    const sigStr = Object.entries(signalCounts).map(([k, v]) => `${k} (${v})`).join(', ');
    console.log(`  Morpholepsis signals: ${sigStr}`);
  }

  if (halted) {
    console.log('');
    console.log(`  HALTED: ${haltReason}`);
  }

  if (state?.health === 'KENOPHORIA') {
    console.log('');
    console.log('  KENOPHORIA: Blocked on external dependency.');
  }

  return { exitCode: 0 };
}
