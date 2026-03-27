/**
 * Use Command Handler
 *
 * Deploys AIWG frameworks (SDLC, Marketing, Writing) to the current project.
 * After deployment, registers deployed extensions in the extension registry.
 *
 * @implements @.aiwg/architecture/decisions/ADR-001-unified-extension-system.md
 * @implements #56, #57, #557, #621
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
import { resolveInstalledPackage } from '../../packages/registry.js';
import {
  readAiwgConfig,
  writeAiwgConfig,
  updateInstalled,
  hashManifest,
} from '../../config/aiwg-config.js';
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
 * Valid addon identifiers (deployed independently via `aiwg use <addon>`)
 */
const VALID_ADDONS = ['rlm'] as const;
type Addon = typeof VALID_ADDONS[number];

/**
 * Addon name to source directory mapping (relative to framework root)
 */
const ADDON_PATHS: Record<Addon, string> = {
  rlm: 'agentic/code/addons/rlm',
};

/**
 * Framework name to manifest.json path mapping (relative to framework root)
 * Used for manifestHash computation in the config deployment record.
 *
 * @implements #621
 */
const FRAMEWORK_MANIFEST_PATHS: Partial<Record<Framework, string>> = {
  sdlc: 'agentic/code/frameworks/sdlc-complete/manifest.json',
  marketing: 'agentic/code/frameworks/media-marketing-kit/manifest.json',
  'media-curator': 'agentic/code/frameworks/media-curator/manifest.json',
  research: 'agentic/code/frameworks/research-complete/manifest.json',
};

/**
 * Provider to deployment paths mapping
 */
