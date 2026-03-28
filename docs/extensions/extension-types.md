# Extension Types Reference

Complete reference for all AIWG extension types and their metadata schemas.

**Source:** @src/extensions/types.ts

---

## Extension Type Discriminator

```typescript
type ExtensionType =
  | 'agent'        // AI personas with defined roles
  | 'command'      // CLI and slash commands
  | 'skill'        // Natural language workflows
  | 'hook'         // Lifecycle event handlers
  | 'tool'         // External CLI utilities
  | 'mcp-server'   // MCP protocol servers
  | 'framework'    // Complete workflow bundles
  | 'addon'        // Feature extension packs
  | 'template'     // Document templates
  | 'prompt'       // Reusable prompts
  | 'soul'         // Agent identity and character
  | 'behavior';    // Reactive capabilities with hooks
```

---

## Agent Extensions

Specialized AI personas with defined roles, tools, and workflows.

### AgentMetadata

```typescript
interface AgentMetadata {
  type: 'agent';

  role: string;                     // Agent's primary role

  model: {
    tier: 'haiku' | 'sonnet' | 'opus';
    override?: string;              // Specific model ID override
  };

  tools: string[];                  // Available tools (Read, Write, Bash, etc.)

  template?: string;                // Complexity template
  maxTools?: number;                // Tool count limit
  canDelegate?: boolean;            // Can call other agents
  readOnly?: boolean;               // No Write/Bash allowed

  workflow?: string[];              // Step-by-step process
  expertise?: string[];             // Areas of expertise
  responsibilities?: string[];      // What agent does
}
```

### Model Tiers

| Tier | When to Use | Example Models |
|------|-------------|----------------|
| **haiku** | Simple, repetitive tasks | claude-haiku-4 |
| **sonnet** | Most tasks, balanced | claude-sonnet-4-5 |
| **opus** | Complex reasoning, critical decisions | claude-opus-4-5 |

### Example

```typescript
{
  id: 'api-designer',
  type: 'agent',
  name: 'API Designer',
  description: 'Defines API styles, endpoints, and data contracts',
  version: '1.0.0',
  capabilities: ['api-design', 'interface-contracts', 'rest'],
  keywords: ['api', 'rest', 'contracts', 'interfaces'],
  category: 'sdlc/architecture',
  platforms: {
    claude: 'full',
    factory: 'full',
    cursor: 'full',
    generic: 'full'
  },
  deployment: {
    pathTemplate: '.{platform}/agents/{id}.md',
    core: false
  },
  requires: ['sdlc-complete'],
  metadata: {
    type: 'agent',
    role: 'API Design and Contract Definition',
    model: {
      tier: 'sonnet'
    },
    tools: ['Read', 'Write', 'Glob', 'Grep'],
    template: 'complex',
    canDelegate: true,
    readOnly: false,
    workflow: [
      'Define interface contracts',
      'Specify data models',
      'Design error handling',
      'Define versioning strategy',
      'Review with stakeholders'
    ],
    expertise: [
      'REST API design',
      'OpenAPI/Swagger specifications',
      'Data contract modeling',
      'API versioning strategies',
      'Performance optimization'
    ],
    responsibilities: [
      'Author interface and data contract cards',
      'Define error models, versioning, and compatibility policy',
      'Review performance, security, and observability for interfaces',
      'Coordinate with Test Engineer on integration tests'
    ]
  }
}
```

---

## Command Extensions

CLI and slash commands with argument parsing and execution logic.

### CommandMetadata

```typescript
interface CommandMetadata {
  type: 'command';

  template: 'utility' | 'transformation' | 'orchestration';

  arguments?: CommandArgument[];
  options?: CommandOption[];
  argumentHint?: string;            // For help display, e.g., "<file-path>"

  allowedTools?: string[];          // Tools this command uses
  model?: string;                   // Preferred model

  executionSteps?: string[];        // What it does
  successCriteria?: string[];       // How to verify success
}

interface CommandArgument {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean;
  position?: number;
}

interface CommandOption {
  name: string;
  description: string;
  type: 'string' | 'boolean' | 'number' | 'array';
  default?: string | boolean | number;
  short?: string;                   // e.g., "-f"
  long?: string;                    // e.g., "--fix"
}
```

### Command Templates

