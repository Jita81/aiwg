/**
 * Command Extension Definitions
 *
 * Defines Extension objects for all CLI commands. Maps command handlers to the
 * unified Extension schema for discovery, semantic search, and help generation.
 *
 * @implements @.aiwg/architecture/decisions/ADR-001-unified-extension-system.md
 * @architecture @.aiwg/architecture/unified-extension-schema.md
 * @source @src/cli/handlers/index.ts
 * @tests @test/unit/extensions/commands/definitions.test.ts
 * @issue #42
 */

import type { Extension, CommandMetadata } from '../types.js';

// ============================================
// Individual Command Definitions
// ============================================

// Maintenance Commands

export const helpCommand: Extension = {
  id: 'help',
  type: 'command',
  name: 'Help',
  description: 'Show all CLI commands, arguments, and usage examples',
  version: '1.0.0',
  capabilities: ['cli', 'help', 'documentation'],
  keywords: ['help', 'usage', 'commands', 'documentation'],
  category: 'maintenance',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: [],
  } satisfies CommandMetadata,
};

export const versionCommand: Extension = {
  id: 'version',
  type: 'command',
  name: 'Version',
  description: 'Show version and channel information',
  version: '1.0.0',
  capabilities: ['cli', 'version', 'info'],
  keywords: ['version', 'info', 'channel'],
  category: 'maintenance',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read'],
  } satisfies CommandMetadata,
};

export const doctorCommand: Extension = {
  id: 'doctor',
  type: 'command',
  name: 'Doctor',
  description: 'Check installation health and diagnose issues',
  version: '1.0.0',
  capabilities: ['cli', 'diagnostics', 'health-check'],
  keywords: ['doctor', 'health', 'diagnostics', 'troubleshooting'],
  category: 'maintenance',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read', 'Bash'],
  } satisfies CommandMetadata,
};

export const updateCommand: Extension = {
  id: 'update',
  type: 'command',
  name: 'Update',
  description: 'Update AIWG and re-deploy installed frameworks from registry',
  version: '1.0.0',
  capabilities: ['cli', 'update', 'maintenance', 'deploy', 'refresh'],
  keywords: ['update', 'upgrade', 'maintenance', 'refresh', 'redeploy'],
  category: 'maintenance',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Bash', 'Read'],
    argumentHint: '[--all] [--dry-run] [--provider <name>] [--skip-check]',
    executionSteps: [
      'Check for npm/git updates',
      'Read .aiwg/frameworks/registry.json',
      'Re-deploy installed frameworks',
      'Report update summary',
    ],
  } satisfies CommandMetadata,
};

export const syncCommand: Extension = {
  id: 'sync',
  type: 'command',
  name: 'Sync',
  description: 'Sync AIWG to latest version and re-deploy all frameworks to active provider',
  version: '1.0.0',
  capabilities: ['cli', 'sync', 'maintenance', 'deploy', 'self-maintenance'],
  keywords: ['sync', 'refresh', 'update', 'redeploy', 'current', 'latest'],
  category: 'maintenance',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Bash', 'Read'],
    argumentHint: '[--provider <name>] [--dry-run] [--frameworks <list>] [--channel <stable|next>] [--skip-update] [--quiet]',
    executionSteps: [
      'Detect active provider via runtime-info',
      'Check current version vs latest on channel',
      'Update package if newer available',
      'Re-deploy all installed frameworks to provider',
      'Run doctor health check',
      'Output sync summary',
    ],
  } satisfies CommandMetadata,
};

// Framework Management Commands

export const useCommand: Extension = {
  id: 'use',
  type: 'command',
  name: 'Use',
  description: 'Deploy SDLC, marketing, or writing framework (or addon) to workspace',
  version: '1.0.0',
  capabilities: ['cli', 'framework', 'deployment', 'addon'],
  keywords: ['framework', 'install', 'deploy', 'use', 'addon', 'rlm'],
  category: 'framework',
  platforms: {
    claude: 'full',
    copilot: 'full',
    factory: 'full',
    cursor: 'full',
    windsurf: 'full',
    openclaw: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<framework|addon>',
    allowedTools: ['Read', 'Write', 'Bash', 'Glob'],
    executionSteps: [
      'Validate framework name',
      'Check dependencies',
      'Deploy framework files',
      'Register in framework registry',
      'Deploy platform-specific adaptations',
    ],
  } satisfies CommandMetadata,
};

export const listCommand: Extension = {
  id: 'list',
  type: 'command',
  name: 'List',
  description: 'List installed frameworks and addons',
  version: '1.0.0',
  capabilities: ['cli', 'framework', 'query'],
  keywords: ['list', 'frameworks', 'addons', 'installed'],
  category: 'framework',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read'],
  } satisfies CommandMetadata,
};

