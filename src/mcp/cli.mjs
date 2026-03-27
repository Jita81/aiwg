#!/usr/bin/env node

/**
 * AIWG MCP CLI
 *
 * Command-line interface for AIWG MCP server operations.
 */

import { startServer, createServer } from './server.mjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  McpServerRegistry,
  injectServers,
  SUPPORTED_PROVIDERS,
  getProviderConfigPath,
} from './registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
AIWG MCP Server

Usage:
  aiwg mcp serve [options]     Start the MCP server
  aiwg mcp install [target]    Install AIWG MCP server into a provider
  aiwg mcp info                Show server capabilities

  aiwg mcp add <name> [opts]   Define an MCP server in the registry
  aiwg mcp remove <name>       Remove a server from the registry
  aiwg mcp update <name> [opts]  Update a server definition
  aiwg mcp list                List registered MCP servers
  aiwg mcp inject [opts]       Inject servers into provider configs

Server Options (for add/update):
  --url <url>          Server URL (for http/sse types)
  --type <type>        Server type: http (default), stdio, sse
  --command <cmd>      Command to run (for stdio type)
  --args <a1,a2,...>   Command arguments (comma-separated, for stdio)
  --env <K=V,...>      Environment variables (comma-separated K=V pairs)
  --headers <K=V,...>  HTTP headers (comma-separated K=V pairs)
  --description <text> Optional description

Inject Options:
  --provider <name>    Target provider (claude-code, cursor, factory, codex, opencode, windsurf, warp)
  --all                Inject into all previously configured providers
  --servers <a,b,...>  Only inject specific servers (comma-separated names)
  --dry-run            Show what would change without writing

Serve Options:
  --transport <type>   Transport type: stdio (default), http
  --port <number>      Port for HTTP transport (default: 3100)

Examples:
  # Define MCP servers
  aiwg mcp add fortemi --url https://memory.s9.internal/mcp --type http
  aiwg mcp add gitea --url https://mcp-gitea.integrolabs.net/mcp
  aiwg mcp add mytools --type stdio --command npx --args mcp-server-mytools

  # Inject into provider configs
  aiwg mcp inject --provider claude-code
  aiwg mcp inject --provider cursor --servers fortemi,gitea
  aiwg mcp inject --all

  # Update a server URL
  aiwg mcp update fortemi --url https://new-url.internal/mcp
  aiwg mcp inject --all   # re-inject to all providers

  # List and manage
  aiwg mcp list
  aiwg mcp remove fortemi

  # Install AIWG's own MCP server
  aiwg mcp install claude
  aiwg mcp serve
  aiwg mcp info
`);
}

/**
 * Generate MCP client configuration
 */
async function generateConfig(target, projectDir = '.') {
  const homeDir = process.env.HOME || process.env.USERPROFILE;

  const configs = {
    claude: {
      path: path.join(projectDir, '.claude/settings.local.json'),
      content: {
        mcpServers: {
          aiwg: {
            command: 'aiwg',
            args: ['mcp', 'serve'],
            env: {
              AIWG_ROOT: process.env.AIWG_ROOT || '~/.local/share/ai-writing-guide'
            }
          }
        }
      }
    },
    cursor: {
      path: path.join(projectDir, '.cursor/mcp.json'),
      content: {
        mcpServers: {
          aiwg: {
            command: 'aiwg',
            args: ['mcp', 'serve']
          }
        }
      },
      merge: (existing, content) => ({
        ...existing,
        mcpServers: {
          ...(existing.mcpServers || {}),
          ...content.mcpServers
        }
      })
    },
    factory: {
      // Factory stores MCP config at user level in ~/.factory/mcp.json
      // or project level in .factory/mcp.json
      path: projectDir === '.' || projectDir === 'global'
        ? path.join(homeDir, '.factory/mcp.json')
        : path.join(projectDir, '.factory/mcp.json'),
      content: {
        mcpServers: {
          aiwg: {
            type: 'stdio',
            command: 'aiwg',
            args: ['mcp', 'serve'],
            disabled: false
          }
        }
      },
      merge: (existing, content) => ({
        ...existing,
        mcpServers: {
          ...(existing.mcpServers || {}),
          ...content.mcpServers
        }
      })
    },
    codex: {
      // Codex stores config in ~/.codex/config.toml (TOML format)
      path: path.join(homeDir, '.codex/config.toml'),
      // We generate TOML snippet to append, not JSON
      content: null,
      toml: `
# AIWG MCP Server Configuration
# Add this section to your ~/.codex/config.toml

