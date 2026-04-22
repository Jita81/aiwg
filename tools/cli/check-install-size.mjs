#!/usr/bin/env node

/**
 * Install-size budget gate.
 *
 * Runs `npm pack --dry-run --json`, reads the reported packed + unpacked
 * sizes, and fails with a non-zero exit code if either exceeds the budget.
 *
 * Budgets are set intentionally above current measured values so we catch
 * new regressions rather than baselining today's number. They can be
 * overridden via env for specific CI needs:
 *
 *   AIWG_PACK_PACKED_BUDGET_KB    — default 12000 (12 MB)
 *   AIWG_PACK_UNPACKED_BUDGET_KB  — default 40000 (40 MB)
 *   AIWG_PACK_FILES_BUDGET        — default 4000 (file count)
 *
 * The 5 MB install-size target in Phase 6 (#923) is aspirational and
 * requires a bundler migration — tracked separately. This gate prevents
 * the package from ballooning in the meantime.
 *
 * Usage: node tools/cli/check-install-size.mjs [--verbose]
 */

import { execSync } from 'child_process';

const PACKED_BUDGET_KB = parseIntEnv('AIWG_PACK_PACKED_BUDGET_KB', 12_000);
const UNPACKED_BUDGET_KB = parseIntEnv('AIWG_PACK_UNPACKED_BUDGET_KB', 40_000);
const FILES_BUDGET = parseIntEnv('AIWG_PACK_FILES_BUDGET', 4_000);

const verbose = process.argv.includes('--verbose');

function parseIntEnv(name, def) {
  const raw = process.env[name];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function fmtMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

try {
  // `npm pack --dry-run --json` returns an array with one entry per tarball.
  // We use the first entry (single package).
  const raw = execSync('npm pack --dry-run --json', { stdio: ['ignore', 'pipe', 'pipe'] });
  const out = JSON.parse(raw.toString());
  const pkg = Array.isArray(out) ? out[0] : out;
  if (!pkg || typeof pkg.size !== 'number') {
    console.error('check-install-size: unexpected npm pack output');
    process.exit(1);
  }

  const packedKB = pkg.size / 1024;
  const unpackedKB = pkg.unpackedSize / 1024;
  const fileCount = Array.isArray(pkg.files) ? pkg.files.length : (pkg.fileCount ?? 0);

  if (verbose) {
    console.log(`Package:      ${pkg.name}@${pkg.version}`);
    console.log(`Packed:       ${fmtKb(pkg.size)} (budget ${PACKED_BUDGET_KB} KB)`);
    console.log(`Unpacked:     ${fmtMb(pkg.unpackedSize)} (budget ${UNPACKED_BUDGET_KB / 1024} MB)`);
    console.log(`File count:   ${fileCount} (budget ${FILES_BUDGET})`);
    console.log('');
  }

  const failures = [];
  if (packedKB > PACKED_BUDGET_KB) {
    failures.push(`Packed size ${fmtKb(pkg.size)} exceeds budget of ${PACKED_BUDGET_KB} KB`);
  }
  if (unpackedKB > UNPACKED_BUDGET_KB) {
    failures.push(`Unpacked size ${fmtMb(pkg.unpackedSize)} exceeds budget of ${UNPACKED_BUDGET_KB / 1024} MB`);
  }
  if (fileCount > FILES_BUDGET) {
    failures.push(`File count ${fileCount} exceeds budget of ${FILES_BUDGET}`);
  }

  if (failures.length > 0) {
    console.error('check-install-size: FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('');
    console.error('Budgets are set above current measured values to catch regressions.');
    console.error('If the increase is intentional, bump AIWG_PACK_*_BUDGET* and document why.');
    process.exit(1);
  }

  console.log(`check-install-size: OK (${fmtKb(pkg.size)} packed / ${fmtMb(pkg.unpackedSize)} unpacked / ${fileCount} files)`);
} catch (err) {
  console.error('check-install-size: failed to measure package size');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