| Template | Purpose | Examples |
|----------|---------|----------|
| **utility** | Simple operations | status, version, doctor |
| **transformation** | Data processing | prefill-cards, validate-metadata |
| **orchestration** | Complex workflows | use, ralph, migrate-workspace |

### Example

```typescript
{
  id: 'use',
  type: 'command',
  name: 'Use',
  description: 'Install and deploy framework',
  version: '1.0.0',
  capabilities: ['cli', 'framework', 'deployment'],
  keywords: ['framework', 'install', 'deploy', 'use'],
  category: 'framework',
  platforms: {
    claude: 'full',
    copilot: 'full',
    factory: 'full',
    cursor: 'full',
    generic: 'full'
  },
  deployment: {
    pathTemplate: '.{platform}/commands/{id}.md',
    core: true
  },
  metadata: {
    type: 'command',
    template: 'orchestration',
    argumentHint: '<framework>',
    allowedTools: ['Read', 'Write', 'Bash', 'Glob'],
    arguments: [
      {
        name: 'framework',
        description: 'Framework to deploy',
        required: true,
        type: 'string',
        position: 0
      }
    ],
    options: [
      {
        name: 'provider',
        description: 'Target platform',
        type: 'string',
        default: 'claude',
        long: 'provider'
      },
      {
        name: 'force',
        description: 'Overwrite existing files',
        type: 'boolean',
        default: false,
        long: 'force'
      }
    ],
    executionSteps: [
      'Validate framework name',
      'Check dependencies',
      'Deploy framework files',
      'Register in framework registry',
      'Deploy platform-specific adaptations'
    ]
  }
}
```

---

## Skill Extensions

Natural language workflows triggered by phrases or conditions.

### SkillMetadata

```typescript
interface SkillMetadata {
  type: 'skill';

  triggerPhrases: string[];         // Natural language triggers
  autoTrigger?: boolean;            // Auto-activate on conditions
  autoTriggerConditions?: string[]; // When to auto-activate

  tools?: string[];                 // Tools this skill uses
  references?: SkillReference[];    // Reference materials

  inputRequirements?: string[];     // What input is needed
  outputFormat?: string;            // Expected output format
}

interface SkillReference {
  filename: string;
  description: string;
  path: string;
}
```

### Example

```typescript
{
  id: 'project-awareness',
  type: 'skill',
  name: 'Project Awareness',
  description: 'Comprehensive project context detection',
  version: '1.0.0',
  capabilities: ['context-awareness', 'project-detection', 'phase-tracking'],
  keywords: ['project', 'context', 'awareness', 'status', 'phase', 'sdlc'],
  category: 'sdlc/management',
  platforms: {
    claude: 'full',
    factory: 'full',
    cursor: 'experimental'
  },
  deployment: {
    pathTemplate: '.{platform}/skills/{id}/SKILL.md',
    additionalFiles: ['references/phase-guide.md'],
    core: true,
    autoInstall: true
  },
  requires: ['aiwg-utils'],
  metadata: {
    type: 'skill',
    triggerPhrases: [
      'what project is this',
      'project context',
      'what phase are we in',
      'where are we?',
      "what's next?",
      'project status'
    ],
    autoTrigger: true,
    autoTriggerConditions: ['session-start'],
    tools: ['Read', 'Bash', 'Glob'],
    references: [
      {
        filename: 'phase-guide.md',
        description: 'SDLC phase descriptions and gate criteria',
        path: 'references/phase-guide.md'
      }
    ]
  }
}
```

---

## Hook Extensions

Lifecycle event handlers for session, command, and tool events.

### HookMetadata

```typescript
interface HookMetadata {
  type: 'hook';

  event: HookEvent;                 // When to trigger
  priority?: number;                // Execution order (lower = earlier)
  canModify?: boolean;              // Can change execution context
  canBlock?: boolean;               // Can prevent execution

  configSchema?: Record<string, unknown>;
}

type HookEvent =
  | 'pre-session'     // Session start
  | 'post-session'    // Session end
  | 'pre-command'     // Before command runs
  | 'post-command'    // After command completes
  | 'pre-agent'       // Before agent invocation
  | 'post-agent'      // After agent completes
  | 'pre-write'       // Before file write
  | 'post-write'      // After file write
  | 'pre-bash'        // Before bash execution
  | 'post-bash';      // After bash completes
```

### Event Timing