export const removeCommand: Extension = {
  id: 'remove',
  type: 'command',
  name: 'Remove',
  description: 'Remove a framework or addon',
  version: '1.0.0',
  capabilities: ['cli', 'framework', 'uninstall'],
  keywords: ['remove', 'uninstall', 'framework', 'addon'],
  category: 'framework',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<id>',
    allowedTools: ['Read', 'Write', 'Bash'],
  } satisfies CommandMetadata,
};

// Project Setup Commands

export const newCommand: Extension = {
  id: 'new',
  type: 'command',
  name: 'New Project',
  description: 'Scaffold new project with .aiwg/ directory and templates',
  version: '1.0.0',
  capabilities: ['cli', 'project', 'scaffolding'],
  keywords: ['new', 'project', 'create', 'init', 'scaffold'],
  category: 'project',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    allowedTools: ['Read', 'Write', 'Bash'],
    executionSteps: [
      'Create .aiwg/ directory structure',
      'Deploy SDLC templates',
      'Deploy agents',
      'Initialize framework registry',
    ],
  } satisfies CommandMetadata,
};

// Workspace Management Commands

export const statusCommand: Extension = {
  id: 'status',
  type: 'command',
  name: 'Status',
  description: 'Show workspace health, installed frameworks, and artifacts',
  version: '1.0.0',
  capabilities: ['cli', 'workspace', 'status'],
  keywords: ['status', 'workspace', 'health', 'info'],
  category: 'workspace',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read', 'Bash'],
  } satisfies CommandMetadata,
};

export const migrateWorkspaceCommand: Extension = {
  id: 'migrate-workspace',
  type: 'command',
  name: 'Migrate Workspace',
  description: 'Upgrade .aiwg/ structure to support multi-framework layout',
  version: '1.0.0',
  capabilities: ['cli', 'workspace', 'migration'],
  keywords: ['migrate', 'workspace', 'migration', 'upgrade'],
  category: 'workspace',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    allowedTools: ['Read', 'Write', 'Bash'],
  } satisfies CommandMetadata,
};

export const rollbackWorkspaceCommand: Extension = {
  id: 'rollback-workspace',
  type: 'command',
  name: 'Rollback Workspace',
  description: 'Restore workspace to pre-migration state from backup',
  version: '1.0.0',
  capabilities: ['cli', 'workspace', 'rollback'],
  keywords: ['rollback', 'workspace', 'restore', 'backup'],
  category: 'workspace',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    allowedTools: ['Read', 'Write', 'Bash'],
  } satisfies CommandMetadata,
};

// MCP Commands

export const mcpCommand: Extension = {
  id: 'mcp',
  type: 'command',
  name: 'MCP',
  description: 'MCP server operations (serve, install, add, remove, update, list, inject, info)',
  version: '1.0.0',
  capabilities: ['cli', 'mcp', 'server'],
  keywords: ['mcp', 'server', 'protocol'],
  category: 'mcp',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<subcommand>',
    allowedTools: ['Read', 'Write', 'Bash'],
  } satisfies CommandMetadata,
};

// Catalog Commands

export const catalogCommand: Extension = {
  id: 'catalog',
  type: 'command',
  name: 'Catalog',
  description: 'Model catalog operations (list, info, search)',
  version: '1.0.0',
  capabilities: ['cli', 'catalog', 'models'],
  keywords: ['catalog', 'models', 'search', 'info'],
  category: 'catalog',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<subcommand>',
    allowedTools: ['Read'],
  } satisfies CommandMetadata,
};

// Skills Commands

export const skillsCommand: Extension = {
  id: 'skills',
  type: 'command',
  name: 'Skills Registry',
  description: 'Skill registry commands (search, info, list, install, publish)',
  version: '1.0.0',
  capabilities: ['cli', 'skills', 'registry', 'search', 'install', 'publish'],
  keywords: ['skills', 'registry', 'search', 'install', 'publish', 'clawhub', 'openclaw'],
  category: 'catalog',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<subcommand>',
    allowedTools: ['Read', 'Bash'],
  } satisfies CommandMetadata,
};

// Index Commands

export const indexCommand: Extension = {
  id: 'index',
  type: 'command',
  name: 'Artifact Index',
  description: 'Artifact index commands (build, query, deps, stats)',
  version: '1.0.0',
  capabilities: ['cli', 'index', 'artifacts', 'search', 'dependencies'],
  keywords: ['index', 'artifacts', 'query', 'deps', 'dependencies', 'stats', 'search'],
  category: 'index',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<subcommand> [options]',
    allowedTools: ['Read', 'Glob', 'Grep'],
  } satisfies CommandMetadata,
};

// Toolsmith Commands

