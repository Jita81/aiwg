/**
 * Use Command Handler
 *
 * Deploys AIWG frameworks (SDLC, Marketing, Writing) to the current project.
 * After deployment, registers deployed extensions in the extension registry.
 *
 * @implements @.aiwg/architecture/decisions/ADR-001-unified-extension-system.md
 * @implements #56, #57
 * @source @src/cli/router.ts
 * @issue #33
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { CommandHandler, HandlerContext, HandlerResult } from './types.js';
import { createScriptRunner } from './script-runner.js';
import { getFrameworkRoot } from '../../channel/manager.mjs';
import { getRegistry } from '../../extensions/registry.js';
import { registerDeployedExtensions } from '../../extensions/deployment-registration.js';
import { registerCliCommands, registerHooks } from '../cli-extension-loader.js';
import { translateSkillsToCommands, providerNeedsCommands } from '../../plugin/skill-command-translator.js';
import * as ui from '../ui.js';

/**
 * Valid framework identifiers
 */
const VALID_FRAMEWORKS = ['sdlc', 'marketing', 'media-curator', 'research', 'writing', 'general', 'all'] as const;
type Framework = typeof VALID_FRAMEWORKS[number];

/**
 * Framework name to deploy mode mapping
 */
const MODE_MAP: Record<Framework, string> = {
  sdlc: 'sdlc',
  marketing: 'marketing',
  'media-curator': 'media-curator',
  research: 'research',
  writing: 'general',
  general: 'general',
  all: 'all',
};

/**
 * Addons excluded from `aiwg use all`.
 * aiwg-dev is contributor-only tooling — not for end users.
 */
export const USE_ALL_DISALLOW = new Set(['aiwg-dev']);

/**
 * Discover all addon names from the filesystem, minus the disallow list.
 */
export async function getAllAddons(frameworkRoot: string): Promise<string[]> {
  const addonsDir = path.join(frameworkRoot, 'agentic/code/addons');
  const entries = await fs.readdir(addonsDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && !USE_ALL_DISALLOW.has(e.name))
    .map(e => e.name);
}

/**
 * Check whether a given addon name exists on disk.
 * The USE_ALL_DISALLOW list does NOT block explicit single-addon installs —
 * contributors can still run `aiwg use aiwg-dev` directly.
 */
