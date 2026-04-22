/**
 * Install Command Handler
 *
 * Implements `aiwg install <ref>` for installing frameworks, addons, and
 * extensions from Git repositories into the local package cache.
 *
 * Supported ref formats:
 *   owner/name                 → Gitea shorthand (configured host)
 *   owner/name@v1.2.0          → Gitea shorthand with version
 *   github:owner/name          → GitHub shorthand
 *   github:owner/name@v1.2.0   → GitHub shorthand with version
 *   clawhub:owner/name         → ClawHub / OpenClaw registry
 *   openclaw:owner/name        → ClawHub alias
 *   https://...                → direct Git URL
 *   git@host:owner/name.git    → SSH URL
 *
 * @implements #557
 * @implements #804
 */

import path from 'path';
import type { CommandHandler, HandlerContext, HandlerResult } from './types.js';
import { installPackage } from '../../packages/registry.js';
import { recordDeployment } from '../../packages/package-registry.js';
import { createScriptRunner } from './script-runner.js';
import { handlerResultFromError } from '../errors.js';
import * as ui from '../ui.js';

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export const installHandler: CommandHandler = {
  id: 'install',
  name: 'Install Package',
  description: 'Install a framework, addon, or extension from a Git repository',
  category: 'framework',
  aliases: [],

  async execute(ctx: HandlerContext): Promise<HandlerResult> {
    const rawRef = ctx.args[0];

    if (!rawRef) {
      return {
        exitCode: 1,
        message: [
          'Error: Package reference required',
          '',
          'Usage:',
          '  aiwg install owner/name                    # Gitea shorthand',
          '  aiwg install github:owner/name             # GitHub shorthand',
          '  aiwg install clawhub:owner/name            # ClawHub / OpenClaw registry',
          '  aiwg install openclaw:owner/name           # ClawHub alias',
          '  aiwg install owner/name@v1.2.0             # Pin to version',
          '  aiwg install https://git.example.com/a/b   # Direct URL',
          '',
          'Options:',
          '  --deploy                Deploy immediately after install',
          '  --provider <name>       Target provider (claude, copilot, cursor...)',
          '  --target <dir>          Project directory to deploy into',
          '  --refresh               Force re-pull even if cached',
        ].join('\n'),
      };
    }

    const deploy = hasFlag(ctx.args, '--deploy');
    const refresh = hasFlag(ctx.args, '--refresh');
    const provider = parseFlag(ctx.args, '--provider') ?? 'claude';
    const target = parseFlag(ctx.args, '--target') ?? ctx.cwd;

    ui.blank();
    console.log(`  ${ui.brandMark()} ${ui.bold('aiwg install')}  ${ui.dimText(rawRef)}`);
    ui.rule();

    // Fetch package
    ui.info(`Resolving ${rawRef}...`);

    let cachePath: string;
    let key: string;
    let type: string;
    let namespace: string;

    try {
      ({ cachePath, key, type, namespace } = await installPackage(rawRef, { refresh }));
    } catch (error) {
      // Preserve AiwgError.exitCode while keeping the "Error: " prefix users
      // are used to seeing from `aiwg install`.
      const result = handlerResultFromError(error);
      return { ...result, message: `Error: ${result.message}` };
    }

    ui.success(`Installed: ${key} (${type})`);
    ui.dimText(`  Cache: ${cachePath}`);
    if (namespace !== 'aiwg') {
      ui.dimText(`  Namespace: ${namespace}`);
    }

    // Optionally deploy
    if (deploy) {
      ui.info(`Deploying ${key} to ${provider}...`);

      const runner = createScriptRunner(ctx.frameworkRoot);
      const deployArgs = [
        '--source', cachePath,
        '--deploy-commands',
        '--deploy-skills',
        '--deploy-rules',
        '--provider', provider,
        '--target', target,
        '--namespace', namespace,
        '--quiet',
      ];

      const deployResult = await runner.run('tools/agents/deploy-agents.mjs', deployArgs, { capture: true });

      if (deployResult.exitCode !== 0) {
        ui.warn(`Deploy failed (exit ${deployResult.exitCode})`);
        if (deployResult.message) ui.dim(`  ${deployResult.message}`);
      } else {
        ui.success(`Deployed to ${provider} in ${path.relative(process.cwd(), target) || '.'}`);

        // Record deployment
        await recordDeployment(key, {
          projectPath: target,
          provider,
          deployedAt: new Date().toISOString(),
        });
      }
    }

    ui.blank();

    if (!deploy) {
      ui.info(`To deploy: aiwg use ${key.split('/').pop() ?? key}`);
    }

    return { exitCode: 0 };
  },
};