export const runtimeInfoCommand: Extension = {
  id: 'runtime-info',
  type: 'command',
  name: 'Runtime Info',
  description: 'Display runtime environment, available tools, and capabilities',
  version: '1.0.0',
  capabilities: ['cli', 'toolsmith', 'discovery'],
  keywords: ['runtime', 'info', 'discovery', 'tools'],
  category: 'toolsmith',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read', 'Bash'],
  } satisfies CommandMetadata,
};

// Utility Commands

export const prefillCardsCommand: Extension = {
  id: 'prefill-cards',
  type: 'command',
  name: 'Prefill Cards',
  description: 'Auto-populate SDLC artifact metadata from team configuration',
  version: '1.0.0',
  capabilities: ['cli', 'sdlc', 'automation'],
  keywords: ['prefill', 'cards', 'sdlc', 'metadata'],
  category: 'utility',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'transformation',
    allowedTools: ['Read', 'Write'],
  } satisfies CommandMetadata,
};

export const contributeStartCommand: Extension = {
  id: 'contribute-start',
  type: 'command',
  name: 'Contribute Start',
  description: 'Initialize contribution with branch, issue tracking, and DCO',
  version: '1.0.0',
  capabilities: ['cli', 'contribution', 'workflow'],
  keywords: ['contribute', 'contribution', 'workflow'],
  category: 'utility',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    allowedTools: ['Read', 'Write', 'Bash'],
  } satisfies CommandMetadata,
};

export const validateMetadataCommand: Extension = {
  id: 'validate-metadata',
  type: 'command',
  name: 'Validate Metadata',
  description: 'Validate extension metadata against schema requirements',
  version: '1.0.0',
  capabilities: ['cli', 'validation', 'metadata'],
  keywords: ['validate', 'metadata', 'quality'],
  category: 'utility',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read'],
  } satisfies CommandMetadata,
};

// Plugin Commands

export const installPluginCommand: Extension = {
  id: 'install-plugin',
  type: 'command',
  name: 'Install Plugin',
  description: 'Install Claude Code plugin',
  version: '1.0.0',
  capabilities: ['cli', 'plugin', 'install'],
  keywords: ['install', 'plugin', 'claude'],
  category: 'plugin',
  platforms: {
    claude: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<name>',
    allowedTools: ['Read', 'Write', 'Bash'],
  } satisfies CommandMetadata,
};

export const uninstallPluginCommand: Extension = {
  id: 'uninstall-plugin',
  type: 'command',
  name: 'Uninstall Plugin',
  description: 'Uninstall Claude Code plugin',
  version: '1.0.0',
  capabilities: ['cli', 'plugin', 'uninstall'],
  keywords: ['uninstall', 'plugin', 'claude'],
  category: 'plugin',
  platforms: {
    claude: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<name>',
    allowedTools: ['Read', 'Write', 'Bash'],
  } satisfies CommandMetadata,
};

export const pluginStatusCommand: Extension = {
  id: 'plugin-status',
  type: 'command',
  name: 'Plugin Status',
  description: 'Show Claude Code plugin status',
  version: '1.0.0',
  capabilities: ['cli', 'plugin', 'status'],
  keywords: ['status', 'plugin', 'claude'],
  category: 'plugin',
  platforms: {
    claude: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read'],
  } satisfies CommandMetadata,
};

export const packagePluginCommand: Extension = {
  id: 'package-plugin',
  type: 'command',
  name: 'Package Plugin',
  description: 'Bundle plugin for Claude Code marketplace distribution',
  version: '1.0.0',
  capabilities: ['cli', 'plugin', 'packaging'],
  keywords: ['package', 'plugin', 'marketplace'],
  category: 'plugin',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<name>',
    allowedTools: ['Read', 'Write', 'Bash'],
  } satisfies CommandMetadata,
};

export const packageAllPluginsCommand: Extension = {
  id: 'package-all-plugins',
  type: 'command',
  name: 'Package All Plugins',
  description: 'Bundle all plugins for marketplace in batch operation',
  version: '1.0.0',
  capabilities: ['cli', 'plugin', 'packaging'],
  keywords: ['package', 'plugin', 'marketplace', 'all'],
  category: 'plugin',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    allowedTools: ['Read', 'Write', 'Bash'],
  } satisfies CommandMetadata,
};

// Scaffolding Commands

export const addAgentCommand: Extension = {
  id: 'add-agent',
  type: 'command',
  name: 'Add Agent',
  description: 'Add agent to addon/framework',
  version: '1.0.0',
  capabilities: ['cli', 'scaffolding', 'agent'],
  keywords: ['add', 'agent', 'scaffold', 'create'],
  category: 'scaffolding',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<name>',
    allowedTools: ['Read', 'Write'],
  } satisfies CommandMetadata,
};