const PROVIDER_PATHS: Record<string, { agents: string; skills: string; commands: string; rules: string }> = {
  claude: {
    agents: '.claude/agents',
    skills: '.claude/skills',
    commands: '.claude/commands',
    rules: '.claude/rules',
  },
  factory: {
    agents: '.factory/droids',
    skills: '.factory/skills',
    commands: '.factory/commands',
    rules: '.factory/rules',
  },
  codex: {
    agents: '.codex/agents',
    skills: '.codex/skills',
    commands: '.codex/commands',
    rules: '.codex/rules',
  },
  opencode: {
    agents: '.opencode/agent',
    skills: '.opencode/skill',
    commands: '.opencode/commands',
    rules: '.opencode/rule',
  },
  copilot: {
    agents: '.github/agents',
    skills: '.github/skills',
    commands: '.github/commands',
    rules: '.github/copilot-rules',
  },
  cursor: {
    agents: '.cursor/agents',
    skills: '.cursor/skills',
    commands: '.cursor/commands',
    rules: '.cursor/rules',
  },
  warp: {
    agents: '.warp/agents',
    skills: '.warp/skills',
    commands: '.warp/commands',
    rules: '.warp/rules',
  },
  windsurf: {
    agents: '.windsurf/agents',
    skills: '.windsurf/skills',
    commands: '.windsurf/workflows',
    rules: '.windsurf/rules',
  },
  hermes: {
    agents: '',                                            // Aggregated into AGENTS.md at project root
    skills: path.join(os.homedir(), '.hermes', 'skills'), // User-global skills
    commands: '',                                          // Served via MCP, not file-deployed
    rules: '',                                             // Not applicable — Hermes uses AGENTS.md
  },
  openclaw: {
    agents: path.join(os.homedir(), '.openclaw', 'agents'),
    skills: path.join(os.homedir(), '.openclaw', 'skills'),
    commands: path.join(os.homedir(), '.openclaw', 'commands'),
    rules: path.join(os.homedir(), '.openclaw', 'rules'),
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
 */
async function countDeployedArtifacts(
  target: string,
  paths: { agents: string; skills: string; commands: string; rules: string }
): Promise<{ agents: number; commands: number; skills: number; rules: number }> {
  const countMd = async (dir: string): Promise<number> => {
    try {
      const entries = await fs.readdir(path.join(target, dir));
      return entries.filter(f => f.endsWith('.md')).length;
    } catch {
      return 0;
    }
  };
  const countDirs = async (dir: string): Promise<number> => {
    try {
      const entries = await fs.readdir(path.join(target, dir), { withFileTypes: true });
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
  };
}

/**
 * Deploy a package that was installed via `aiwg install` from the local cache.
 * Used when `aiwg use <name>` matches an entry in ~/.aiwg/packages.yaml.
 *
 * @implements #557
 */
async function deployFromLocalCache(
  name: string,
  cachePath: string,
  remainingArgs: string[],
  frameworkRoot: string
): Promise<HandlerResult> {
  const providerIdx = remainingArgs.findIndex(a => a === '--provider' || a === '--platform');
  const provider = providerIdx >= 0 && remainingArgs[providerIdx + 1] ? remainingArgs[providerIdx + 1] : 'claude';
  const targetIdx = remainingArgs.findIndex(a => a === '--target');
  const target = targetIdx >= 0 && remainingArgs[targetIdx + 1] ? remainingArgs[targetIdx + 1] : process.cwd();

  const runner = createScriptRunner(frameworkRoot);

  ui.blank();
  console.log(`  ${ui.brandMark()} ${ui.bold(`Installing ${name}`)}`);
  ui.blank();

  const deployResult = await runner.run('tools/agents/deploy-agents.mjs', [
    '--quiet',
    '--source', cachePath,
    '--deploy-commands',
    '--deploy-skills',
    '--deploy-rules',
    '--provider', provider,
    '--target', target,
  ], { capture: true });

  if (deployResult.exitCode !== 0) {
    return deployResult;
  }

  ui.success(`${name} deployed from local package cache`);
  ui.dim(`  Source: ${cachePath}`);
  ui.blank();

  return { exitCode: 0 };
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

    // Load project-level config (may be null if not yet initialised)
    // @implements #621
    const config = await readAiwgConfig(ctx.cwd);

    // Zero-arg form: redeploy everything recorded in config
    if (!framework) {
      if (!config || Object.keys(config.installed).length === 0) {
        return {
          exitCode: 1,
          message: [
            'Error: No framework specified.',
            '',
            'Options:',
            '  aiwg use sdlc              Deploy the SDLC framework',
            '  aiwg use all               Deploy all frameworks',
            '  aiwg init && aiwg use      Set up project config, then redeploy everything',
            '',
            'Frameworks: sdlc, marketing, media-curator, research, writing, all',
            'Addons: rlm',
          ].join('\n'),
        };
      }
      // Redeploy each installed framework/addon sequentially
      for (const name of Object.keys(config.installed)) {
        const result = await this.execute({ ...ctx, args: [name] });
        if (result.exitCode !== 0) return result;
      }
      return { exitCode: 0 };
    }

    const isFramework = VALID_FRAMEWORKS.includes(framework as Framework);
    const isAddon = VALID_ADDONS.includes(framework as Addon);

    if (!isFramework && !isAddon) {
      // Check local package registry before emitting an error (#557)
      const localCachePath = await resolveInstalledPackage(framework);
      if (localCachePath) {
        return deployFromLocalCache(framework, localCachePath, ctx.args.slice(1), ctx.frameworkRoot);
      }

      return {
        exitCode: 1,
        message: [
          `Error: Unknown target '${framework}'`,
          `Frameworks: ${VALID_FRAMEWORKS.join(', ')}`,
          `Addons: ${VALID_ADDONS.join(', ')}`,
          '',
          `If '${framework}' is a remote package, install it first:`,
          `  aiwg install owner/${framework}       # Gitea shorthand`,
          `  aiwg install github:owner/${framework} # GitHub shorthand`,
          '',
          `Run 'aiwg help' for usage information.`,
        ].join('\n'),
      };
    }

    // Handle addon-only deployment
    if (isAddon) {
      const providerIdx = remainingArgs.findIndex(a => a === '--provider' || a === '--platform');
      const explicitProvider = providerIdx >= 0 && remainingArgs[providerIdx + 1] ? remainingArgs[providerIdx + 1] : undefined;
      const provider = explicitProvider ?? config?.providers?.[0] ?? 'claude';
      const targetIdx = remainingArgs.findIndex(a => a === '--target');
      const target = targetIdx >= 0 && remainingArgs[targetIdx + 1] ? remainingArgs[targetIdx + 1] : process.cwd();

      const runner = createScriptRunner(ctx.frameworkRoot);
      const addonBaseArgs = ['--deploy-commands', '--deploy-skills', '--deploy-rules'];
      if (provider) addonBaseArgs.push('--provider', provider);
      if (target) addonBaseArgs.push('--target', target);

      ui.blank();
      ui.header(`  Deploying ${framework} addon...`);
      const frameworkRoot = await getFrameworkRoot();
      const addonSource = path.join(frameworkRoot, ADDON_PATHS[framework as Addon]);
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

      // Update project config deployment record (#621)
      try {
        const liveConfig = await readAiwgConfig(ctx.cwd);
        if (liveConfig) {
          const frameworkRoot = await getFrameworkRoot();
          const addonManifestPath = path.join(frameworkRoot, ADDON_PATHS[framework as Addon], 'manifest.json');
          const mHash = await hashManifest(addonManifestPath);
          const paths = PROVIDER_PATHS[provider] || PROVIDER_PATHS.claude;
          const counts = await countDeployedArtifacts(target, paths);
          const { getVersionInfo } = await import('../../channel/manager.mjs');
          const vInfo = await getVersionInfo().catch(() => ({ version: 'unknown' }));
          const version = vInfo?.version ?? 'unknown';
          updateInstalled(liveConfig, framework, provider, counts, { version: String(version ?? 'unknown'), source: 'bundled', manifestHash: mHash });
          await writeAiwgConfig(ctx.cwd, liveConfig);
        }
      } catch {
        // Non-critical: config update failure should not block deployment
      }

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

    // Config-first provider resolution (#621)
    // --provider flag takes precedence; otherwise use configured providers.
    const providerIdx = remainingArgs.findIndex(a => a === '--provider' || a === '--platform');
    const explicitProvider = providerIdx >= 0 && remainingArgs[providerIdx + 1]
      ? remainingArgs[providerIdx + 1]
      : undefined;
    const providers = explicitProvider ? [explicitProvider] : (config?.providers ?? ['claude']);

    if (!explicitProvider && !config) {
      ui.warn("No .aiwg/aiwg.config found — run 'aiwg init' to configure providers for this project");
    }

    const targetIdx = remainingArgs.findIndex(a => a === '--target');
    const target = targetIdx >= 0 && remainingArgs[targetIdx + 1] ? remainingArgs[targetIdx + 1] : process.cwd();

    const quiet = !verbose && !dryRun;
    const captureOpts = quiet ? { capture: true } : {};
    const runner = createScriptRunner(ctx.frameworkRoot);

    // Strip --provider/--platform and its value from filteredArgs so we can inject per-provider below
    const baseFilteredArgs: string[] = [];
    for (let i = 0; i < filteredArgs.length; i++) {
      if (filteredArgs[i] === '--provider' || filteredArgs[i] === '--platform') {
        i++; // skip the value too
        continue;
      }
      baseFilteredArgs.push(filteredArgs[i]);
    }

    // Deploy to each configured provider sequentially
    for (const provider of providers) {
      const providerFilteredArgs = [...baseFilteredArgs, '--provider', provider];

      if (quiet) {
        ui.blank();
        const providerLabel = provider === 'claude' ? 'Claude Code' : provider;
        console.log(`  ${ui.brandMark()} ${ui.bold(`Installing ${framework} framework`)}  ${ui.dimText(`for ${providerLabel}`)}`);
        ui.blank();
      }

      // Deploy main framework
      const mainResult = await runner.run('tools/agents/deploy-agents.mjs', providerFilteredArgs, captureOpts);
      if (mainResult.exitCode !== 0) {
        return mainResult;
      }

      // Build common args for addon deployments
      const addonBaseArgs = ['--deploy-commands', '--deploy-skills', '--deploy-rules',
        '--provider', provider, '--target', target];
      if (verbose) addonBaseArgs.push('--verbose');

      // Deploy aiwg-utils unless --no-utils
      if (!skipUtils) {
        if (verbose) { console.log(''); console.log('Deploying aiwg-utils addon...'); }
        const frameworkRoot = await getFrameworkRoot();
        const utilsSource = path.join(frameworkRoot, 'agentic/code/addons/aiwg-utils');
        const addonArgs = quiet
          ? ['--quiet', '--source', utilsSource, ...addonBaseArgs]
          : ['--source', utilsSource, ...addonBaseArgs];
        const utilsResult = await runner.run('tools/agents/deploy-agents.mjs', addonArgs, captureOpts);
        if (utilsResult.exitCode !== 0) return utilsResult;
      }

      // Deploy ralph addon
      if (!skipUtils) {
        if (verbose) { console.log(''); console.log('Deploying ralph addon...'); }
        const frameworkRoot = await getFrameworkRoot();
        const ralphSource = path.join(frameworkRoot, 'agentic/code/addons/ralph');
        const ralphArgs = quiet
          ? ['--quiet', '--source', ralphSource, ...addonBaseArgs]
          : ['--source', ralphSource, ...addonBaseArgs];
        const ralphResult = await runner.run('tools/agents/deploy-agents.mjs', ralphArgs, captureOpts);
        if (ralphResult.exitCode !== 0) return ralphResult;
      }

      // Register deployed extensions
      if (verbose) { console.log(''); console.log('Registering deployed extensions...'); }
      try {
        const registry = getRegistry();
        const paths = PROVIDER_PATHS[provider] || PROVIDER_PATHS.claude;
        await registerDeployedExtensions(registry, {
          agentsPath: paths.agents,
          skillsPath: paths.skills,
          commandsPath: paths.commands,
          rulesPath: paths.rules,
          provider,
          cwd: target,
        });
        if (verbose) console.log('Extension registration complete');
      } catch (error) {
        console.error('Warning: Failed to register extensions:', error instanceof Error ? error.message : String(error));
      }

      // Completion summary and next steps
      if (quiet) {
        const paths = PROVIDER_PATHS[provider] || PROVIDER_PATHS.claude;
        const counts = await countDeployedArtifacts(target, paths);
        if (counts.agents > 0) ui.deployCount('Agents', counts.agents);
        if (counts.commands > 0) ui.deployCount('Commands', counts.commands);
        if (counts.skills > 0) ui.deployCount('Skills', counts.skills);
        if (counts.rules > 0) ui.deployCount('Rules', counts.rules);
        ui.blank();
        // Only print next steps for the last provider to avoid repetition
        if (provider === providers[providers.length - 1]) {
          printNextSteps(framework as Framework, provider);
        }

        // Advisory: check .gitignore for AIWG runtime patterns
        try {
          const { checkGitignore } = await import('../../config/gitignore.js');
          const result = await checkGitignore(target);
          if (result.missingRuntime.length > 0) {
            ui.warn('Run "aiwg config gitignore --fix" to add recommended .gitignore entries');
          }
        } catch {
          // Non-critical
        }
      }

      // Update project config deployment record (#621)
      try {
        const liveConfig = await readAiwgConfig(ctx.cwd);
        if (liveConfig) {
          const frameworkRoot = await getFrameworkRoot();
          const manifestRelPath = FRAMEWORK_MANIFEST_PATHS[framework as Framework];
          const mHash = manifestRelPath
            ? await hashManifest(path.join(frameworkRoot, manifestRelPath))
            : undefined;
          const paths = PROVIDER_PATHS[provider] || PROVIDER_PATHS.claude;
          const counts = await countDeployedArtifacts(target, paths);
          const { getVersionInfo } = await import('../../channel/manager.mjs');
          const vInfo = await getVersionInfo().catch(() => ({ version: 'unknown' }));
          const version = vInfo?.version ?? 'unknown';
          updateInstalled(liveConfig, framework, provider, counts, {
            version: String(version ?? 'unknown'),
            source: 'bundled',
            manifestHash: mHash,
          });
          await writeAiwgConfig(ctx.cwd, liveConfig);
        }
      } catch {
        // Non-critical: config update failure should not block deployment
      }
    } // end provider loop

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
