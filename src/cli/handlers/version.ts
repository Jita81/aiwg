/**
 * Version Command Handler
 *
 * Displays version and channel information for the AIWG installation.
 *
 * @implements @.aiwg/architecture/decisions/ADR-001-unified-extension-system.md
 * @source @src/cli/router.ts
 * @issue #33
 */

import type { CommandHandler, HandlerContext, HandlerResult } from './types.js';
import { getVersionInfo } from '../../channel/manager.mjs';
import * as ui from '../ui.js';

/**
 * Version command handler
 */
export const versionHandler: CommandHandler = {
  id: 'version',
  name: 'Version',
  description: 'Show version and channel info',
  category: 'maintenance',
  aliases: ['-version', '--version'],

  async execute(_ctx: HandlerContext): Promise<HandlerResult> {
    await displayVersion();
    return { exitCode: 0 };
  },
};

/**
 * Display version information including channel and git details
 */
async function displayVersion(): Promise<void> {
  const info = await getVersionInfo();
  const channel = info.devMode ? 'dev' : info.channel;

  console.log(`${ui.bold('aiwg')} ${ui.bold(info.version)}  ${ui.channelLabel(channel)}`);

  if (info.channel === 'edge' && info.gitHash) {
    ui.dim(`  git: ${info.gitHash} (${info.gitBranch})`);
    ui.dim(`  path: ${info.edgePath}`);
  } else {
    ui.dim(`  ${info.packageRoot}`);
  }
}