[mcp_servers.aiwg]
command = "aiwg"
args = ["mcp", "serve"]
startup_timeout_sec = 10.0
tool_timeout_sec = 60.0
enabled_tools = [
  "workflow-run",
  "artifact-read",
  "artifact-write",
  "template-render",
  "agent-list"
]
`,
      // Custom handler for TOML
      handler: async (configPath, tomlContent) => {
        // Check if config.toml exists
        let existing = '';
        try {
          existing = await fs.readFile(configPath, 'utf-8');
        } catch {
          // File doesn't exist
        }

        // Check if AIWG MCP already configured
        if (existing.includes('[mcp_servers.aiwg]')) {
          console.log('AIWG MCP already configured in ~/.codex/config.toml');
          return true;
        }

        // Append TOML config
        const updated = existing.trimEnd() + '\n' + tomlContent.trim() + '\n';

        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, updated);
        console.log(`MCP configuration appended to: ${configPath}`);
        console.log(`\nTo use AIWG MCP server with Codex:`);
        console.log(`  1. Restart Codex CLI`);
        console.log(`  2. AIWG tools will be available via MCP`);
        return true;
      }
    },
    openai: {
      // Alias for codex
      path: path.join(homeDir, '.codex/config.toml'),
      alias: 'codex'
    },
    windsurf: {
      // Windsurf stores MCP config at ~/.codeium/windsurf/mcp_config.json
      path: path.join(homeDir, '.codeium/windsurf/mcp_config.json'),
      content: {
        mcpServers: {
          aiwg: {
            command: 'aiwg',
            args: ['mcp', 'serve']
          }
        }
      },
      merge: (existing, content) => ({
        ...existing,
        mcpServers: {
          ...(existing.mcpServers || {}),
          ...content.mcpServers
        }
      })
    },
    warp: {
      // Warp configures MCP servers via UI only (Settings > AI > MCP Servers)
      // There is no documented file-based config path
      path: null,
      content: null,
      handler: async () => {
        console.log(`Warp MCP Server Setup (UI-based)\n`);
        console.log(`Warp configures MCP servers through its UI, not config files.`);
        console.log(`\nTo add the AIWG MCP server to Warp:\n`);
        console.log(`  1. Open Warp Terminal`);
        console.log(`  2. Go to Settings > AI > MCP Servers`);
        console.log(`  3. Click "Add MCP Server"`);
        console.log(`  4. Configure:`);
        console.log(`       Name:    aiwg`);
        console.log(`       Type:    stdio`);
        console.log(`       Command: aiwg`);
        console.log(`       Args:    mcp serve`);
        console.log(`  5. Save and restart Warp\n`);
        console.log(`Alternatively, use Warp's /add-mcp slash command.`);
        return true;
      }
    },
    vscode: {
      // VS Code / Copilot stores MCP config in .vscode/mcp.json
      path: path.join(projectDir === '.' ? process.cwd() : projectDir, '.vscode/mcp.json'),
      content: {
        servers: {
          aiwg: {
            type: 'stdio',
            command: 'aiwg',
            args: ['mcp', 'serve']
          }
        }
      },
      merge: (existing, content) => ({
        ...existing,
        servers: {
          ...(existing.servers || {}),
          ...content.servers
        }
      })
    },
    copilot: {
      // Alias for vscode
      path: path.join(projectDir === '.' ? process.cwd() : projectDir, '.vscode/mcp.json'),
      alias: 'vscode'
    },
    opencode: {
      // OpenCode stores MCP config in opencode.json at project root or .opencode/
      path: projectDir === '.' || projectDir === 'global'
        ? path.join(process.cwd(), 'opencode.json')
        : path.join(projectDir, 'opencode.json'),
      content: {
        mcp: {
          aiwg: {
            type: 'local',
            command: ['aiwg', 'mcp', 'serve']
          }
        }
      },
      merge: (existing, content) => ({
        ...existing,
        mcp: {
          ...(existing.mcp || {}),
          ...content.mcp
        }
      }),
      // Custom handler to handle both JSON and JSONC formats
      handler: async (configPath, _, content, mergeFunc) => {
        // Check multiple locations for opencode config
        const locations = [
          configPath,
          path.join(path.dirname(configPath), '.opencode', 'opencode.jsonc'),
          path.join(path.dirname(configPath), '.opencode', 'opencode.json')
        ];

        let targetPath = configPath;
        let existing = {};

        // Find existing config
        for (const loc of locations) {
          try {
            const rawContent = await fs.readFile(loc, 'utf-8');
            // Strip JSONC comments for parsing
            const jsonContent = rawContent
              .replace(/\/\/.*$/gm, '')
              .replace(/\/\*[\s\S]*?\*\//g, '');
            existing = JSON.parse(jsonContent);
            targetPath = loc;
            break;
          } catch {
            // Continue to next location
          }
        }

        // Check if AIWG MCP already configured
        if (existing.mcp && existing.mcp.aiwg) {
          console.log('AIWG MCP already configured in OpenCode config');
          return true;
        }

        // Merge configuration
        const merged = mergeFunc(existing, content);

        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, JSON.stringify(merged, null, 2));
        console.log(`MCP configuration written to: ${targetPath}`);
        console.log(`\nTo use AIWG MCP server with OpenCode:`);
        console.log(`  1. Restart OpenCode`);
        console.log(`  2. AIWG tools will be available via MCP`);
        return true;
      }
    }
  };

  let config = configs[target];
  if (!config) {
    console.error(`Unknown target: ${target}`);
    console.error(`Available targets: ${Object.keys(configs).join(', ')}`);
    return false;
  }

  // Handle alias
  if (config.alias) {
    config = configs[config.alias];
  }

  // Handle custom handler (for TOML configs like Codex, or OpenCode JSON)
  if (config.handler) {
    return await config.handler(config.path, config.toml, config.content, config.merge);
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(config.path), { recursive: true });

  // Check if file exists and merge
  let existing = {};
  try {
    const content = await fs.readFile(config.path, 'utf-8');
    existing = JSON.parse(content);
  } catch {
    // File doesn't exist, start fresh
  }

  // Merge configuration using custom merge function if available
  const merged = config.merge
    ? config.merge(existing, config.content)
    : {
        ...existing,
        ...config.content,
        mcpServers: {
          ...(existing.mcpServers || {}),
          ...config.content.mcpServers
        }
      };

  await fs.writeFile(config.path, JSON.stringify(merged, null, 2));
  console.log(`MCP configuration written to: ${config.path}`);
  console.log(`\nTo use AIWG MCP server with ${target}:`);
  console.log(`  1. Restart ${target}`);
  console.log(`  2. AIWG tools and resources will be available`);

  return true;
}