export const addCommandCommand: Extension = {
  id: 'add-command',
  type: 'command',
  name: 'Add Command',
  description: 'Add command to addon/framework',
  version: '1.0.0',
  capabilities: ['cli', 'scaffolding', 'command'],
  keywords: ['add', 'command', 'scaffold', 'create'],
  category: 'scaffolding',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<name>',
    allowedTools: ['Read', 'Write'],
  } satisfies CommandMetadata,
};

export const addSkillCommand: Extension = {
  id: 'add-skill',
  type: 'command',
  name: 'Add Skill',
  description: 'Add skill to addon/framework',
  version: '1.0.0',
  capabilities: ['cli', 'scaffolding', 'skill'],
  keywords: ['add', 'skill', 'scaffold', 'create'],
  category: 'scaffolding',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<name>',
    allowedTools: ['Read', 'Write'],
  } satisfies CommandMetadata,
};

export const addBehaviorCommand: Extension = {
  id: 'add-behavior',
  type: 'command',
  name: 'Add Behavior',
  description: 'Scaffold a new behavior with BEHAVIOR.md and scripts',
  version: '1.0.0',
  capabilities: ['cli', 'scaffolding', 'behavior'],
  keywords: ['add', 'behavior', 'scaffold', 'create', 'hooks', 'reactive'],
  category: 'scaffolding',
  platforms: {
    claude: 'full',
    openclaw: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<name>',
    allowedTools: ['Read', 'Write'],
  } satisfies CommandMetadata,
};

export const addTemplateCommand: Extension = {
  id: 'add-template',
  type: 'command',
  name: 'Add Template',
  description: 'Add template to addon/framework',
  version: '1.0.0',
  capabilities: ['cli', 'scaffolding', 'template'],
  keywords: ['add', 'template', 'scaffold', 'create'],
  category: 'scaffolding',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<name>',
    allowedTools: ['Read', 'Write'],
  } satisfies CommandMetadata,
};

export const scaffoldAddonCommand: Extension = {
  id: 'scaffold-addon',
  type: 'command',
  name: 'Scaffold Addon',
  description: 'Create new addon package',
  version: '1.0.0',
  capabilities: ['cli', 'scaffolding', 'addon'],
  keywords: ['scaffold', 'addon', 'create', 'package'],
  category: 'scaffolding',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<name>',
    allowedTools: ['Read', 'Write'],
  } satisfies CommandMetadata,
};

export const scaffoldExtensionCommand: Extension = {
  id: 'scaffold-extension',
  type: 'command',
  name: 'Scaffold Extension',
  description: 'Create new extension package',
  version: '1.0.0',
  capabilities: ['cli', 'scaffolding', 'extension'],
  keywords: ['scaffold', 'extension', 'create', 'package'],
  category: 'scaffolding',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<name>',
    allowedTools: ['Read', 'Write'],
  } satisfies CommandMetadata,
};

export const scaffoldFrameworkCommand: Extension = {
  id: 'scaffold-framework',
  type: 'command',
  name: 'Scaffold Framework',
  description: 'Create new framework package',
  version: '1.0.0',
  capabilities: ['cli', 'scaffolding', 'framework'],
  keywords: ['scaffold', 'framework', 'create', 'package'],
  category: 'scaffolding',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<name>',
    allowedTools: ['Read', 'Write'],
  } satisfies CommandMetadata,
};

// Ralph Commands

export const ralphCommand: Extension = {
  id: 'ralph',
  type: 'command',
  name: 'Ralph',
  description: 'Start Ralph task execution loop',
  version: '1.0.0',
  capabilities: ['cli', 'ralph', 'orchestration'],
  keywords: ['ralph', 'loop', 'task', 'orchestration'],
  category: 'ralph',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<task-description>',
    allowedTools: ['Read', 'Write', 'Bash'],
  } satisfies CommandMetadata,
};

export const ralphStatusCommand: Extension = {
  id: 'ralph-status',
  type: 'command',
  name: 'Ralph Status',
  description: 'Show Ralph loop status',
  version: '1.0.0',
  capabilities: ['cli', 'ralph', 'status'],
  keywords: ['ralph', 'status', 'info'],
  category: 'ralph',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read'],
  } satisfies CommandMetadata,
};

export const ralphAbortCommand: Extension = {
  id: 'ralph-abort',
  type: 'command',
  name: 'Ralph Abort',
  description: 'Abort running Ralph loop',
  version: '1.0.0',
  capabilities: ['cli', 'ralph', 'control'],
  keywords: ['ralph', 'abort', 'stop', 'cancel'],
  category: 'ralph',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read', 'Write'],
  } satisfies CommandMetadata,
};