export async function isValidAddon(frameworkRoot: string, name: string): Promise<boolean> {
  try {
    const folderName = name === 'ring' ? 'ring-methodology' : name;
    const stat = await fs.stat(path.join(frameworkRoot, 'agentic/code/addons', folderName));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve addon source path from its name.
 * Handles the ring-methodology special case where the folder name differs from the alias.
 */
export function addonPath(frameworkRoot: string, name: string): string {
  // Legacy alias: `ring` → ring-methodology folder
  const folderName = name === 'ring' ? 'ring-methodology' : name;
  return path.join(frameworkRoot, 'agentic/code/addons', folderName);
}

/**
 * Provider to deployment paths mapping
 *
 * The `behaviors` field tracks where behavior artifacts are deployed per provider.
 * OpenClaw is the first platform with native behavior support (~/.openclaw/behaviors/).
 * Other providers receive behaviors via emulation: Claude Code via .claude/hooks/,
 * Warp via aggregation into WARP.md (empty string = aggregated, not file-per-behavior),
 * all others via the provider rules directory.
 *
 * @implements #609
 */
const PROVIDER_PATHS: Record<string, { agents: string; skills: string; commands: string; rules: string; behaviors: string }> = {
  claude: {
    agents: '.claude/agents',
    skills: '.claude/skills',
    commands: '.claude/commands',
    rules: '.claude/rules',
    behaviors: '.claude/hooks',  // Emulated via hook wrapper
  },
  factory: {
    agents: '.factory/droids',
    skills: '.factory/skills',
    commands: '.factory/commands',
    rules: '.factory/rules',
    behaviors: '.factory/rules', // Emulated via session wrapper in rules dir
  },
  codex: {
    agents: '.codex/agents',
    skills: '.codex/skills',
    commands: '.codex/commands',
    rules: '.codex/rules',
    behaviors: '.codex/rules',   // Emulated via session wrapper
  },
  opencode: {
    agents: '.opencode/agent',
    skills: '.opencode/skill',
    commands: '.opencode/command',
    rules: '.opencode/rule',
    behaviors: '.opencode/rule', // Emulated via session wrapper
  },
  copilot: {
    agents: '.github/agents',
    skills: '.github/skills',
    commands: '.github/commands',
    rules: '.github/copilot-rules',
    behaviors: '.github/copilot-rules', // Emulated via session wrapper
  },
  cursor: {
    agents: '.cursor/agents',
    skills: '.cursor/skills',
    commands: '.cursor/commands',
    rules: '.cursor/rules',
    behaviors: '.cursor/rules',  // Emulated via session wrapper
  },
  warp: {
    agents: '.warp/agents',
    skills: '.warp/skills',
    commands: '.warp/commands',
    rules: '.warp/rules',
    behaviors: '',               // Aggregated into WARP.md behaviors section
  },
  windsurf: {
    agents: '.windsurf/agents',
    skills: '.windsurf/skills',
    commands: '.windsurf/workflows',
    rules: '.windsurf/rules',
    behaviors: '.windsurf/rules', // Emulated via session wrapper
  },
  hermes: {
    agents: '',                                            // Aggregated into AGENTS.md at project root
    skills: path.join(os.homedir(), '.hermes', 'skills'), // User-global skills
    commands: '',                                          // Served via MCP, not file-deployed
    rules: '',                                             // Not applicable — Hermes uses AGENTS.md
    behaviors: '',                                         // Not yet supported
  },
  openclaw: {
    agents: path.join(os.homedir(), '.openclaw', 'agents'),
    skills: path.join(os.homedir(), '.openclaw', 'skills'),
    commands: path.join(os.homedir(), '.openclaw', 'commands'),
    rules: path.join(os.homedir(), '.openclaw', 'rules'),
    behaviors: path.join(os.homedir(), '.openclaw', 'behaviors'), // Native behavior support
  },
};

/**
 * Framework-specific next steps guidance
 *
 * Keyed as `<provider>/<framework>` with fallback to `<framework>`.
 * The 'claude' provider is the default (shown for all unrecognized providers).
 */
const NEXT_STEPS: Record<string, string[]> = {
  // Claude Code (default)
  'sdlc': [
    'Start a project:   aiwg sdlc-accelerate "Your project idea"',
    'Or open Claude:    claude (then use /sdlc-accelerate in the session)',
    'Check health:      aiwg doctor',
  ],
  'marketing': [
    'Open Claude Code and use:  /campaign-kickoff',
    'Marketing intake:          /marketing-intake',
    'Check health:              aiwg doctor',
  ],
  'media-curator': [
    'Open Claude Code and use:  /analyze-artist "Artist Name"',
    'Find sources:              /find-sources "query"',
    'Check health:              aiwg doctor',
  ],
  'research': [
    'Open Claude Code and use:  /research-discover "topic"',
    'Research workflow:         /research-workflow',
    'Check health:              aiwg doctor',
  ],
  'all': [
    'Start a project:   aiwg sdlc-accelerate "Your project idea"',
    'Or open Claude:    claude (then use /sdlc-accelerate in the session)',
    'Check health:      aiwg doctor',
  ],

  // Hermes Agent (MCP-based)
  'hermes/sdlc': [
    'Configure MCP:     Add aiwg to ~/.hermes/config.yaml (see aiwg mcp info)',
    'Start Hermes:      hermes chat "Create an architecture decision for..."',
    'MCP guide:         docs/integrations/hermes-quickstart.md',
  ],
  'hermes/marketing': [
    'Configure MCP:     Add aiwg to ~/.hermes/config.yaml (see aiwg mcp info)',
    'Start Hermes:      hermes chat "Create a marketing campaign for..."',
    'MCP guide:         docs/integrations/hermes-quickstart.md',
  ],
  'hermes/all': [
    'Configure MCP:     Add aiwg to ~/.hermes/config.yaml (see aiwg mcp info)',
    'Start Hermes:      hermes chat',
    'AIWG MCP guide:   docs/integrations/hermes-quickstart.md',
  ],

  // Factory AI
  'factory/sdlc': [
    'Open Factory:      factory (droids are deployed and ready)',
    'Start a project:   aiwg sdlc-accelerate "Your project idea"',
    'Check health:      aiwg doctor',
  ],

  // Cursor
  'cursor/sdlc': [
    'Open Cursor:       cursor . (agents are in .cursor/agents/)',
    'Start a project:   aiwg sdlc-accelerate "Your project idea"',
    'Check health:      aiwg doctor',
  ],

  // Warp Terminal
  'warp/sdlc': [
    'Open Warp:         warp (agents and commands loaded from .warp/)',
    'Start a project:   aiwg sdlc-accelerate "Your project idea"',
    'Check health:      aiwg doctor',
  ],

  // GitHub Copilot
  'copilot/sdlc': [
    'Open VS Code:      code . (Copilot agents in .github/agents/)',
    'Copilot chat:      @workspace use the SDLC workflow agents',
    'Check health:      aiwg doctor',
  ],

  // OpenAI Codex
  'codex/sdlc': [
    'Open Codex:        codex (agents in .codex/agents/, prompts in ~/.codex/prompts/)',
    'Start a project:   aiwg sdlc-accelerate "Your project idea"',
    'Check health:      aiwg doctor',
  ],

  // Windsurf
  'windsurf/sdlc': [
    'Open Windsurf:     AGENTS.md and .windsurf/ are ready',
    'Start a project:   Ask Cascade: "sdlc-accelerate my project"',
    'Check health:      aiwg doctor',
  ],

  // OpenClaw
  'openclaw/sdlc': [
    'Configure MCP:     Add aiwg to ~/.openclaw/config.yaml (see docs/openclaw-guide.md)',
    'Start OpenClaw:    openclaw (agents, skills, commands, rules, behaviors deployed)',
    'Verify:            openclaw skills list | grep aiwg',
  ],
  'openclaw/marketing': [
    'Configure MCP:     Add aiwg to ~/.openclaw/config.yaml (see docs/openclaw-guide.md)',
    'Start OpenClaw:    openclaw (marketing agents and skills deployed)',
    'Verify:            openclaw skills list | grep aiwg',
  ],
  'openclaw/all': [
    'Configure MCP:     Add aiwg to ~/.openclaw/config.yaml (see docs/openclaw-guide.md)',
    'Start OpenClaw:    openclaw (all frameworks deployed)',
    'Full guide:        docs/openclaw-guide.md',
  ],
};

function printNextSteps(framework: Framework, provider: string = 'claude'): void {
  // Try provider-specific first, fall back to generic
  const providerKey = `${provider}/${framework}`;
  const steps = NEXT_STEPS[providerKey] ?? NEXT_STEPS[framework] ?? NEXT_STEPS.sdlc;
  ui.section('Next steps:', steps);
}

/**
 * Count deployed artifacts in target directories
 *
 * @implements #609
 */
async function countDeployedArtifacts(
  target: string,
  paths: { agents: string; skills: string; commands: string; rules: string; behaviors: string }
): Promise<{ agents: number; commands: number; skills: number; rules: number; behaviors: number }> {
  const countMd = async (dir: string): Promise<number> => {
    if (!dir) return 0;
    try {
      // Support absolute paths (openclaw deploys to home dir)
      const resolvedDir = path.isAbsolute(dir) ? dir : path.join(target, dir);
      const entries = await fs.readdir(resolvedDir);
      return entries.filter(f => f.endsWith('.md')).length;
    } catch {
      return 0;
    }
  };
  const countDirs = async (dir: string): Promise<number> => {
    if (!dir) return 0;
    try {
      const resolvedDir = path.isAbsolute(dir) ? dir : path.join(target, dir);
      const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).length;
    } catch {
      return 0;
    }
  };
  return {
    agents: await countMd(paths.agents),
    commands: await countMd(paths.commands),
    skills: await countDirs(paths.skills),
    rules: await countMd(paths.rules),
    behaviors: await countDirs(paths.behaviors),
  };
}

/**
 * Use command handler
 *
 * Deploys framework agents, commands, and skills to the current project,
 * then registers them in the extension registry for discovery.
 */
export class UseHandler implements CommandHandler {
  id = 'use';
  name = 'Use Framework';
  description = 'Deploy AIWG framework to current project';
  category = 'framework' as const;
  aliases: string[] = [];

  async execute(ctx: HandlerContext): Promise<HandlerResult> {
    const framework = ctx.args[0];
    const remainingArgs = ctx.args.slice(1);

    // Validate target argument (framework or addon)
    if (!framework) {
      return {
        exitCode: 1,
        message: 'Error: Framework or addon name required\nFrameworks: sdlc, marketing, media-curator, research, writing, all\nAddons: rlm, ring, daemon, aiwg-dev',
      };
    }

    const frameworkRoot = await getFrameworkRoot();
    const isFramework = VALID_FRAMEWORKS.includes(framework as Framework);
    const isAddon = !isFramework && await isValidAddon(frameworkRoot, framework);

    if (!isFramework && !isAddon) {
      return {
        exitCode: 1,
        message: `Error: Unknown target '${framework}'\nFrameworks: ${VALID_FRAMEWORKS.join(', ')}\n\nFor addons, run 'aiwg list' to see available addons.\nRun 'aiwg help' for usage information.`,
      };
    }

    // Handle addon-only deployment
    if (isAddon) {
      const providerIdx = remainingArgs.findIndex(a => a === '--provider' || a === '--platform');
      const provider = providerIdx >= 0 && remainingArgs[providerIdx + 1] ? remainingArgs[providerIdx + 1] : 'claude';
      const targetIdx = remainingArgs.findIndex(a => a === '--target');
      const target = targetIdx >= 0 && remainingArgs[targetIdx + 1] ? remainingArgs[targetIdx + 1] : process.cwd();

      const runner = createScriptRunner(ctx.frameworkRoot);
      const addonBaseArgs = ['--deploy-commands', '--deploy-skills', '--deploy-rules'];
      if (provider) addonBaseArgs.push('--provider', provider);
      if (target) addonBaseArgs.push('--target', target);

      ui.blank();
      ui.header(`  Deploying ${framework} addon...`);
      const addonSource = addonPath(frameworkRoot, framework);
      const addonResult = await runner.run('tools/agents/deploy-agents.mjs', [
        '--quiet', '--source', addonSource,
        ...addonBaseArgs,
      ], { capture: true });

      if (addonResult.exitCode !== 0) {
        return addonResult;
      }

      // Register deployed extensions
      try {
        const registry = getRegistry();
        const paths = PROVIDER_PATHS[provider] || PROVIDER_PATHS.claude;
        await registerDeployedExtensions(registry, {
          agentsPath: paths.agents,
          skillsPath: paths.skills,
          commandsPath: paths.commands,
          rulesPath: paths.rules,
          behaviorsPath: paths.behaviors,
          provider,
          cwd: target,
        });
        ui.success('Extension registration complete');
      } catch (error) {
        ui.warn(`Failed to register extensions: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Register CLI commands if addon declares them
      try {
        const manifestPath = path.join(addonSource, 'manifest.json');
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);

        if (manifest.cli_commands?.namespace && manifest.cli_commands?.subcommands) {
          const cmds = manifest.cli_commands;
          const commandsSource = path.join(addonSource, cmds.entry || 'commands/');
          await registerCliCommands(
            target,
            cmds.namespace,
            cmds.description || `${framework} addon commands`,
            commandsSource,
            cmds.subcommands
          );
          ui.success(`CLI namespace '${cmds.namespace}' registered (${Object.keys(cmds.subcommands).length} subcommands)`);

          // Register Claude Code hooks for subcommands with hook_event
          if (provider === 'claude') {
            const registeredHooks = await registerHooks(target, cmds.namespace, cmds.subcommands);
            for (const hook of registeredHooks) {
              ui.success(`Hook registered: ${hook}`);
            }
          }
        }
      } catch (error) {
        ui.warn(`Failed to register CLI commands: ${error instanceof Error ? error.message : String(error)}`);
      }

      ui.blank();
      ui.success(`${framework} addon deployed`);
      return {
        exitCode: 0,
      };
    }

    // Map framework name to deploy mode
    const mode = MODE_MAP[framework as Framework];
    const deployArgs = ['--mode', mode, '--deploy-commands', '--deploy-skills', '--deploy-rules', ...remainingArgs];

    // Check flags
    const skipUtils = remainingArgs.includes('--no-utils');
    const verbose = remainingArgs.includes('--verbose') || remainingArgs.includes('-v');
    const dryRun = remainingArgs.includes('--dry-run');
    const filteredArgs = deployArgs.filter(a => a !== '--no-utils');

    // Pass --quiet to suppress deploy-agents.mjs header/footer in default mode (#460)
    // Dry-run must not capture output — its purpose is to show what would happen
    if (!verbose && !dryRun) filteredArgs.push('--quiet');

    // Extract provider and target from remainingArgs to pass to addon deployments
    const providerIdx = remainingArgs.findIndex(a => a === '--provider' || a === '--platform');
    const provider = providerIdx >= 0 && remainingArgs[providerIdx + 1] ? remainingArgs[providerIdx + 1] : 'claude';
    const targetIdx = remainingArgs.findIndex(a => a === '--target');
    const target = targetIdx >= 0 && remainingArgs[targetIdx + 1] ? remainingArgs[targetIdx + 1] : process.cwd();

    // Deploy main framework
    const quiet = !verbose && !dryRun;
    const captureOpts = quiet ? { capture: true } : {};
    if (quiet) {
      ui.blank();
      console.log(`  ${ui.brandMark()} ${ui.bold(`Installing ${framework} framework`)}  ${ui.dimText(`for ${provider === 'claude' ? 'Claude Code' : provider}`)}`);
      ui.blank();
    }
    const runner = createScriptRunner(ctx.frameworkRoot);
    const mainResult = await runner.run('tools/agents/deploy-agents.mjs', filteredArgs, captureOpts);

    if (mainResult.exitCode !== 0) {
      return mainResult;
    }

    // Build common args for addon deployments (inherit provider and target)
    const addonBaseArgs = ['--deploy-commands', '--deploy-skills', '--deploy-rules'];
    if (provider) addonBaseArgs.push('--provider', provider);
    if (target) addonBaseArgs.push('--target', target);
    if (verbose) addonBaseArgs.push('--verbose');

    // Deploy all addons (excluding disallow list) unless --no-utils
    if (!skipUtils) {
      const allAddons = await getAllAddons(frameworkRoot);
      for (const addon of allAddons) {
        if (verbose) {
          console.log('');
          console.log(`Deploying ${addon} addon...`);
        }
        const source = addonPath(frameworkRoot, addon);
        const addonArgs = quiet
          ? ['--quiet', '--source', source, ...addonBaseArgs]
          : ['--source', source, ...addonBaseArgs];
        const result = await runner.run('tools/agents/deploy-agents.mjs', addonArgs, captureOpts);
        if (result.exitCode !== 0) {
          return result;
        }
      }
    }

    // Translate deployed skills to commands for providers that require legacy command format
    // (#550) Skills are now canonical; commands are generated from SKILL.md frontmatter.
    if (providerNeedsCommands(provider)) {
      const paths = PROVIDER_PATHS[provider] || PROVIDER_PATHS.claude;
      const targetSkillsDir = path.isAbsolute(paths.skills)
        ? paths.skills
        : path.join(target, paths.skills);
      const targetCommandsDir = path.isAbsolute(paths.commands)
        ? paths.commands
        : path.join(target, paths.commands);
      try {
        const translationResult = await translateSkillsToCommands(targetSkillsDir, {
          provider,
          targetDir: targetCommandsDir,
          dryRun,
          verbose,
        });
        if (verbose && translationResult.translated.length > 0) {
          ui.success(`Translated ${translationResult.translated.length} skills → commands (${provider})`);
        }
      } catch (error) {
        ui.warn(`Skill→command translation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Register deployed extensions in the registry
    if (verbose) {
      console.log('');
      console.log('Registering deployed extensions...');
    }
    try {
      const registry = getRegistry();
      const paths = PROVIDER_PATHS[provider] || PROVIDER_PATHS.claude;

      await registerDeployedExtensions(registry, {
        agentsPath: paths.agents,
        skillsPath: paths.skills,
        commandsPath: paths.commands,
        rulesPath: paths.rules,
        behaviorsPath: paths.behaviors,
        provider,
        cwd: target,
      });

      if (verbose) console.log('Extension registration complete');
    } catch (error) {
      console.error('Warning: Failed to register extensions:', error instanceof Error ? error.message : String(error));
      // Don't fail the deployment if registration fails
    }

    // Show completion summary and next steps (default mode only)
    if (quiet) {
      // Count deployed artifacts
      const paths = PROVIDER_PATHS[provider] || PROVIDER_PATHS.claude;
      const counts = await countDeployedArtifacts(target, paths);
      if (counts.agents > 0) ui.deployCount('Agents', counts.agents);
      if (counts.commands > 0) ui.deployCount('Commands', counts.commands);
      if (counts.skills > 0) ui.deployCount('Skills', counts.skills);
      if (counts.rules > 0) ui.deployCount('Rules', counts.rules);
      if (counts.behaviors > 0) ui.deployCount('Behaviors', counts.behaviors);
      ui.blank();
      printNextSteps(framework as Framework, provider);
    }

    return {
      exitCode: 0,
      message: verbose ? `Successfully deployed ${framework} framework` : '',
    };
  }
}

/**
 * Create use handler instance
 */
export function createUseHandler(): CommandHandler {
  return new UseHandler();
}

/**
 * Singleton handler instance
 */
export const useHandler = new UseHandler();
