/**
 * Router Loader for TypeScript Router
 *
 * Uses tsx to load the TypeScript router directly without compilation.
 * This allows the experimental router to work during development.
 *
 * @implements @.aiwg/architecture/decisions/ADR-001-unified-extension-system.md
 * @issue #48
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the tsx binary path.
 * Checks the package-local devDependency path first (dev/monorepo installs),
 * then falls back to a PATH-resolvable 'tsx' command (global npm installs).
 */
function resolveTsx() {
  const localBin = path.resolve(__dirname, '../../node_modules/.bin/tsx');
  if (existsSync(localBin)) {
    return { cmd: localBin, args: [] };
  }
  // Production global install: tsx is not a bundled dep, use npx as last resort
  return { cmd: 'npx', args: ['--yes', 'tsx'] };
}

/**
 * Run the TypeScript router via tsx
 *
 * @param {string[]} args - Command line arguments
 * @param {object} [options] - Execution options
 */
export async function run(args, options = {}) {
  const routerPath = path.join(__dirname, 'router-entry.ts');

  return new Promise((resolve, reject) => {
    const { cmd, args: prefixArgs } = resolveTsx();
    const child = spawn(cmd, [...prefixArgs, routerPath, ...args], {
      cwd: options.cwd || process.cwd(),
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code !== 0) {
        process.exit(code);
      }
      resolve();
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
