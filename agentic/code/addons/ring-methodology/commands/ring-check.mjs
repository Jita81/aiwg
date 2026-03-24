/**
 * ring-check.mjs — FeatureComplete hook
 *
 * Validates all four layers of the verification ring completed
 * for the latest feature in .aiwg/working/ring/features.jsonl.
 *
 * Exit 0 = proceed, Exit 1 = halt with specific missing layer message.
 *
 * @implements #479
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

const RING_DIR = '.aiwg/working/ring';
const FEATURES_FILE = 'features.jsonl';

/**
 * Read the last non-empty line from a file
 */
async function readLastLine(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.length > 0 ? lines[lines.length - 1] : null;
  } catch {
    return null;
  }
}

export default async function ringCheck(args, ctx) {
  const featuresPath = join(ctx.cwd, RING_DIR, FEATURES_FILE);
  const lastLine = await readLastLine(featuresPath);

  // Graceful first-run
  if (lastLine === null) {
    console.log('Ring methodology: No features.jsonl found. Ring tracking not yet initialized.');
    return { exitCode: 0 };
  }

  let latest;
  try {
    latest = JSON.parse(lastLine);
  } catch {
    console.log('HALT: features.jsonl exists but latest entry is not valid JSON.');
    return { exitCode: 1 };
  }

  const feature = latest.feature || 'unknown';
  console.log(`Ring check for: ${feature}`);

  let errors = 0;

  // Layer A
  if (!latest.layer_a) {
    console.log('HALT: Layer A (Developer Reality) not complete.');
    console.log('  → Run syntax checks, imports, and unit tests.');
    errors++;
  }

  // Layer B
  if (!latest.layer_b) {
    console.log('HALT: Layer B (Integration Reality) not complete.');
    console.log('  → Run system tests, verify CLI subcommands, API endpoints.');
    errors++;
  }

  // Layer C: passes on first try OR retries within ceiling
  const layerCFirst = latest.layer_c_first === true;
  const layerCRetries = latest.layer_c_retries || 0;
  const layerCOk = layerCFirst || (layerCRetries > 0 && layerCRetries <= 3);

  if (!layerCOk) {
    console.log('HALT: Layer C (User Surface Reality) not complete.');
    console.log('  → Test from ~, via installed command, in login shell.');
    console.log('  → bash -lc "tool --version" from home directory.');
    errors++;
  }

  // Layer D
  const layerDPresent = latest.layer_d != null;
  if (!layerDPresent) {
    console.log('HALT: Layer D (Generative Reflection) skipped.');
    console.log('  → The ring is running as a line. Layer D always runs.');
    console.log('  → Produce structured reflection artifact before declaring complete.');
    errors++;
  }

  if (errors > 0) {
    console.log('');
    console.log(`Ring incomplete: ${errors} layer(s) missing for '${feature}'.`);
    console.log('Complete all four layers before declaring feature done.');
    return { exitCode: 1 };
  }

  console.log(`PROCEED: Ring complete for '${feature}'. All four layers verified.`);
  return { exitCode: 0 };
}