/**
 * Show server capabilities
 */
async function showInfo() {
  console.log(`
AIWG MCP Server v1.0.0
Protocol Version: 2025-11-25

TOOLS:
  workflow-run      Execute AIWG workflow (phase transitions, reviews)
  artifact-read     Read artifact from .aiwg/ directory
  artifact-write    Write artifact to .aiwg/ directory
  template-render   Render AIWG template with variables
  agent-list        List available AIWG agents

RESOURCES:
  aiwg://prompts/catalog              List of prompt templates
  aiwg://templates/catalog            List of document templates
  aiwg://agents/catalog               List of available agents
  aiwg://prompts/{category}/{name}    Specific prompt template
  aiwg://templates/{fw}/{cat}/{name}  Specific document template
  aiwg://agents/{framework}/{name}    Specific agent definition

PROMPTS:
  decompose-task       Break complex task into subtasks
  parallel-execution   Identify parallelizable work
  recovery-protocol    PAUSE→DIAGNOSE→ADAPT→RETRY→ESCALATE

TRANSPORTS:
  stdio    Standard input/output (default, for local use)
  http     Streamable HTTP (for remote/containerized use)

ENVIRONMENT:
  AIWG_ROOT    Path to AIWG installation (default: ~/.local/share/ai-writing-guide)

For more information:
  https://github.com/jmagly/aiwg
`);
}

// ============================================
// Registry subcommand handlers
// ============================================

/**
 * Parse --key value pairs from args
 */
function parseFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

/**
 * Parse comma-separated key=value pairs into an object
 */
