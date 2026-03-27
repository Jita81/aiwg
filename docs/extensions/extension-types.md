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
  | 'team';        // Multi-agent team compositions
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

> **Deployment artifact.** Commands are typically generated from `skill` source files during `aiwg use` deployment. Directly authoring a command extension is an advanced pattern — prefer `aiwg add-skill` for new workflows.

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

**Primary workflow extension type.** Skills are the canonical source for all agentic workflows. During `aiwg use` deployment, AIWG deploys skills natively for platforms that support them (Claude Code, OpenCode, etc.) and generates a corresponding command file for platforms that need it (legacy or generated-command providers).

Use `aiwg add-skill` to create new skills. The `description:` frontmatter field is the primary natural-language signal Claude uses to autonomously decide when to invoke a skill — write it to describe intent, not implementation.

### SKILL.md Frontmatter Reference

| Field | Source | Purpose |
|-------|--------|---------|
| `name:` | Official | Skill name (also controls slash-command path when a command is generated) |
| `description:` | Official | **Primary NL signal** — Claude reads this at session start and matches user intent against it for autonomous invocation. Write it well. |
| `effort:` | Official | Model effort override: `1` (low), `2` (medium), `3` (high) |
| `user-invocable:` | Official | `false` = background-only; skill does not appear in `/` autocomplete |
| `disable-model-invocation:` | Official | `true` = explicit user-only; prevents autonomous invocation by the model |
| `context:` | Official | Execution isolation: `fork` (isolated context) or `inherit` (shared context) |
| `allowed-tools:` | Official | Restrict which tools the skill may use |
| `platforms:` | AIWG-internal | Multi-provider deployment targets (e.g., `claude`, `codex`, `all`) |
| `autoTrigger:` | AIWG-internal | AIWG-level auto-trigger annotation; supplements `description:` matching |
| `commandHint:` | AIWG-internal | Override the generated command's `argument-hint` frontmatter when a command is synthesized from this skill |

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

## Team Extensions

Multi-agent team compositions that work across all AIWG providers. On Claude Code, teams invoke agents natively. On all other providers, teams are emulated via `aiwg mc` (Mission Control) orchestration.

**Source format:** JSON files in `agentic/code/frameworks/*/teams/`
**Schema:** `agentic/code/frameworks/sdlc-complete/teams/schema.json`
**CLI:** `aiwg team run|list|info`

### TeamDefinition

```typescript
interface TeamDefinition {
  name: string;                             // Human-readable team name
  slug: string;                             // CLI identifier (kebab-case)
  description: string;                      // One-line purpose
  dispatch?: 'parallel' | 'sequential' | 'consensus';  // Execution mode
  agents: TeamMember[];                     // 2-8 agents
  use_cases?: string[];                     // Scenarios where team excels
  handoffs?: TeamHandoff[];                 // Inter-agent artifact passing
  sdlc_phases?: string[];                   // Active SDLC phases
  max_context_agents?: number;              // Context budget limit (2-4)
  overlap_resolution?: Record<string, string>;  // Capability conflict resolution
}

interface TeamMember {
  agent: string;                            // Agent filename without .md
  role: 'lead' | 'contributor' | 'reviewer' | 'advisor';
  responsibilities?: string[];
}

interface TeamHandoff {
  from: string;                             // Source agent
  to: string;                               // Target agent
  artifact: string;                         // What gets passed
  gate: string;                             // Quality check before handoff
}
```

### Provider Routing

| Provider | Native Teams | Fallback |
|----------|-------------|---------|
| Claude Code | Native agent dispatch | — |
| Warp, Copilot, Cursor, Windsurf, OpenCode, Factory, Codex, OpenClaw | — | `aiwg mc` orchestration |

### Built-in Teams

| Slug | Agents | Dispatch | Purpose |
|------|--------|----------|---------|
| `api-development` | 4 | sequential | API design and implementation |
| `full-stack` | 4 | sequential | Full-stack feature delivery |
| `greenfield` | 4 | sequential | New project kickoff |
| `maintenance` | 4 | sequential | Code review and bug fixing |
| `migration` | 4 | sequential | Technology migrations |
| `sdlc-review` | 4 | parallel | Phase gate validation |
| `security-review` | 3 | sequential | Security audits |

### Deployment

Teams are deployed as part of `aiwg use <framework>`. Project-local teams can be placed in `.aiwg/teams/<slug>.json` and take precedence over framework teams.

---

## See Also

- [Extension System Overview](overview.md)
- [Creating Extensions](creating-extensions.md)
- @src/extensions/types.ts - Full type definitions
- @.aiwg/architecture/unified-extension-schema.md - Complete schema
- @docs/cli-reference.md - CLI command reference