export const ralphResumeCommand: Extension = {
  id: 'ralph-resume',
  type: 'command',
  name: 'Ralph Resume',
  description: 'Resume paused Ralph loop',
  version: '1.0.0',
  capabilities: ['cli', 'ralph', 'control'],
  keywords: ['ralph', 'resume', 'continue'],
  category: 'ralph',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read', 'Write'],
  } satisfies CommandMetadata,
};

export const ralphAttachCommand: Extension = {
  id: 'ralph-attach',
  type: 'command',
  name: 'Ralph Attach',
  description: 'Attach to a running Ralph loop\'s live output stream. Press Ctrl+C to detach.',
  version: '1.0.0',
  capabilities: ['cli', 'ralph', 'control', 'monitoring'],
  keywords: ['ralph', 'attach', 'follow', 'watch', 'tail', 'output', 'stream'],
  category: 'ralph',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read'],
    argumentHint: '[--loop-id <id>]',
  } satisfies CommandMetadata,
};

export const ralphExternalCommand: Extension = {
  id: 'ralph-external',
  type: 'command',
  name: 'Ralph External',
  description: 'Crash-resilient external loop with state persistence and CI/CD integration',
  version: '1.0.0',
  capabilities: ['cli', 'ralph', 'orchestration', 'external', 'crash-recovery'],
  keywords: ['ralph', 'external', 'crash', 'recovery', 'persistent', 'background', 'cicd'],
  category: 'ralph',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Bash', 'Read', 'Write'],
    argumentHint: '"<objective>" --completion "<criteria>"',
  } satisfies CommandMetadata,
};

export const ralphMemoryCommand: Extension = {
  id: 'ralph-memory',
  type: 'command',
  name: 'Ralph Memory',
  description: 'Manage Ralph semantic memory entries (list, query, clear)',
  version: '1.0.0',
  capabilities: ['cli', 'ralph', 'memory', 'semantic'],
  keywords: ['ralph', 'memory', 'semantic', 'learning', 'list', 'query'],
  category: 'ralph',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read', 'Write'],
    argumentHint: '<list|query|clear> [options]',
  } satisfies CommandMetadata,
};

export const ralphConfigCommand: Extension = {
  id: 'ralph-config',
  type: 'command',
  name: 'Ralph Config',
  description: 'View and configure Ralph loop settings (show, set, reset, preset)',
  version: '1.0.0',
  capabilities: ['cli', 'ralph', 'configuration'],
  keywords: ['ralph', 'config', 'configuration', 'settings', 'show', 'set', 'reset'],
  category: 'ralph',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read', 'Write'],
    argumentHint: '<show|set|reset|preset> [key] [value]',
  } satisfies CommandMetadata,
};

// Mission Control Commands

export const mcCommand: Extension = {
  id: 'mc',
  type: 'command',
  name: 'Mission Control',
  description: 'Multi-loop background orchestration dashboard (start, dispatch, status, watch, stop)',
  version: '1.0.0',
  capabilities: ['cli', 'orchestration', 'ralph', 'background', 'multi-loop', 'mission-control'],
  keywords: ['mission', 'control', 'mc', 'background', 'parallel', 'orchestration', 'dispatch', 'monitor'],
  category: 'orchestration',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    allowedTools: ['Bash', 'Read', 'Write'],
    argumentHint: '<subcommand> [options]',
    executionSteps: [
      'Parse subcommand (start, dispatch, status, watch, abort, pause, resume, stop, list)',
      'Route to appropriate subcommand handler',
      'Read/write session state from .aiwg/ralph-external/mc/',
      'Display results or status dashboard',
    ],
  } satisfies CommandMetadata,
};

// Cost & Metrics Commands

export const costReportCommand: Extension = {
  id: 'cost-report',
  type: 'command',
  name: 'Cost Report',
  description: 'Generate token cost and spending report for workflows',
  version: '1.0.0',
  capabilities: ['cli', 'metrics', 'cost-tracking', 'reporting'],
  keywords: ['cost', 'report', 'tokens', 'spending', 'budget', 'metrics'],
  category: 'metrics',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read', 'Bash'],
    cliDisabled: true,
  } satisfies CommandMetadata,
};

export const costHistoryCommand: Extension = {
  id: 'cost-history',
  type: 'command',
  name: 'Cost History',
  description: 'Show historical cost data across workflow sessions',
  version: '1.0.0',
  capabilities: ['cli', 'metrics', 'cost-tracking', 'history'],
  keywords: ['cost', 'history', 'trends', 'spending', 'budget'],
  category: 'metrics',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read'],
    cliDisabled: true,
  } satisfies CommandMetadata,
};