| Event | Timing | Can Block | Common Uses |
|-------|--------|-----------|-------------|
| `pre-session` | Session start | No | Load context, setup state |
| `post-session` | Session end | No | Cleanup, save state |
| `pre-command` | Before command | Yes | Validation, permission checks |
| `post-command` | After command | No | Logging, notifications |
| `pre-agent` | Before agent invocation | Yes | Context injection, authorization |
| `post-agent` | After agent completes | No | Result validation, logging |
| `pre-write` | Before file write | Yes | Format checking, security review |
| `post-write` | After file write | No | Git operations, notifications |
| `pre-bash` | Before bash execution | Yes | Security checks, sandboxing |
| `post-bash` | After bash completes | No | Result validation, cleanup |

---

## Tool Extensions

External CLI utilities with discovery and verification.

### ToolMetadata

```typescript
interface ToolMetadata {
  type: 'tool';

  category: 'core' | 'languages' | 'utilities' | 'custom';
  executable: string;               // Command name

  verificationStatus?: 'verified' | 'unverified';
  lastVerified?: string;            // ISO 8601 date

  manPage?: string;                 // Manual page content
  aliases?: string[];               // Alternative names
  relatedTools?: string[];          // Similar tools

  platformNotes?: Record<string, string>;
  installHint?: string;             // How to install if missing
}
```

### Tool Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **core** | Essential tools | bash, sh, zsh |
| **languages** | Language toolchains | node, python, ruby, go |
| **utilities** | Helper tools | git, jq, curl, grep |
| **custom** | Project-specific tools | custom scripts, domain tools |

---

## MCP Server Extensions

Model Context Protocol servers with capabilities and tools.

### MCPServerMetadata

```typescript
interface MCPServerMetadata {
  type: 'mcp-server';

  mcpVersion: string;               // e.g., "1.0"
  transport: 'stdio' | 'http';
  port?: number;                    // For HTTP transport

  capabilities: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
    sampling: boolean;
    logging: boolean;
  };

  sourceType: 'cli' | 'api' | 'catalog' | 'nl' | 'extension';
  sourceCommand?: string;           // For CLI source
  sourceBaseUrl?: string;           // For API source

  workingDirectory?: string;
  environment?: Record<string, string>;

  tools?: MCPToolSummary[];
  resources?: string[];
  prompts?: string[];
}

interface MCPToolSummary {
  name: string;
  description: string;
  dangerous: boolean;
}
```

---

## Framework Extensions

Complete workflows that bundle multiple extensions.

### FrameworkMetadata

```typescript
interface FrameworkMetadata {
  type: 'framework';

  domain: string;                   // e.g., "sdlc", "marketing", "security"

  includes: {
    agents?: string[];              // Included agent IDs
    commands?: string[];            // Included command IDs
    skills?: string[];              // Included skill IDs
    hooks?: string[];               // Included hook IDs
    templates?: string[];           // Included template IDs
    prompts?: string[];             // Included prompt IDs
  };

  configSchema?: Record<string, unknown>;
  defaultConfig?: Record<string, unknown>;
}
```

### Example

```typescript
{
  id: 'sdlc-complete',
  type: 'framework',
  name: 'SDLC Complete',
  description: 'Full software development lifecycle framework',
  version: '1.0.0',
  capabilities: ['sdlc', 'agile', 'multi-agent', 'orchestration'],
  keywords: ['sdlc', 'agile', 'software', 'development'],
  category: 'sdlc',
  platforms: {
    claude: 'full',
    copilot: 'full',
    factory: 'full',
    cursor: 'full',
    generic: 'full'
  },
  deployment: {
    pathTemplate: '.aiwg/frameworks/{id}/',
    core: true
  },
  metadata: {
    type: 'framework',
    domain: 'sdlc',
    includes: {
      agents: [
        'api-designer',
        'test-engineer',
        'code-reviewer',
        // ... 35+ agents
      ],
      commands: [
        'use',
        'status',
        'prefill-cards',
        // ... all CLI commands
      ],
      skills: [
        'project-awareness',
        'phase-transition',
        'gap-detection'
      ],
      templates: [
        'use-case',
        'architecture-doc',
        'test-plan'
      ]
    }
  }
}
```

---

## Addon Extensions

Feature bundles that extend frameworks.

### AddonMetadata

