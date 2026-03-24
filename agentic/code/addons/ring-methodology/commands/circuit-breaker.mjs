/**
 * circuit-breaker.mjs — Stop event hook
 *
 * Checks halt thresholds on every Stop event. Reads feature and kernel records
 * to assess whether any circuit breaker condition is met.
 *
 * Exit 0 = healthy or degraded (warning), Exit 1 = halt condition.
 *
 * @implements #479
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const RING_DIR = '.aiwg/working/ring';

// φ-derived thresholds
const THRESHOLD_PEAK = 0.618;
const THRESHOLD_STABLE = 0.382;
const THRESHOLD_DEGRADED = 0.236;
const CONSECUTIVE_FAILURE_LIMIT = 2;

/**
 * Read a JSONL file, returning array of parsed objects
 */
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

function computeSpectralGap(features) {
  if (features.length === 0) return 1.0;
  const cFirst = features.filter(f => f.layer_c_first === true).length;
  return cFirst / features.length;
}

function classifyHealth(spectralGap) {
  if (spectralGap >= THRESHOLD_PEAK) return 'PEAK';
  if (spectralGap >= THRESHOLD_STABLE) return 'STABLE';
  if (spectralGap >= THRESHOLD_DEGRADED) return 'DEGRADED';
  return 'CRITICAL';
}

function checkConsecutiveFailures(kernels) {
  if (kernels.length < CONSECUTIVE_FAILURE_LIMIT) return { consecutive: false, feature: '' };
  const recent = kernels.slice(-CONSECUTIVE_FAILURE_LIMIT);
  const features = recent.map(k => k.feature || '');
  if (new Set(features).size === 1 && features[0]) {
    return { consecutive: true, feature: features[0] };
  }
  return { consecutive: false, feature: '' };
}

export default async function circuitBreaker(args, ctx) {
  const ringDir = join(ctx.cwd, RING_DIR);
  const features = await readJsonl(join(ringDir, 'features.jsonl'));
  const kernels = await readJsonl(join(ringDir, 'kernels.jsonl'));

  const spectralGap = computeSpectralGap(features);
  const health = classifyHealth(spectralGap);
  const { consecutive, feature: failingFeature } = checkConsecutiveFailures(kernels);

  const state = {
    timestamp: new Date().toISOString(),
    spectral_gap: Math.round(spectralGap * 1000) / 1000,
    health,
    features_tracked: features.length,
    kernels_accumulated: kernels.length,
    consecutive_failure: consecutive,
    halted: false,
    halt_reason: null,
  };

  // Circuit breaker conditions
  if (consecutive) {
    state.halted = true;
    state.halt_reason = `Consecutive failures on '${failingFeature}'. ${CONSECUTIVE_FAILURE_LIMIT} failures on same issue triggers halt.`;
    await writeState(ringDir, state);
    console.log(`HALT: ${state.halt_reason}`);
    console.log(`Process health: ${health} (spectral gap: ${formatPct(spectralGap)})`);
    return { exitCode: 1 };
  }

  if (health === 'CRITICAL') {
    state.halted = true;
    state.halt_reason = `Process health CRITICAL (spectral gap: ${formatPct(spectralGap)} < ${formatPct(THRESHOLD_DEGRADED)}). Process itself is broken. Human review required.`;
    await writeState(ringDir, state);
    console.log(`SOFT HALT: ${state.halt_reason}`);
    return { exitCode: 1 };
  }

  if (health === 'DEGRADED') {
    state.halt_reason = `Process health DEGRADED (spectral gap: ${formatPct(spectralGap)}). Consider stopping features and fixing process.`;
    await writeState(ringDir, state);
    console.log(`WARNING: ${state.halt_reason}`);
    return { exitCode: 0 };
  }

  // Healthy
  await writeState(ringDir, state);
  if (features.length > 0) {
    console.log(`Circuit breaker: OK — ${health} (spectral gap: ${formatPct(spectralGap)}, ${features.length} features, ${kernels.length} kernels)`);
  }
  return { exitCode: 0 };
}

async function writeState(ringDir, state) {
  await mkdir(ringDir, { recursive: true });
  await writeFile(join(ringDir, 'session-state.json'), JSON.stringify(state, null, 2) + '\n');
}

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}