export const metricsTokensCommand: Extension = {
  id: 'metrics-tokens',
  type: 'command',
  name: 'Metrics Tokens',
  description: 'Analyze token efficiency and compare to MetaGPT baseline',
  version: '1.0.0',
  capabilities: ['cli', 'metrics', 'token-efficiency', 'analysis'],
  keywords: ['metrics', 'tokens', 'efficiency', 'baseline', 'metagpt'],
  category: 'metrics',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    allowedTools: ['Read', 'Bash'],
    cliDisabled: true,
  } satisfies CommandMetadata,
};

// Documentation Commands

export const docSyncCommand: Extension = {
  id: 'doc-sync',
  type: 'command',
  name: 'Doc Sync',
  description: 'Synchronize documentation and code to eliminate drift with parallel audit and auto-fix',
  version: '1.0.0',
  capabilities: ['cli', 'documentation', 'synchronization', 'audit'],
  keywords: ['doc-sync', 'documentation', 'sync', 'drift', 'audit', 'reconcile'],
  category: 'documentation',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<direction> [--dry-run --scope <path> --incremental]',
    allowedTools: ['Task', 'Read', 'Write', 'Bash', 'Glob', 'Grep', 'Edit'],
    executionSteps: [
      'Parse direction and options',
      'Dispatch parallel domain auditors',
      'Run cross-reference validation',
      'Generate drift report',
      'Apply auto-fixes and Ralph refinement',
      'Validate changes',
    ],
    cliDisabled: true,
  } satisfies CommandMetadata,
};

// Code Analysis Commands

export const cleanupAuditCommand: Extension = {
  id: 'cleanup-audit',
  type: 'command',
  name: 'Cleanup Audit',
  description: 'Audit codebase for dead code, unused exports, orphaned files, and stale manifests',
  version: '1.0.0',
  capabilities: ['cli', 'analysis', 'code-quality', 'dead-code', 'cleanup'],
  keywords: ['cleanup', 'dead-code', 'unused', 'orphan', 'audit', 'depcheck'],
  category: 'maintenance',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '[--scope <path>] [--type <exports|files|deps|manifests>] [--json] [--fix] [--dry-run]',
    allowedTools: ['Bash', 'Read', 'Write', 'Glob', 'Grep'],
    executionSteps: [
      'Determine analysis scope',
      'Analyze unused exports',
      'Detect orphaned files',
      'Audit dependencies',
      'Check manifest entries',
      'Compile confidence-rated report',
    ],
    cliDisabled: true,
  } satisfies CommandMetadata,
};

// SDLC Orchestration Commands

export const sdlcAccelerateCommand: Extension = {
  id: 'sdlc-accelerate',
  type: 'command',
  name: 'SDLC Accelerate',
  description: 'End-to-end SDLC ramp-up from idea to construction-ready with automated phase transitions',
  version: '1.0.0',
  capabilities: ['cli', 'sdlc', 'orchestration', 'pipeline', 'accelerate'],
  keywords: ['sdlc-accelerate', 'accelerate', 'bootstrap', 'ramp-up', 'construction-ready', 'pipeline'],
  category: 'sdlc-orchestration',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<description> [--from-codebase <path> --resume --dry-run]',
    allowedTools: ['Task', 'Read', 'Write', 'Glob', 'TodoWrite'],
    executionSteps: [
      'Detect entry point',
      'Execute intake phase',
      'Evaluate LOM gate',
      'Execute elaboration phase',
      'Evaluate ABM gate',
      'Execute construction prep',
      'Generate Construction Ready Brief',
    ],
  } satisfies CommandMetadata,
};

// Reproducibility Commands

export const executionModeCommand: Extension = {
  id: 'execution-mode',
  type: 'command',
  name: 'Execution Mode',
  description: 'Set reproducibility mode for deterministic workflow execution',
  version: '1.0.0',
  capabilities: ['cli', 'reproducibility', 'configuration', 'execution-mode'],
  keywords: ['execution', 'mode', 'strict', 'seeded', 'reproducibility', 'determinism'],
  category: 'reproducibility',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<mode> [--seed <value>]',
    allowedTools: ['Read', 'Write'],
    cliDisabled: true,
  } satisfies CommandMetadata,
};

export const snapshotCommand: Extension = {
  id: 'snapshot',
  type: 'command',
  name: 'Snapshot',
  description: 'Capture, list, or replay workflow execution snapshots',
  version: '1.0.0',
  capabilities: ['cli', 'reproducibility', 'snapshot', 'replay'],
  keywords: ['snapshot', 'replay', 'capture', 'execution', 'reproducibility'],
  category: 'reproducibility',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<list|show|capture> [options]',
    allowedTools: ['Read', 'Write', 'Bash'],
    cliDisabled: true,
  } satisfies CommandMetadata,
};