```typescript
interface AddonMetadata {
  type: 'addon';

  entry: {
    agents?: string;                // Path to agent definitions
    commands?: string;              // Path to command definitions
    skills?: string;                // Path to skill definitions
    hooks?: string;                 // Path to hook definitions
    templates?: string;             // Path to template definitions
    prompts?: string;               // Path to prompt definitions
  };

  provides: {
    agents?: string[];              // IDs of provided agents
    commands?: string[];            // IDs of provided commands
    skills?: string[];              // IDs of provided skills
    hooks?: string[];               // IDs of provided hooks
    templates?: string[];           // IDs of provided templates
    prompts?: string[];             // IDs of provided prompts
  };
}
```

---

## Template Extensions

Document templates with variables and sections.

### TemplateMetadata

```typescript
interface TemplateMetadata {
  type: 'template';

  format: string;                   // e.g., "markdown", "yaml", "json"

  variables?: TemplateVariable[];
  sections?: string[];              // Section names
  targetArtifact?: string;          // e.g., "use-case", "architecture-doc"
}

interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: unknown;
}
```

---

## Prompt Extensions

Reusable prompt templates.

### PromptMetadata

```typescript
interface PromptMetadata {
  type: 'prompt';

  category: string;                 // e.g., "core", "reliability", "agents"
  purpose: string;                  // What this prompt does
  useWhen: string[];                // When to use this prompt

  variables?: string[];             // Variable names
  requiredContext?: string[];       // Required context
}
```

---

## Soul Extensions

Agent identity and character definitions based on the soul.md specification.

### SoulMetadata

```typescript
interface SoulMetadata {
  type: 'soul';

  scope: 'project' | 'agent';      // Project-wide or agent-specific
  targetAgent?: string;              // Required when scope is 'agent'

  sections: string[];               // Sections present (who-i-am, worldview, etc.)

  companions?: {
    style?: string;                  // STYLE.md path
    memory?: string;                 // MEMORY.md path
    examples?: string;               // Examples directory path
  };

  estimatedTokens?: number;          // Context budget estimate
}
```

### Soul Sections

| Section | Purpose |
|---------|---------|
| `who-i-am` | Core identity statement |
| `worldview` | Perspective and philosophy |
| `opinions` | Held positions and stances |
| `vocabulary` | Preferred and avoided language |
| `boundaries` | What this agent will/won't do |

### Example

```typescript
{
  id: 'project-soul',
  type: 'soul',
  name: 'Project Soul',
  description: 'Project-wide AI identity and character definition',
  version: '1.0.0',
  capabilities: ['identity', 'character', 'voice'],
  keywords: ['soul', 'identity', 'character', 'personality'],
  category: 'identity',
  platforms: {
    claude: 'full',
    cursor: 'full',
    generic: 'full'
  },
  deployment: {
    pathTemplate: '.{platform}/SOUL.md',
    core: false
  },
  metadata: {
    type: 'soul',
    scope: 'project',
    sections: ['who-i-am', 'worldview', 'opinions', 'vocabulary', 'boundaries'],
    companions: {
      style: 'STYLE.md',
      memory: 'MEMORY.md'
    },
    estimatedTokens: 2000
  }
}
```

---

## Behavior Extensions

Reactive capabilities with scripts, event hooks, and structured inputs. Behaviors extend beyond skills by subscribing to system events and reacting automatically. On platforms without hook support, behaviors degrade gracefully to skills (NLP triggers only).

### BehaviorMetadata

```typescript
interface BehaviorMetadata {
  type: 'behavior';

  triggerPhrases?: string[];         // NLP invocation triggers (same as skills)

  inputs?: BehaviorInput[];          // Structured, typed input parameters

  hooks?: Partial<Record<BehaviorHookEvent, BehaviorHookAction[]>>;

  scripts?: Record<string, string>;  // Logical name → relative script path

  manifest?: {
    category?: string;               // Discovery category
    requires?: {
      bins?: string[];               // Required binaries
      env?: string[];                // Required environment variables
    };
    outputs?: Array<{
      type: string;
      path: string;
    }>;
    composable_with?: string[];      // Compatible behaviors
  };
}

interface BehaviorInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'path';
  required?: boolean;
  description?: string;
  default?: string | number | boolean;
  values?: string[];                 // Allowed values (for enum type)
}

interface BehaviorHookAction {
  filter?: string;                   // Glob filter for file-based events
  tool?: string;                     // Tool name filter for on_tool_complete
  cron?: string;                     // Cron expression for on_schedule
  action: 'run_script' | 'notify' | 'log';
  script?: string;                   // Script path (relative to behavior dir)
}

type BehaviorHookEvent =
  | 'on_file_write'
  | 'on_tool_complete'
  | 'on_schedule'
  | 'on_commit'
  | 'on_pr_open'
  | 'on_deploy'
  | 'on_session_start'
  | 'on_session_end';
```