function parseKVPairs(str) {
  if (!str) return undefined;
  const result = {};
  for (const pair of str.split(',')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    result[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Handle `aiwg mcp add <name> [opts]`
 */
async function handleAdd(args) {
  const positional = args.filter(a => !a.startsWith('--'));
  const name = positional[0];

  if (!name) {
    console.error('Usage: aiwg mcp add <name> --url <url> [--type http|stdio|sse] [--command <cmd>] [--args <a,b>]');
    process.exit(1);
  }

  const type = parseFlag(args, '--type') || 'http';
  const url = parseFlag(args, '--url');
  const command = parseFlag(args, '--command');
  const argsStr = parseFlag(args, '--args');
  const envStr = parseFlag(args, '--env');
  const headersStr = parseFlag(args, '--headers');
  const description = parseFlag(args, '--description');

  if (type === 'stdio' && !command) {
    console.error('Error: --command is required for stdio type servers');
    process.exit(1);
  }
  if ((type === 'http' || type === 'sse') && !url) {
    console.error(`Error: --url is required for ${type} type servers`);
    process.exit(1);
  }

  const registry = new McpServerRegistry();
  await registry.add({
    name,
    type,
    url,
    command,
    args: argsStr ? argsStr.split(',') : undefined,
    env: parseKVPairs(envStr),
    headers: parseKVPairs(headersStr),
    description,
  });

  console.log(`Added MCP server: ${name}`);
  if (url) console.log(`  URL: ${url}`);
  if (command) console.log(`  Command: ${command}`);
  console.log(`  Type: ${type}`);
  console.log(`\nUse "aiwg mcp inject --provider <name>" to inject into a provider config.`);
}

/**
 * Handle `aiwg mcp remove <name>`
 */
async function handleRemove(args) {
  const name = args.filter(a => !a.startsWith('--'))[0];
  if (!name) {
    console.error('Usage: aiwg mcp remove <name>');
    process.exit(1);
  }

  const registry = new McpServerRegistry();
  await registry.remove(name);
  console.log(`Removed MCP server: ${name}`);
  console.log(`\nNote: This does not remove the server from provider configs.`);
  console.log(`Re-run "aiwg mcp inject --all" to update provider configs.`);
}

/**
 * Handle `aiwg mcp update <name> [opts]`
 */
async function handleUpdate(args) {
  const positional = args.filter(a => !a.startsWith('--'));
  const name = positional[0];

  if (!name) {
    console.error('Usage: aiwg mcp update <name> --url <url> [--type <type>] ...');
    process.exit(1);
  }

  const updates = {};
  const url = parseFlag(args, '--url');
  const type = parseFlag(args, '--type');
  const command = parseFlag(args, '--command');
  const argsStr = parseFlag(args, '--args');
  const envStr = parseFlag(args, '--env');
  const headersStr = parseFlag(args, '--headers');
  const description = parseFlag(args, '--description');

  if (url !== undefined) updates.url = url;
  if (type !== undefined) updates.type = type;
  if (command !== undefined) updates.command = command;
  if (argsStr !== undefined) updates.args = argsStr.split(',');
  if (envStr !== undefined) updates.env = parseKVPairs(envStr);
  if (headersStr !== undefined) updates.headers = parseKVPairs(headersStr);
  if (description !== undefined) updates.description = description;

  if (Object.keys(updates).length === 0) {
    console.error('No updates provided. Use --url, --type, --command, etc.');
    process.exit(1);
  }

  const registry = new McpServerRegistry();
  await registry.update(name, updates);
  console.log(`Updated MCP server: ${name}`);
  for (const [key, value] of Object.entries(updates)) {
    console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  }
  console.log(`\nRe-run "aiwg mcp inject --all" to propagate changes to provider configs.`);
}

/**
 * Handle `aiwg mcp list` (managed servers from registry)
 */
async function handleList() {
  const registry = new McpServerRegistry();
  const servers = await registry.list();

  if (servers.length === 0) {
    console.log('No MCP servers registered.');
    console.log('\nUse "aiwg mcp add <name> --url <url>" to add one.');
    return;
  }

  console.log(`MCP Servers (${servers.length}):\n`);

  for (const server of servers) {
    console.log(`  ${server.name}`);
    console.log(`    Type: ${server.type}`);
    if (server.url) console.log(`    URL: ${server.url}`);
    if (server.command) console.log(`    Command: ${server.command}${server.args ? ' ' + server.args.join(' ') : ''}`);
    if (server.description) console.log(`    Description: ${server.description}`);
    if (server.injectedProviders && server.injectedProviders.length > 0) {
      console.log(`    Injected into: ${server.injectedProviders.join(', ')}`);
    }
    console.log('');
  }

  console.log(`Registry: ${registry.getPath()}`);
}

/**
 * Handle `aiwg mcp inject [opts]`
 */
async function handleInject(args) {
  const provider = parseFlag(args, '--provider');
  const injectAll = args.includes('--all');
  const serversStr = parseFlag(args, '--servers');
  const dryRun = args.includes('--dry-run');
  const projectDir = parseFlag(args, '--project') || '.';

  if (!provider && !injectAll) {
    console.error('Usage: aiwg mcp inject --provider <name> [--servers a,b] [--dry-run]');
    console.error('       aiwg mcp inject --all [--dry-run]');
    console.error(`\nSupported providers: ${SUPPORTED_PROVIDERS.join(', ')}`);
    process.exit(1);
  }

  const registry = new McpServerRegistry();
  const serverFilter = serversStr ? serversStr.split(',').map(s => s.trim()) : undefined;

  let providers;
  if (injectAll) {
    // Get all previously injected providers, or all supported if none yet
    providers = await registry.getInjectedProviders();
    if (providers.length === 0) {
      console.error('No providers have been injected before. Use --provider <name> first.');
      process.exit(1);
    }
  } else {
    // Normalize provider name
    const normalized = provider === 'claude' ? 'claude-code' : provider;
    if (!SUPPORTED_PROVIDERS.includes(normalized) && normalized !== 'openai') {
      console.error(`Unknown provider: ${provider}`);
      console.error(`Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`);
      process.exit(1);
    }
    providers = [normalized];
  }

  if (dryRun) {
    console.log('[DRY RUN] Would inject servers into:');
  }

  let totalInjected = 0;

  for (const p of providers) {
    const result = await injectServers(registry, p, {
      servers: serverFilter,
      projectDir,
      dryRun,
    });

    if (result.error) {
      console.error(`  ${p}: ${result.error}`);
      continue;
    }

    const prefix = dryRun ? '[DRY RUN] ' : '';
    console.log(`${prefix}${p}: ${result.configPath}`);
    if (result.serversInjected.length > 0) {
      console.log(`  ${prefix}Injected: ${result.serversInjected.join(', ')}`);
      totalInjected += result.serversInjected.length;
    }
    if (result.alreadyPresent.length > 0) {
      console.log(`  ${prefix}Updated in place: ${result.alreadyPresent.join(', ')}`);
    }
  }

  if (!dryRun && totalInjected > 0) {
    console.log(`\nDone. Restart your provider(s) to pick up the changes.`);
  }
}

// ============================================
// Main CLI entry point
// ============================================

/**
 * Main CLI entry point
 */
export async function main(args = process.argv.slice(2)) {
  const command = args[0];
  const subArgs = args.slice(1);

  switch (command) {
    case 'serve': {
      // Parse options
      const transportIdx = args.indexOf('--transport');
      const transport = transportIdx !== -1 ? args[transportIdx + 1] : 'stdio';

      if (transport === 'http') {
        const portIdx = args.indexOf('--port');
        const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3100;
        console.error(`HTTP transport not yet implemented. Use stdio for now.`);
        console.error(`Would start on port ${port}`);
        process.exit(1);
      }

      await startServer();
      break;
    }

    case 'install': {
      // Parse install arguments (skip flags)
      const installArgs = args.slice(1).filter(a => !a.startsWith('--'));
      const target = installArgs[0] || 'claude';
      const projectDir = installArgs[1] || '.';

      // Check for --dry-run flag
      if (args.includes('--dry-run')) {
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        console.log(`[DRY RUN] Would generate MCP config for: ${target}`);
        console.log(`[DRY RUN] Target directory: ${projectDir}`);
        const configPaths = {
          claude: '.claude/settings.local.json',
          cursor: '.cursor/mcp.json',
          factory: (projectDir === '.' || projectDir === 'global')
            ? path.join(homeDir, '.factory/mcp.json')
            : path.join(projectDir, '.factory/mcp.json'),
          codex: path.join(homeDir, '.codex/config.toml'),
          openai: path.join(homeDir, '.codex/config.toml'),
          vscode: '.vscode/mcp.json',
          copilot: '.vscode/mcp.json',
          opencode: (projectDir === '.' || projectDir === 'global')
            ? 'opencode.json'
            : path.join(projectDir, 'opencode.json'),
          windsurf: path.join(homeDir, '.codeium/windsurf/mcp_config.json'),
          warp: '(UI-based — Settings > AI > MCP Servers)'
        };
        console.log(`[DRY RUN] Config file: ${configPaths[target] || 'unknown'}`);
        break;
      }

      await generateConfig(target, projectDir);
      break;
    }

    case 'info':
      await showInfo();
      break;

    case 'add':
      await handleAdd(subArgs);
      break;

    case 'remove':
    case 'rm':
      await handleRemove(subArgs);
      break;

    case 'update':
      await handleUpdate(subArgs);
      break;

    case 'list':
    case 'ls':
      await handleList();
      break;

    case 'inject':
      await handleInject(subArgs);
      break;

    case '--help':
    case '-h':
    case 'help':
      printUsage();
      break;

    default:
      if (command) {
        console.error(`Unknown command: ${command}`);
      }
      printUsage();
      process.exit(command ? 1 : 0);
  }
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