export const checkpointCommand: Extension = {
  id: 'checkpoint',
  type: 'command',
  name: 'Checkpoint',
  description: 'Create, list, or restore workflow checkpoints for recovery',
  version: '1.0.0',
  capabilities: ['cli', 'reproducibility', 'checkpoint', 'recovery'],
  keywords: ['checkpoint', 'recovery', 'restore', 'state', 'reproducibility'],
  category: 'reproducibility',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<list|recover|create> [options]',
    allowedTools: ['Read', 'Write', 'Bash'],
    cliDisabled: true,
  } satisfies CommandMetadata,
};

export const reproducibilityValidateCommand: Extension = {
  id: 'reproducibility-validate',
  type: 'command',
  name: 'Reproducibility Validate',
  description: 'Verify workflow outputs match across multiple execution runs',
  version: '1.0.0',
  capabilities: ['cli', 'reproducibility', 'validation', 'compliance'],
  keywords: ['reproducibility', 'validate', 'verify', 'compare', 'compliance'],
  category: 'reproducibility',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<workflow-id> [--runs <count>] [--threshold <value>]',
    allowedTools: ['Read', 'Bash'],
    cliDisabled: true,
  } satisfies CommandMetadata,
};

export const behaviorCommand: Extension = {
  id: 'behavior',
  type: 'command',
  name: 'Behavior',
  description: 'Manage behavior YAML bundles that bind directives and toolsets to agent types',
  version: '1.0.0',
  capabilities: ['cli', 'behavior', 'daemon', 'configuration'],
  keywords: ['behavior', 'directive', 'toolset', 'daemon', 'ops', 'agent-type'],
  category: 'daemon',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<list|info|apply|remove> [name] [--to <agent>] [--from <agent>]',
    allowedTools: ['Read', 'Bash', 'Write'],
  } satisfies CommandMetadata,
};

export const daemonInitCommand: Extension = {
  id: 'daemon-init',
  type: 'command',
  name: 'Daemon Init',
  description: 'Initialize daemon config from a profile template (default: manager)',
  version: '1.0.0',
  capabilities: ['cli', 'daemon', 'configuration', 'scaffolding'],
  keywords: ['daemon', 'init', 'profile', 'manager', 'orchestrator', 'config'],
  category: 'daemon',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: false,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '[profile-name] [--force]',
    allowedTools: ['Bash', 'Read', 'Write'],
  } satisfies CommandMetadata,
};

// Config Commands

export const configCommand: Extension = {
  id: 'config',
  type: 'command',
  name: 'Config',
  description: 'Manage user-level AIWG configuration (get, set, list, validate, reset, path, edit)',
  version: '1.0.0',
  capabilities: ['cli', 'configuration', 'user-config', 'preferences'],
  keywords: ['config', 'configuration', 'settings', 'preferences', 'get', 'set', 'validate'],
  category: 'config',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<get|set|list|validate|reset|path|edit> [key] [value] [--config-dir <path>]',
    allowedTools: ['Read', 'Write', 'Bash'],
    executionSteps: [
      'Parse subcommand and flags',
      'Resolve config directory (AIWG_CONFIG → --config-dir → ~/.aiwg → ~/.config/aiwg)',
      'Execute subcommand operation',
      'Display results',
    ],
  } satisfies CommandMetadata,
};

// Ops Commands

export const opsCommand: Extension = {
  id: 'ops',
  type: 'command',
  name: 'Ops',
  description: 'Manage ops ecosystem — init workspaces, deploy frameworks, manage multi-repo ops suites',
  version: '1.0.0',
  capabilities: ['cli', 'ops', 'infrastructure', 'workspace', 'multi-repo'],
  keywords: ['ops', 'operations', 'init', 'workspace', 'sysops', 'devops', 'itops'],
  category: 'ops',
  platforms: {
    claude: 'full',
    generic: 'full',
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true,
  },
  metadata: {
    type: 'command',
    template: 'utility',
    argumentHint: '<init|status|use|list|push> [options]',
    allowedTools: ['Bash', 'Read', 'Write'],
    executionSteps: [
      'Parse subcommand and options',
      'Resolve ops workspace from registry',
      'Execute workspace operation',
      'Update ops registry',
      'Display results',
    ],
  } satisfies CommandMetadata,
};

// ============================================
// Aggregated Exports
// ============================================