### BEHAVIOR.md File Format

Behaviors are defined as directories containing a `BEHAVIOR.md` file and an optional `scripts/` subdirectory:

```
my-behavior/
  BEHAVIOR.md          # Behavior definition (YAML frontmatter + markdown body)
  scripts/
    main.sh            # Primary script
    on-write.sh        # Hook-specific scripts
```

The `BEHAVIOR.md` file uses YAML frontmatter for structured metadata and a markdown body for LLM instructions:

```yaml
---
name: security-sentinel
version: 1.0.0
description: Continuous security monitoring with reactive scanning.
platforms: [openclaw, claude-code]

triggers:
  - "run security scan"
  - "check for vulnerabilities"

inputs:
  - name: target
    type: string
    required: true
    description: File or directory to scan
  - name: severity
    type: enum
    values: [low, medium, high, critical]
    default: medium

hooks:
  on_file_write:
    - filter: "**/*.ts"
      action: run_script
      script: scripts/lint-on-write.sh
  on_schedule:
    - cron: "*/30 * * * *"
      action: run_script
      script: scripts/periodic-audit.sh

scripts:
  main: scripts/main.sh
  lint-on-write: scripts/lint-on-write.sh
  periodic-audit: scripts/periodic-audit.sh

manifest:
  category: security
  requires:
    bins: [npm, node]
  outputs:
    - type: report
      path: .aiwg/reports/security/
  composable_with: [code-review, test-runner]
---

# Security Sentinel

When triggered via NLP, run the main security scan against the specified target.
When triggered via hooks, run the event-appropriate script automatically.
```

### Behavior Lifecycle

| Phase | Description | Trigger |
|-------|-------------|---------|
| **Deploy** | Behavior directory copied to provider target | `aiwg use` |
| **Activate** | Hooks registered with platform event system | Session/daemon start |
| **Execute** | Script runs on event match or NLP invocation | Runtime trigger |
| **Deactivate** | Hooks unregistered, resources released | Session end / `aiwg remove` |

### Provider Support Matrix

| Provider | Support | Mechanism | Hooks | NLP Triggers |
|----------|---------|-----------|-------|-------------|
| OpenClaw | Native | `~/.openclaw/behaviors/` | Full | Full |
| Claude Code | Emulated | Pre/post-tool hooks in settings | Partial | Full |
| Warp | Emulated | WARP.md behavior section | None | Full |
| Cursor | Emulated | Rules-based activation | None | Full |
| Copilot | Emulated | Instructions-based activation | None | Full |
| Windsurf | Emulated | Rules-based activation | None | Full |
| Factory AI | Emulated | Rules-based activation | None | Full |
| Codex | Emulated | Rules-based activation | None | Full |
| OpenCode | Emulated | Rules-based activation | None | Full |

On platforms without hook support, behaviors degrade to skills — only the `triggers` and markdown body are used. The `hooks` section is ignored.

### Hook Events

| Event | Fires When | Common Uses |
|-------|-----------|-------------|
| `on_file_write` | A file is written/modified | Linting, format checking |
| `on_tool_complete` | A tool finishes execution | Post-build verification |
| `on_schedule` | Cron schedule matches | Periodic audits, health checks |
| `on_commit` | A git commit is created | Pre-commit validation |
| `on_pr_open` | A pull request is opened | Code review automation |
| `on_deploy` | A deployment is triggered | Pre/post-deploy checks |
| `on_session_start` | A session begins | Context loading, greeting |
| `on_session_end` | A session ends | Cleanup, state persistence |

### Graceful Degradation

Behaviors are designed for cross-platform portability:

1. **Full support** (OpenClaw): All hooks fire, scripts execute, structured inputs work
2. **Partial support** (Claude Code): File-write and tool hooks via settings.json hook system
3. **NLP-only** (all others): Behavior degrades to a skill — triggers and markdown body only