/**
 * All command definitions (54 total)
 *
 * Organized by category:
 * - Maintenance (5): help, version, doctor, update, sync
 * - Framework (3): use, list, remove
 * - Project (1): new
 * - Workspace (3): status, migrate-workspace, rollback-workspace
 * - MCP (1): mcp
 * - Catalog (1): catalog
 * - Toolsmith (1): runtime-info
 * - Utility (3): prefill-cards, contribute-start, validate-metadata
 * - Plugin (5): install-plugin, uninstall-plugin, plugin-status, package-plugin, package-all-plugins
 * - Scaffolding (8): add-agent, add-command, add-skill, add-behavior, add-template, scaffold-addon, scaffold-extension, scaffold-framework
 * - Ralph (8): ralph, ralph-status, ralph-abort, ralph-resume, ralph-attach, ralph-external, ralph-memory, ralph-config
 * - Mission Control (1): mc
 * - Metrics (3): cost-report, cost-history, metrics-tokens
 * - Documentation (1): doc-sync
 * - Code Analysis (1): cleanup-audit
 * - SDLC Orchestration (1): sdlc-accelerate
 * - Index (1): index
 * - Reproducibility (4): execution-mode, snapshot, checkpoint, reproducibility-validate
 * - Daemon (2): behavior, daemon-init
 * - Config (1): config
 * - Ops (1): ops
 */
export const commandDefinitions: Extension[] = [
  // Maintenance (5)
  helpCommand,
  versionCommand,
  doctorCommand,
  updateCommand,
  syncCommand,

  // Framework (3)
  useCommand,
  listCommand,
  removeCommand,

  // Project (1)
  newCommand,

  // Workspace (3)
  statusCommand,
  migrateWorkspaceCommand,
  rollbackWorkspaceCommand,

  // MCP (1)
  mcpCommand,

  // Catalog (2)
  catalogCommand,
  skillsCommand,

  // Toolsmith (1)
  runtimeInfoCommand,

  // Utility (3)
  prefillCardsCommand,
  contributeStartCommand,
  validateMetadataCommand,

  // Plugin (5)
  installPluginCommand,
  uninstallPluginCommand,
  pluginStatusCommand,
  packagePluginCommand,
  packageAllPluginsCommand,

  // Scaffolding (8)
  addAgentCommand,
  addCommandCommand,
  addSkillCommand,
  addBehaviorCommand,
  addTemplateCommand,
  scaffoldAddonCommand,
  scaffoldExtensionCommand,
  scaffoldFrameworkCommand,

  // Ralph (8)
  ralphCommand,
  ralphStatusCommand,
  ralphAbortCommand,
  ralphResumeCommand,
  ralphAttachCommand,
  ralphExternalCommand,
  ralphMemoryCommand,
  ralphConfigCommand,

  // Mission Control (1)
  mcCommand,

  // Metrics (3)
  costReportCommand,
  costHistoryCommand,
  metricsTokensCommand,

  // Documentation (1)
  docSyncCommand,

  // Code Analysis (1)
  cleanupAuditCommand,

  // SDLC Orchestration (1)
  sdlcAccelerateCommand,

  // Index (1)
  indexCommand,

  // Reproducibility (4)
  executionModeCommand,
  snapshotCommand,
  checkpointCommand,
  reproducibilityValidateCommand,

  // Daemon (2)
  behaviorCommand,
  daemonInitCommand,

  // Config (1)
  configCommand,

  // Ops (1)
  opsCommand,
];

// ============================================
// Helper Functions
// ============================================

/**
 * Get command definition by ID
 *
 * @param id - Command ID
 * @returns Command definition or undefined
 */
export function getCommandDefinition(id: string): Extension | undefined {
  return commandDefinitions.find((cmd) => cmd.id === id);
}

/**
 * Get command definitions by category
 *
 * @param category - Command category
 * @returns Array of matching command definitions
 */
export function getCommandsByCategory(category: string): Extension[] {
  return commandDefinitions.filter((cmd) => cmd.category === category);
}

/**
 * Get total command count
 *
 * @returns Total number of command definitions
 */
export function getCommandCount(): number {
  return commandDefinitions.length;
}

/**
 * Get all command IDs
 *
 * @returns Array of command IDs
 */
export function getCommandIds(): string[] {
  return commandDefinitions.map((cmd) => cmd.id);
}

/**
 * Search commands by keyword
 *
 * @param keyword - Keyword to search for
 * @returns Array of matching command definitions
 */
export function searchCommandsByKeyword(keyword: string): Extension[] {
  const lowercaseKeyword = keyword.toLowerCase();
  return commandDefinitions.filter((cmd) =>
    cmd.keywords.some((k) => k.toLowerCase().includes(lowercaseKeyword))
  );
}

/**
 * Search commands by capability
 *
 * @param capability - Capability to search for
 * @returns Array of matching command definitions
 */
export function searchCommandsByCapability(capability: string): Extension[] {
  const lowercaseCapability = capability.toLowerCase();
  return commandDefinitions.filter((cmd) =>
    cmd.capabilities.some((c) => c.toLowerCase().includes(lowercaseCapability))
  );
}