This ensures the same `BEHAVIOR.md` file works everywhere, at the highest capability level each platform supports.

### Example

```typescript
{
  id: 'build-monitor',
  type: 'behavior',
  name: 'Build Monitor',
  description: 'Track build health with reactive monitoring',
  version: '1.0.0',
  capabilities: ['build-monitoring', 'ci', 'health-check'],
  keywords: ['build', 'monitor', 'ci', 'health'],
  category: 'build',
  platforms: {
    openclaw: 'full',
    claude: 'partial',
    generic: 'partial'
  },
  deployment: {
    pathTemplate: '.{platform}/behaviors/{id}/BEHAVIOR.md',
    additionalFiles: ['scripts/main.sh', 'scripts/post-build-check.sh']
  },
  metadata: {
    type: 'behavior',
    triggerPhrases: ['monitor build', 'check build health', 'build status'],
    inputs: [
      {
        name: 'command',
        type: 'string',
        required: false,
        description: 'Build command to run',
        default: 'npm run build'
      }
    ],
    hooks: {
      on_tool_complete: [
        { tool: 'build', action: 'run_script', script: 'scripts/post-build-check.sh' }
      ],
      on_schedule: [
        { cron: '0 */4 * * *', action: 'run_script', script: 'scripts/scheduled-build.sh' }
      ]
    },
    scripts: {
      main: 'scripts/main.sh',
      'post-build-check': 'scripts/post-build-check.sh'
    },
    manifest: {
      category: 'build',
      requires: { bins: ['node'] },
      outputs: [{ type: 'report', path: '.aiwg/reports/build/' }],
      composable_with: ['test-watcher']
    }
  }
}
```

---

## Platform Compatibility

All extensions declare platform support:

```typescript
interface PlatformCompatibility {
  claude?: PlatformSupport;
  factory?: PlatformSupport;
  cursor?: PlatformSupport;
  copilot?: PlatformSupport;
  windsurf?: PlatformSupport;
  codex?: PlatformSupport;
  opencode?: PlatformSupport;
  generic?: PlatformSupport;
  openclaw?: PlatformSupport;
}

type PlatformSupport =
  | 'full'          // Fully supported with all features
  | 'partial'       // Supported with limitations
  | 'experimental'  // Experimental support
  | 'none';         // Not supported
```

---

## Deployment Configuration

```typescript
interface DeploymentConfig {
  pathTemplate: string;             // Base path with variables
  pathOverrides?: Record<string, string>;
  additionalFiles?: string[];       // Additional files to deploy
  autoInstall?: boolean;            // Auto-install on framework deployment
  core?: boolean;                   // Core extension (always available)
}
```

**Path variables:**
- `{platform}` - Target platform (claude, copilot, etc.)
- `{id}` - Extension ID
- `{type}` - Extension type

**Path examples:**
- `.{platform}/agents/{id}.md` → `.claude/agents/api-designer.md`
- `.{platform}/commands/{id}.md` → `.github/agents/use.md`
- `.{platform}/skills/{id}/SKILL.md` → `.cursor/skills/project-awareness/SKILL.md`

---

## Validation Rules

All extensions must pass validation:

```typescript
interface ValidationRules {
  required: string[];                           // Required fields
  types: Record<string, string>;               // Field type constraints
  patterns: Record<string, string>;            // Regex patterns
  constraints: Record<string, Constraint>;     // Value constraints
  crossFieldRules: CrossFieldRule[];           // Cross-field validation
  typeSpecificRules: Record<ExtensionType, ValidationRules>;
}
```

**Required fields for all extensions:**
- `id` - Unique identifier (kebab-case)
- `type` - Extension type
- `name` - Human-readable name
- `description` - Brief description (10-500 characters)
- `version` - Semantic version
- `capabilities` - At least one capability
- `keywords` - At least one keyword
- `platforms` - At least one platform
- `deployment` - Deployment configuration
- `metadata` - Type-specific metadata

---

## See Also

- [Extension System Overview](overview.md)
- [Creating Extensions](creating-extensions.md)
- @src/extensions/types.ts - Full type definitions
- @.aiwg/architecture/unified-extension-schema.md - Complete schema
- @docs/cli-reference.md - CLI command reference
