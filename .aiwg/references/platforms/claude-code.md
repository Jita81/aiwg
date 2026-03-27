# Claude Code Reference

> **AIWG Primary Platform** - Authoritative reference for Claude Code features, configuration, and integration patterns.

**Last Updated**: 2026-03-27
**Claude Code Version**: v2.1.33
**Coverage**: v2.0.73 through v2.1.33
**Maintainer**: AIWG Team

---

## Quick Reference

| Resource | Link |
|----------|------|
| Official Docs | https://docs.anthropic.com/en/docs/claude-code |
| GitHub | https://github.com/anthropics/claude-code |
| CLI Reference | https://docs.anthropic.com/en/docs/claude-code/cli-reference |
| Agent SDK | https://docs.anthropic.com/en/docs/agents/agent-sdk |
| MCP Spec | https://modelcontextprotocol.io |
| Platform Console | https://platform.claude.com |

---

## 1. Core Architecture

### 1.1 Tool Suite

Claude Code provides built-in tools for development operations:

| Tool | Purpose | Example |
|------|---------|---------|
| **Read** | View file/PDF/image contents | `Read file.ts`, `Read doc.pdf pages: "1-5"` |
| **Write** | Create/overwrite files | `Write new content to file.ts` |
| **Edit** | Precise string replacements | `Edit old_string → new_string in file.ts` |
| **MultiEdit** | Multiple edits in one call | Batch edits across a file |
| **Bash** | Execute shell commands | `npm test`, `git status` |
| **Glob** | Find files by pattern | `**/*.ts`, `src/**/*.md` |
| **Grep** | Search file contents (ripgrep) | `function authenticate` |
| **Task** | Spawn subagents | Background/foreground agent tasks |
| **TaskOutput** | Read background task results | Check on running agents |
| **TaskStop** | Stop background tasks | Cancel long-running operations |
| **TaskCreate** | Create tracked tasks | Task management with dependencies |
| **TaskUpdate** | Update/complete/delete tasks | Status tracking |
| **TaskGet** | Read task details | Full description and dependencies |
| **TaskList** | List all tasks | Overview of pending/in-progress work |
| **WebSearch** | Internet search | Research external APIs |
| **WebFetch** | Fetch web content | Download pages/docs |
| **NotebookEdit** | Edit Jupyter notebooks | Modify .ipynb cells |
| **ToolSearch** | Discover deferred MCP tools | Find and load MCP tools on demand |
| **AskUserQuestion** | Prompt user for input | Clarify requirements |
| **EnterPlanMode** | Start planning workflow | Architecture planning |
| **ExitPlanMode** | Complete planning | Submit plan for approval |
| **CronCreate** | Schedule recurring/one-shot prompts | Periodic health checks, reminders |
| **CronDelete** | Cancel a scheduled cron job | Remove scheduled task |
| **CronList** | List active cron jobs | View all scheduled tasks |
| **RemoteTrigger** | Manage cloud-hosted scheduled agents | Persistent triggers via claude.ai API |

**Read Tool Enhancements** (v2.1.30):
- `pages` parameter for PDFs: `Read doc.pdf pages: "1-5"` (max 20 pages per request)
- Large PDFs (>10 pages) return lightweight reference when @-mentioned
- Reads images (PNG, JPG) as visual content
- Reads Jupyter notebooks with all cells and outputs
- Max 100 pages, 20MB file size

**LSP Tool** (v2.0.74):
- Language Server Protocol integration for code intelligence
- Go-to-definition, find references, hover documentation
- Works with language servers that support LSP

### 1.2 Model Options

| Model | ID | Best For | Context | Notes |
|-------|-----|----------|---------|-------|
| **Opus 4.6** | `claude-opus-4-6` | Complex reasoning, architecture | 200K | Most capable (v2.1.32+) |
| **Sonnet 4.5** | `claude-sonnet-4-5-20250929` | Daily coding, implementation | 200K | Fast, cost-effective |
| **Haiku 4.5** | `claude-haiku-4-5-20251001` | Quick tasks, simple queries | 200K | Fastest, cheapest |

**Model Switching**:
```bash
# At startup
claude --model opus-4-6

# During session
/model opus-4-6

# Environment variable
export ANTHROPIC_MODEL=opus-4-6

# In settings
{ "model": "opus-4-6" }
```

### 1.3 Built-in Commands

| Command | Action | Since |
|---------|--------|-------|
| `/help` | Show available commands | - |
| `/clear` | Clear conversation history | - |
| `/compact` | Summarize to free context | - |
| `/context` | Visualize context usage (grouped by source, token counts) | Enhanced v2.0.74 |
| `/model <name>` | Switch model mid-session (executes immediately) | - |
| `/config` | Open configuration panel (with search filtering) | Enhanced v2.1.6 |
| `/doctor` | Check installation health (unreachable rule detection, update channel) | Enhanced v2.1.3, v2.1.6 |
| `/debug` | Troubleshoot current session | v2.1.30 |
| `/sandbox` | Manage sandbox mode (shows dependency status) | Enhanced v2.1.20 |
| `/stats` | View usage statistics (date range filtering with `r` key) | Enhanced v2.1.6 |
| `/rename` | Rename current session | - |
| `/tag` | Tag current session | - |
| `/resume` | Resume a previous session | - |
| `/tasks` | View/manage background tasks | v2.1.16 |
| `/plugins` | Manage plugins (discover, installed) | v2.1.14 |
| `/theme` | Theme picker (Ctrl+T toggles syntax highlighting) | Enhanced v2.0.74 |
| `/terminal-setup` | Configure terminal (Kitty, Alacritty, Zed, Warp) | v2.0.74 |
| `/copy` | Copy content to clipboard | v2.1.20 |
| `/feedback` | Submit feedback (opens GitHub issue) | - |
| `/mcp` | MCP server management | - |
| `/skills` | Browse available skills (shows plugin name) | Enhanced v2.1.33 |

---

## 2. Configuration System

### 2.1 File Hierarchy (Precedence Order)

```
~/.claude/settings.json                    # User-wide (all projects)
    ↓
~/.claude/CLAUDE.md                        # User-wide instructions
    ↓
<project>/.claude/settings.json            # Project-wide (version controlled)
    ↓
<project>/.claude/settings.local.json      # Local overrides (gitignored)
    ↓
<project>/CLAUDE.md                        # Project instructions
    ↓
<project>/.mcp.json                        # MCP server configuration
```

**Additional CLAUDE.md Loading** (v2.1.20):
- CLAUDE.md files from `--add-dir` directories are loaded when `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` is set
- External imports require approval dialog showing which files are being imported

### 2.2 CLAUDE.md Purpose

The `CLAUDE.md` file provides project context loaded into every conversation:

```markdown
# Project Name

## Architecture
- Backend: Node.js/Express
- Frontend: React/TypeScript
- Database: PostgreSQL

## Development Commands
- `npm test` - Run test suite
- `npm run build` - Production build
- `npm run lint` - Code linting

## Conventions
- Use TypeScript strict mode
- Prefer functional components
- Follow conventional commits
```

**Placement Options**:
- Repository root (team-shared via git)
- Parent directories (monorepo setups)
- `~/.claude/CLAUDE.md` (personal, all projects)
- Additional directories via `--add-dir` (with env var)

### 2.3 settings.json Structure

```json
{
  "model": "opus-4-6",
  "permissions": {
    "allow": [
      "Read(./**)",
      "Write(./**)",
      "Bash(git:*)",
      "Bash(npm:*)"
    ],
    "deny": [
      "Read(.env)",
      "Read(./**/secrets/**)",
      "Bash(rm -rf:*)"
    ]
  },
  "environment": {
    "NODE_ENV": "development"
  },
  "plansDirectory": ".claude/plans",
  "spinnerVerbs": ["Thinking", "Analyzing", "Processing"],
  "showTurnDuration": true,
  "reducedMotion": false
}
```

### 2.4 Permission Syntax

| Pattern | Meaning | Example |
|---------|---------|---------|
| `Tool(pattern)` | Exact match | `Bash(npm test)` |
| `Tool(prefix:*)` | Prefix match | `Bash(git:*)` |
| `Tool(*)` or `Tool` | All variants (equivalent) | `Read(*)` = `Read` |
| `Tool(./**)` | Glob pattern | `Write(./**/*.ts)` |

**Permission Precedence** (v2.1.27):
Content-level `ask` overrides tool-level `allow`. Example: `allow: ["Bash"]` with `ask: ["Bash(rm *)"]` will now prompt for `rm` commands.

**Unreachable Rule Detection** (v2.1.3):
`/doctor` warns about permission rules that can never match, showing the source of each rule with actionable fix guidance.

### 2.5 Environment Variables

| Variable | Purpose | Since |
|----------|---------|-------|
| `ANTHROPIC_MODEL` | Override default model | - |
| `CLAUDE_CODE_TMPDIR` | Custom temp directory for internal files | v2.1.5 |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | Disable background tasks and Ctrl+B | v2.1.4 |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` | Disable experimental features | v2.1.25 |
| `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` | Load CLAUDE.md from --add-dir | v2.1.20 |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | Enable agent teams (set to 1) | v2.1.32 |
| `CLAUDE_CODE_ENABLE_TASKS` | Toggle task system (set false to disable) | v2.1.19 |
| `FORCE_AUTOUPDATE_PLUGINS` | Force plugin auto-update even when main auto-updater disabled | v2.1.2 |

---

## 3. Agents and Subagents

### 3.1 Agent Definition

Agents are markdown files with YAML frontmatter in `.claude/agents/`:

```markdown
---
name: "Code Reviewer"
description: "Reviews code for quality and security"
model: "sonnet"
tools:
  allow:
    - Read
    - Grep
    - Task(Explore)
  deny:
    - Write
    - Bash
memory: project
---

# Code Reviewer

You are an expert code reviewer. Examine code for:
- Security vulnerabilities (OWASP Top 10)
- Performance issues
- Code quality and maintainability
- Best practice violations

Provide specific, actionable feedback with line references.
```

### 3.2 Agent Configuration Options

| Field | Type | Description | Since |
|-------|------|-------------|-------|
| `name` | string | Display name | - |
| `description` | string | When to invoke | - |
| `model` | string | Model to use (opus, sonnet, haiku) | - |
| `tools.allow` | array | Permitted tools | - |
| `tools.deny` | array | Forbidden tools | - |
| `tools` | array | Alternative syntax (with `Task(agent_type)` restriction) | v2.1.33 |
| `allowed_tools` | array | Legacy syntax for tools | - |
| `skills` | array | Skills to auto-load for this agent | v2.0.43 |
| `permissionMode` | string | Permission tier for agent | v2.0.43 |
| `memory` | string | Persistent memory scope: `user`, `project`, or `local` | v2.1.33 |

**Sub-Agent Type Restriction** (v2.1.33):
Use `Task(agent_type)` syntax in tools to restrict which sub-agents can be spawned:
```yaml
tools:
  allow:
    - Read
    - Grep
    - Task(Explore)      # Can only spawn Explore subagents
    - Task(Bash)         # Can only spawn Bash subagents
```

**Agent Memory** (v2.1.33):
The `memory` frontmatter field gives agents persistent memory across sessions:
```yaml
memory: project    # Scoped to current project
memory: user       # Scoped to user (across projects)
memory: local      # Scoped to local machine
```

### 3.3 Agent Teams (Experimental, v2.1.32)

Multi-agent collaboration where multiple Claude Code instances coordinate as a team. **Research preview** — requires opt-in and is token-intensive.

#### 3.3.1 Enabling Agent Teams

```bash
# Environment variable (required)
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Then start Claude Code normally
claude --agent team-lead
```

#### 3.3.2 Architecture

Agent Teams uses **tmux sessions** as the coordination layer:

```
┌─────────────────────────────────────────────┐
│                  tmux session                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Agent A   │  │ Agent B   │  │ Agent C   │  │
│  │ (Lead)    │  │ (Impl)    │  │ (Review)  │  │
│  │           │  │           │  │           │  │
│  │ SendMsg ──┼──┼→ receives │  │           │  │
│  │           │  │ SendMsg ──┼──┼→ receives │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│          ↕ TeammateIdle / TaskCompleted      │
└─────────────────────────────────────────────┘
```

- Each agent runs in its own tmux pane with full Claude Code capabilities
- Agents communicate via **SendMessage** — addressing each other by agent ID or name
- The orchestrating agent can spawn teammates and assign them tasks
- All agents share the same filesystem (working directory)

#### 3.3.3 Hook Events for Coordination

Two hook events enable reactive multi-agent workflows:

| Event | Fires When | Use Case |
|-------|-----------|----------|
| `TeammateIdle` | A team member finishes work and has no pending tasks | Assign next task, check if all work complete |
| `TaskCompleted` | A background task completes | Trigger dependent tasks, aggregate results |

**Hook Configuration Example**:
```json
{
  "hooks": {
    "TeammateIdle": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Agent idle — check task queue'"
          }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Task done — notify orchestrator'"
          }
        ]
      }
    ]
  }
}
```

#### 3.3.4 Token Cost Implications

Agent Teams is **significantly more expensive** than single-agent workflows:

| Factor | Impact |
|--------|--------|
| Multiple context windows | Each agent maintains its own context (200K per agent) |
| Message passing overhead | SendMessage contents consume tokens in both sender and receiver |
| Coordination overhead | Orchestrator tracks all agents' state |
| Parallel execution | Multiple agents running simultaneously = multiplicative cost |

**When to use Agent Teams**:
- Complex multi-file refactoring where agents work on different modules simultaneously
- Review workflows where implementation and review happen in parallel
- Long-running tasks where one agent monitors while another implements

**When NOT to use Agent Teams**:
- Sequential tasks (use regular Task tool instead — one agent at a time)
- Simple code changes (single agent is sufficient)
- Cost-sensitive workflows (use subagents via Task tool which share the parent's billing)

#### 3.3.5 AIWG Integration Patterns

AIWG's SDLC framework relies heavily on multi-agent team processes (Primary Author → Parallel Reviewers → Synthesizer → Archive). Agent Teams enables these as true concurrent workflows on Claude Code:

**Pattern: SDLC Document Generation Team**
```
Lead Agent (orchestrator)
  ├── Spawn: architecture-designer (Primary Author → draft SAD)
  ├── Wait: TeammateIdle
  ├── Spawn: security-architect (Reviewer 1)
  ├── Spawn: test-architect (Reviewer 2)
  ├── Spawn: requirements-analyst (Reviewer 3)
  ├── Wait: All TeammateIdle
  └── Spawn: documentation-synthesizer (Merge reviews → final)
```

**Pattern: Parallel Issue Processing**
```
Lead Agent (address-issues orchestrator)
  ├── Spawn: Agent A → work on issue #17
  ├── Spawn: Agent B → work on issue #18
  ├── Spawn: Agent C → work on issue #19
  └── Coordinate via TeammateIdle events
```

**Team Cache Pattern**: Agent Teams shares the filesystem, so AIWG's `.aiwg/working/` directory serves as a **team-visible scratchpad**:
- Primary author writes draft to `.aiwg/working/architecture/sad/drafts/v0.1.md`
- Reviewers read from the same path and write reviews to `.aiwg/working/architecture/sad/reviews/`
- Synthesizer reads all reviews and produces final output

#### 3.3.6 Cross-Platform Considerations

Agent Teams is Claude Code-specific. For other platforms, AIWG provides equivalent patterns:

| Platform | Coordination Mechanism | Shared State |
|----------|----------------------|--------------|
| **Claude Code** | Agent Teams (tmux + SendMessage) | Filesystem (`.aiwg/working/`) |
| **Other platforms** | Sequential Task tool calls | `.aiwg/working/` directory |
| **External orchestration** | Ralph-external loop | `.aiwg/ralph-external/` state files |

The `.aiwg/working/` directory is the **platform-agnostic team cache** — all agents write intermediate artifacts there regardless of whether they run in parallel (Agent Teams) or sequentially (Task tool). This ensures AIWG workflows produce identical results across platforms, even when the coordination mechanism differs.

#### 3.3.7 Limitations

- **Experimental**: API and behavior may change without notice
- **tmux dependency**: Requires tmux installed on the host system
- **No Windows support**: tmux is Linux/macOS only
- **Context isolation**: Each agent has its own context window — no shared memory beyond the filesystem
- **No direct tool sharing**: Agents cannot share MCP connections or tool state
- **Cost**: Significantly higher than single-agent or sequential Task tool patterns

### 3.4 Invoking Agents

```bash
# Via --agent CLI flag
claude --agent code-reviewer

# Resume preserves --agent setting (v2.1.32)
claude --resume  # Re-uses previous --agent

# In Claude Code session via Task tool
# Claude automatically routes to appropriate agents
```

### 3.5 Built-in Agent Types (via Task tool)

Claude Code ships 5 built-in subagent types, always available regardless of project configuration. AIWG-deployed agents from `.claude/agents/` are loaded alongside these and appear in the same `subagent_type` list.

| Agent Type | Purpose | Tools | Notes |
|------------|---------|-------|-------|
| `general-purpose` | Flexible multi-step tasks | All tools (including Agent) | Most capable, most expensive. Can spawn sub-subagents. |
| `Explore` | Fast codebase exploration | Read, Glob, Grep | No Edit/Write/Agent. Supports thoroughness: "quick", "medium", "very thorough". |
| `Plan` | Implementation planning | Read, Glob, Grep | No Edit/Write/Agent. Returns step-by-step plans with trade-offs. |
| `claude-code-guide` | Claude Code, Agent SDK, and API help | Glob, Grep, Read, WebFetch, WebSearch | Answers "How do I...", "Does Claude support..." questions. Has web access. |
| `statusline-setup` | Status line configuration | Read, Edit | Niche — only for configuring the status line display. |

**Resolution**: Claude Code resolves AIWG agents by both filename (`architecture-designer`) and display name (`Architecture Designer`). Both forms work as `subagent_type` values.

**Audit**: See `.aiwg/references/platforms/claude-code-subagent-audit.md` for the full catalog of built-in vs. AIWG-deployed types (#572).

### 3.6 Worktree Isolation for Parallel Agent Work

The Agent tool supports `isolation: "worktree"` which creates a **temporary git worktree** so the agent works on an isolated copy of the repository. This prevents file conflicts when multiple agents work in parallel.

#### 3.6.1 How It Works

```
Main working tree (shared)
  │
  ├── Agent A (default, no isolation)
  │   └── Edits files directly in main tree
  │
  ├── Agent B (isolation: "worktree")
  │   └── Gets own copy at /tmp/.worktrees/branch-abc/
  │       ├── Full repo copy (git worktree)
  │       ├── Own branch (auto-created)
  │       └── Changes isolated from main tree
  │
  └── Agent C (isolation: "worktree")
      └── Gets own copy at /tmp/.worktrees/branch-def/
```

**Invocation**:
```python
Agent(
    subagent_type="software-implementer",
    description="Fix authentication bug",
    prompt="Fix the token refresh issue in src/auth/token.ts",
    isolation="worktree"
)
```

#### 3.6.2 Return Values

When a worktree agent completes, its result includes:
- **Worktree path**: The filesystem path where changes were made
- **Branch name**: The git branch containing the changes

If the agent made **no changes**, the worktree is automatically cleaned up (deleted). If changes were made, the worktree and branch are **preserved** so the caller can review and merge.

#### 3.6.3 When to Use Worktree Isolation

| Scenario | Use Worktree? | Reason |
|----------|--------------|--------|
| Single agent editing files | No | No conflict risk |
| Multiple agents editing **different** files | Maybe | Safe without isolation if files don't overlap |
| Multiple agents editing **same** files | **Yes** | Prevents write conflicts and race conditions |
| Branch-per-issue workflows | **Yes** | Each issue gets its own clean branch |
| Exploratory/experimental changes | **Yes** | Easy to discard if approach doesn't work |
| Read-only research agents | No | No file changes to conflict |

#### 3.6.4 AIWG Integration Patterns

**Pattern: Branch-Per-Issue with `/address-issues`**

The `--branch-per-issue` flag in `/address-issues` maps directly to worktree isolation:

```python
# For each issue, spawn an isolated agent
for issue in issues:
    Agent(
        subagent_type="software-implementer",
        description=f"Fix issue #{issue.number}",
        prompt=f"Read issue #{issue.number} and implement the fix...",
        isolation="worktree"  # Each issue gets its own branch
    )
```

Each agent works in its own worktree, creates commits on its own branch, and the orchestrator can then create PRs from each branch.

**Pattern: Parallel Ralph Loop Processing**

When processing multiple independent issues in parallel via Ralph loops:

```
Orchestrator
  ├── Agent (worktree) → Issue #17 → branch: fix/issue-17
  ├── Agent (worktree) → Issue #18 → branch: fix/issue-18
  └── Agent (worktree) → Issue #19 → branch: fix/issue-19

After completion:
  git merge fix/issue-17  (or create PR)
  git merge fix/issue-18
  git merge fix/issue-19
```

**Pattern: Safe Exploration**

For experimental approaches where the agent might need to be rolled back:

```python
result = Agent(
    subagent_type="architecture-designer",
    description="Prototype new auth approach",
    prompt="Try implementing OAuth2 PKCE flow...",
    isolation="worktree"
)
# If result looks good, merge the worktree branch
# If not, the worktree is just abandoned
```

#### 3.6.5 Conflict Resolution

When merging worktree branches back to main:

1. **No conflicts**: Fast-forward or clean merge — automatic
2. **Merge conflicts**: Resolve manually or spawn a dedicated agent:
   ```python
   Agent(
       subagent_type="debugger",
       description="Resolve merge conflicts",
       prompt="Merge branch fix/issue-17 into main, resolving conflicts..."
   )
   ```
3. **Semantic conflicts**: Changes compile but break tests — run test suite after merge

**Best practice**: Run worktree agents on truly independent code areas to minimize conflict risk. Use the issue's scope (module, file paths) to determine if worktree isolation is necessary.

#### 3.6.6 Limitations

- **Disk space**: Each worktree is a full copy of the repo (hard-linked, but still)
- **Build state**: Worktrees don't share `node_modules/`, build caches, or `.aiwg/working/` — agents may need to rebuild
- **No shared state**: Worktree agents can't see each other's in-progress changes
- **Git requirement**: Only works in git repositories
- **Merge overhead**: Multiple worktree branches need manual or automated merging

---

## 4. Skills and Commands

### 4.1 Unified Skill Model (v2.1.3)

Slash commands and skills have been **merged into a single concept**. Both live in `.claude/commands/` or `.claude/skills/` with no behavioral difference.

```markdown
---
name: "run-tests"
description: "Run test suite with coverage"
---

Run the complete test suite:
```bash
npm test -- --coverage
```

Generate coverage report and display summary.

Arguments: $ARGUMENTS
```

### 4.2 Skill Features

| Feature | Details |
|---------|---------|
| **Arguments** | `$ARGUMENTS` for full args, `$ARGUMENTS[0]`, `$ARGUMENTS[1]` for indexed (v2.1.19) |
| **Auto-load** | Skills from `--add-dir` directories loaded automatically (v2.1.32) |
| **Nested discovery** | Skills from nested `.claude/skills/` in subdirectories auto-discovered (v2.1.6) |
| **Context budget** | Skill descriptions scale with context window (2% of context, v2.1.32) |
| **Session ID** | `${CLAUDE_SESSION_ID}` substitution available in skills (v2.1.9) |
| **Permissions** | Skills without additional permissions/hooks allowed without approval (v2.1.19) |
| **Plugin attribution** | Plugin name shown in skill descriptions and `/skills` menu (v2.1.33) |

### 4.3 Skill Configuration

```markdown
---
name: "security-review"
description: "Performs security audit on code changes"
agent: "security-auditor"
---

# Security Review Skill

Analyze code for:
1. Input validation issues
2. Authentication/authorization flaws
3. Injection vulnerabilities
4. Sensitive data exposure
```

---

## 5. Plugin System (v2.1.14+)

### 5.1 Overview

Plugins extend Claude Code with marketplace-distributed capabilities.

### 5.2 Plugin Management

```bash
# Discover plugins
/plugins                    # Opens plugin management UI

# Install from marketplace
/plugin install sdlc@aiwg   # Install specific plugin

# Pin to specific version
# Marketplace entries can pin to git commit SHAs

# List installed
/plugin list                # Unified view with scope-based grouping (v2.1.2)

# Auto-update
# Set FORCE_AUTOUPDATE_PLUGINS=1 to force updates
```

### 5.3 VSCode Plugin Support (v2.1.16)

Native plugin management in VS Code extension, including discovery and installation.

---

## 6. Task Management (v2.1.16+)

### 6.1 Overview

Built-in task tracking with dependency management for complex workflows.

### 6.2 Task Tools

| Tool | Purpose |
|------|---------|
| `TaskCreate` | Create new tasks with subject, description, activeForm |
| `TaskUpdate` | Update status, add dependencies, delete tasks (v2.1.20) |
| `TaskGet` | Retrieve full task details including dependencies |
| `TaskList` | List all tasks with status summary |
| `TaskStop` | Stop running background tasks (shows description, v2.1.30) |

### 6.3 Task Features

- **Dependency tracking**: `blocks` and `blockedBy` relationships between tasks
- **Status workflow**: `pending` → `in_progress` → `completed` (or `deleted`)
- **Background tasks**: Ctrl+B to background a running task
- **Task notifications**: Inline display of agent responses (capped at 3 lines, v2.1.20)
- **Task IDs**: No longer reused after deletion (v2.1.21)
- **Dynamic display**: Task list adjusts visible items based on terminal height (v2.1.20)

### 6.4 Token Metrics (v2.1.30)

Task tool results include token count, tool uses, and duration metrics for cost tracking.

### 6.5 Scheduled Agents and Remote Triggers

Claude Code supports two mechanisms for automated, time-based agent execution: **session-local cron jobs** (CronCreate) and **cloud-hosted remote triggers** (RemoteTrigger).

#### 6.5.1 Session-Local Cron Jobs (CronCreate/CronDelete/CronList)

Schedule prompts to execute on a cron schedule within the current Claude Code session.

**CronCreate** — Schedule a recurring or one-shot task:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cron` | string | Yes | Standard 5-field cron expression (minute hour day-of-month month day-of-week) in **local timezone** |
| `prompt` | string | Yes | The prompt to execute at each fire time |
| `recurring` | boolean | No | `true` (default) = fire on every match until deleted. `false` = fire once then auto-delete. |
| `durable` | boolean | No | `true` = persist to `.claude/scheduled_tasks.json` and survive restarts. `false` (default) = in-memory only. |

**Cron Expression Format** (5-field, local timezone):
```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

**Examples**:
```
*/5 * * * *      Every 5 minutes
7 * * * *        Every hour at :07 (avoid :00 mark)
57 8 * * *       Daily at ~9am (avoid :00 mark)
3 9 * * 1-5      Weekdays at ~9am
0 12 1 * *       1st of each month at noon
```

**Best Practice**: Avoid minute 0 and 30 to reduce API load spikes. Pick an off-minute (e.g., `57 8` instead of `0 9`) unless the user specifies an exact time.

**Runtime Behavior**:
- Jobs only fire while the REPL is **idle** (not mid-query)
- Small deterministic jitter is added automatically (up to 10% of period, max 15 min)
- Recurring tasks **auto-expire after 7 days** — they fire one final time, then are deleted
- Non-durable jobs are lost when the Claude session ends

**CronDelete** — Cancel a scheduled job:
```
CronDelete(id: "job-id-from-create")
```

**CronList** — List all active cron jobs:
```
CronList()  # No parameters — returns all jobs in current session
```

#### 6.5.2 Remote Triggers (RemoteTrigger)

Cloud-hosted scheduled agents that run independently of any local Claude session. Managed via the claude.ai remote trigger API.

| Action | HTTP | Description |
|--------|------|-------------|
| `list` | GET /v1/code/triggers | List all configured triggers |
| `get` | GET /v1/code/triggers/{id} | Get trigger details |
| `create` | POST /v1/code/triggers | Create a new trigger (requires body) |
| `update` | POST /v1/code/triggers/{id} | Update trigger (partial update) |
| `run` | POST /v1/code/triggers/{id}/run | Manually fire a trigger |

**Key Differences from CronCreate**:

| Feature | CronCreate (Session) | RemoteTrigger (Cloud) |
|---------|---------------------|----------------------|
| Lifetime | Session-bound (7-day max) | Persistent until deleted |
| Execution | Local REPL | Cloud-hosted |
| Auth | Automatic (session) | OAuth token (automatic via tool) |
| State | In-memory or `.claude/scheduled_tasks.json` | Cloud API |
| Cost | Uses session tokens | Uses cloud credits |
| Offline | No — requires running session | Yes — runs independently |

**Usage**: The RemoteTrigger tool handles OAuth automatically — never use curl directly for these endpoints.

#### 6.5.3 Use Cases

| Use Case | Mechanism | Cron Example |
|----------|-----------|-------------|
| Periodic health checks | CronCreate (session) | `*/30 * * * *` — every 30 min |
| Daily dependency audit | RemoteTrigger (cloud) | `23 8 * * 1-5` — weekday mornings |
| Weekly report generation | RemoteTrigger (cloud) | `47 16 * * 5` — Friday afternoons |
| Reminder to check deploy | CronCreate (one-shot) | Pin to specific time, `recurring: false` |
| Continuous test monitoring | CronCreate (session) | `*/10 * * * *` — every 10 min |
| Nightly backup verification | RemoteTrigger (cloud) | `13 2 * * *` — 2:13am daily |

#### 6.5.4 AIWG Integration

AIWG's `/schedule` skill wraps these tools with a higher-level interface:

```bash
# Create a recurring health check via /schedule skill
/schedule create --name "workspace-health" \
  --cron "47 8 * * 1-5" \
  --prompt "/workspace-health" \
  --type remote

# List scheduled agents
/schedule list

# Run a trigger manually
/schedule run workspace-health
```

**Integration patterns**:

| AIWG Workflow | Scheduling Mechanism | Example |
|---------------|---------------------|---------|
| Ralph loop monitoring | CronCreate (session) | Check Ralph status every 5 min |
| Issue sync | RemoteTrigger (cloud) | Scan commits for issue refs daily |
| Project health | RemoteTrigger (cloud) | Weekly `aiwg doctor` + report |
| Cost tracking | CronCreate (session) | Hourly token spend check |
| Doc sync | RemoteTrigger (cloud) | Daily drift detection |

#### 6.5.5 Limitations and Cost Considerations

**Session-local (CronCreate)**:
- Jobs only fire while REPL is idle — long-running tasks delay scheduled execution
- 7-day auto-expiry for recurring jobs
- Non-durable jobs lost on session end
- Each execution consumes tokens from the active session

**Remote triggers (RemoteTrigger)**:
- Requires OAuth authentication via claude.ai
- Each execution incurs cloud API costs
- No access to local filesystem (runs in cloud sandbox)
- Rate limits apply (check API documentation)

**Cost guidance**:
- Frequent schedules (< 30 min) are token-intensive — use sparingly
- Prefer session-local for short-lived monitoring during active work
- Prefer remote triggers for persistent scheduled tasks that should survive session end
- Each trigger execution is a full Claude session — cost scales with prompt complexity

---

## 7. Memory System

### 7.1 Automatic Memory (v2.1.32)

Claude now **automatically records and recalls memories** as it works. No manual configuration needed.

### 7.2 Memory Hierarchy

```
Session Memory       (current conversation, most specific)
    ↓
Auto Memory          (~/.claude/projects/<project>/memory/MEMORY.md)
    ↓
Project Memory       (.claude/memory.md or CLAUDE.md)
    ↓
User Memory          (~/.claude/CLAUDE.md)
    ↓
System Defaults      (least specific)
```

### 7.3 Agent Memory (v2.1.33)

Agents can have persistent memory via the `memory` frontmatter field:

| Scope | Storage | Use Case |
|-------|---------|----------|
| `user` | User-wide | Cross-project preferences |
| `project` | Project directory | Project-specific learnings |
| `local` | Local machine | Machine-specific config |

### 7.4 Memory Best Practices

- MEMORY.md is always loaded into system prompt (keep under 200 lines)
- Create separate topic files (e.g., `debugging.md`, `patterns.md`) for detailed notes
- Link to topic files from MEMORY.md
- Record insights about problem constraints, strategies that worked/failed
- Update or remove memories that become outdated

---

## 8. MCP Integration

### 8.1 Overview

Model Context Protocol (MCP) extends Claude Code with external tools and services.

**Configuration Locations**:
| File | Scope | Sharing |
|------|-------|---------|
| `.mcp.json` | Project | Team via git |
| `~/.claude/mcp.json` | User | Personal |
| `~/.claude/managed-mcp.json` | Org | Read-only |

### 8.2 Server Configuration

```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["./mcp-servers/github.js"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "gitea": {
      "command": "npx",
      "args": ["-y", "@anthropics/mcp-server-gitea"],
      "env": {
        "GITEA_TOKEN": "${GITEA_TOKEN}",
        "GITEA_URL": "https://git.example.com"
      }
    }
  }
}
```

### 8.3 OAuth for MCP Servers (v2.1.30)

Pre-configured OAuth client credentials for servers that don't support Dynamic Client Registration:
```bash
claude mcp add --client-id <id> --client-secret <secret> my-server
```

### 8.4 MCP Tool Search Auto Mode (v2.1.7)

When MCP tool descriptions exceed **10% of context window**, they are automatically deferred and discovered via the `ToolSearch` tool instead of being loaded upfront.

- Enabled by default for all users
- Configurable threshold: `auto:N` syntax where N is context window percentage (0-100)
- Disable by adding `ToolSearch` to `disallowedTools`

### 8.5 MCP Management Commands

```bash
claude mcp list              # List configured servers
claude mcp get <server>      # Get server details
claude mcp add <server>      # Add server (with --client-id/--client-secret for OAuth)
claude mcp remove <server>   # Remove a server
claude mcp serve             # Start as MCP server
/mcp enable <name>           # Enable/disable servers in session
```

### 8.6 Popular MCP Servers

| Server | Purpose | Package |
|--------|---------|---------|
| GitHub | GitHub API access | `@anthropics/mcp-server-github` |
| Gitea | Gitea/Forgejo API | `@anthropics/mcp-server-gitea` |
| Filesystem | Extended file ops | `@anthropics/mcp-server-filesystem` |
| PostgreSQL | Database queries | `@anthropics/mcp-server-postgres` |
| Slack | Slack integration (OAuth) | `@anthropics/mcp-server-slack` |

---

## 9. Hooks System

### 9.1 Hook Events

| Event | Trigger | Use Case | Since |
|-------|---------|----------|-------|
| `PreToolUse` | Before tool execution | Validation, permission checks, inject context | Enhanced v2.1.9 |
| `PostToolUse` | After tool completion | Logging, cleanup, verification | - |
| `SubagentStart` | Agent spawned | Trace collection, logging | v2.0.43 |
| `SubagentStop` | Agent completed | Capture transcripts | v2.0.43 |
| `PermissionRequest` | Permission prompt | Auto-approve patterns | v2.0.54 |
| `SessionStart` | Session begins | Init, includes `agent_type` if `--agent` specified | v2.1.2 |
| `Stop` | Session termination | Final validation | - |
| `TeammateIdle` | Agent team member idle | Multi-agent coordination | v2.1.33 |
| `TaskCompleted` | Background task done | Multi-agent workflow triggers | v2.1.33 |

### 9.2 Hook Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash(git commit*)",
        "hooks": [
          {
            "type": "command",
            "command": "npm test"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write(*.ts)",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write $CLAUDE_FILE_PATH"
          }
        ]
      }
    ]
  }
}
```

### 9.3 Hook Features

| Feature | Details | Since |
|---------|---------|-------|
| **additionalContext** | PreToolUse hooks can return `additionalContext` injected to model | v2.1.9 |
| **Timeout** | Hook execution timeout is 10 minutes (was 60 seconds) | v2.1.3 |
| **Background hooks** | Backgrounded hook commands return early without blocking | v2.1.19 |
| **Permission feedback** | Users can provide feedback when accepting permission prompts | v2.1.7 |
| **Background task prompts** | Background agents prompt for tool permissions before launching | v2.1.20 |

### 9.4 Hook Use Cases

1. **Pre-commit validation**: Run tests before commits
2. **Auto-formatting**: Format files after creation
3. **Security scanning**: Check for vulnerabilities
4. **Trace collection**: Log subagent lifecycle via SubagentStart/SubagentStop
5. **Auto-approve patterns**: Approve trusted operations via PermissionRequest
6. **Context injection**: Add context to model via PreToolUse additionalContext
7. **Multi-agent coordination**: React to TeammateIdle/TaskCompleted events

---

## 10. Context Management

### 10.1 Context Limits

| Model | Context Window |
|-------|---------------|
| Opus 4.6 | 200,000 tokens |
| Sonnet 4.5 | 200,000 tokens |
| Haiku 4.5 | 200,000 tokens |

### 10.2 Context Commands

| Command | Action |
|---------|--------|
| `/context` | Visualize usage (grouped skills/agents, sorted token counts) |
| `/compact` | Summarize history (properly clears warning afterward) |
| `/clear` | Reset context (also clears plan files) |
| `Summarize from here` | Partial conversation summarization (v2.1.32) |

### 10.3 Context Optimization Strategies

1. **Use subagents** - Isolate exploratory work in separate context
2. **Clear between tasks** - Fresh context for new work
3. **Leverage CLAUDE.md** - Always-relevant context without manual loading
4. **Monitor with `/context`** - Track usage proactively
5. **Use `/compact`** - Preserve essential history when running low
6. **Partial summarization** - "Summarize from here" to compress only recent history
7. **MCP tool search auto mode** - Defers MCP tool descriptions to save context
8. **Large outputs to disk** - Tool outputs that exceed limits are saved to disk instead of truncated (v2.1.2), accessible via file references

### 10.4 Auto-Compact Behavior

- Auto-compact triggers based on effective context window (reserves space for max output tokens)
- Fixed: No longer triggers too early on models with large output token limits (v2.1.21)
- Fixed: "Context left until auto-compact" warning properly hides after `/compact` (v2.1.15)

---

## 11. Session Management

### 11.1 Session Commands

| Command/Flag | Purpose | Since |
|-------------|---------|-------|
| `/rename <name>` | Name current session | - |
| `/tag <tag>` | Tag current session | - |
| `/resume` | Resume previous session | - |
| `--resume <name>` | Resume by name from CLI | - |
| `--from-pr <num\|url>` | Resume session linked to a PR | v2.1.27 |
| `--fork-session` | Fork from resumed session | v2.1.20 |
| `--session-id <id>` | Custom session ID for forks | v2.0.73 |
| `--agent <name>` | Use specific agent (preserved on resume) | v2.0.60, v2.1.32 |

### 11.2 PR Integration (v2.1.27)

- Sessions automatically linked to PRs when created via `gh pr create`
- Resume sessions by PR number: `claude --from-pr 123`
- PR review status indicator in prompt footer (approved, changes requested, pending, draft)
- Session URL attribution added to commits and PRs from web sessions (v2.1.9)

### 11.3 Session Improvements

- Resume uses 68% less memory via stat-based loading (v2.1.30)
- Session picker shows git branch and message count, searchable by branch (v2.1.33 VSCode)
- Exit hint shows how to resume: `claude --resume` (v2.1.31)
- Fork conversation hint shows how to resume original (v2.1.20)
- Fixed compaction issues that could load full history instead of compact summary (v2.1.20)

---

## 12. Sandboxing and Security

### 12.1 Sandbox Architecture

- **Linux**: bubblewrap
- **macOS**: seatbelt
- **Windows**: WSL2

### 12.2 Security Boundaries

| Boundary | Default |
|----------|---------|
| Filesystem Write | Current directory only |
| Filesystem Read | Entire system (except denied) |
| Network | Unix socket proxy only |

### 12.3 Permission Configuration

```json
{
  "sandbox": {
    "enabled": true,
    "filesystem": {
      "writeable": ["."],
      "denied": [".env", ".ssh", ".config/secrets"]
    }
  },
  "permissions": {
    "allow": ["Read(./**)", "Write(./**)", "Bash(npm:*)"],
    "deny": ["Read(.env)", "Bash(rm -rf:*)"]
  }
}
```

### 12.4 Security Fixes

- Fixed: Permission bypass via shell line continuation (v2.1.6)
- Fixed: Wildcard permission rules matching compound commands with shell operators (v2.1.7)
- Fixed: Command injection in bash command processing (v2.1.2)

---

## 13. IDE Integrations

### 13.1 VS Code

**Features**:
- Native extension interface
- Automatic context from current editor
- Interactive diff viewing
- Accept/reject workflows
- **Remote sessions**: OAuth users browse/resume sessions from claude.ai (v2.1.33)
- **Session forking and rewind** (v2.1.19)
- **Plugin management**: Native plugin discovery and installation (v2.1.16)
- **Python venv activation**: Auto-detects and uses correct interpreter (v2.1.21)
- **PR review status and git branch** in session picker (v2.1.33)
- **Tab icon badges**: Blue for pending permissions, orange for unread completions (v2.0.73)
- **Multiline input** in question dialogs via Shift+Enter (v2.1.30)
- **Clickable destination selector** for permission requests (v2.1.3)
- **/usage command** for plan usage display (v2.1.14)
- **Claude in Chrome integration** (v2.1.27)

**Installation**: VS Code Marketplace → "Claude Code"

### 13.2 JetBrains IDEs

**Supported**: IntelliJ, PyCharm, WebStorm, GoLand, PhpStorm

**Features**:
- Interactive diff viewer
- Selection context sharing
- Keyboard shortcuts
- Native tool integration

**Installation**: JetBrains Plugin Marketplace → "Claude"

---

## 14. Claude Agent SDK

### 14.1 Installation

```bash
# TypeScript/JavaScript
npm install @anthropic-ai/claude-agent-sdk

# Python
pip install anthropic-agent-sdk
```

### 14.2 Basic Agent (TypeScript)

```typescript
import { Agent } from "@anthropic-ai/claude-agent-sdk";

const agent = new Agent({
  name: "code_analyzer",
  model: "claude-sonnet-4-5-20250929",
  instructions: `You are a code analysis expert.
    Analyze code for quality, security, and performance.`,
  tools: ["Read", "Grep", "Glob"],
});

const result = await agent.run("Analyze src/ for security issues");
console.log(result);
```

### 14.3 SDK Notes

- Minimum zod peer dependency: `^4.0.0` (v2.1.2)
- `SDKUserMessageReplay` events when `replayUserMessages` enabled (v2.1.19)
- `queued_command` attachment messages replayed (v2.1.19)

---

## 15. Keyboard Shortcuts

| Shortcut | Action | Since |
|----------|--------|-------|
| `Ctrl+C` | Cancel current operation | - |
| `Ctrl+D` | Exit session | - |
| `Ctrl+B` | Background current task | v2.1.4 |
| `Ctrl+G` | Open external editor | v2.0.73 |
| `Ctrl+S` | Stash/restore prompt | - |
| `Ctrl+T` | Toggle task list / syntax highlighting in /theme | - |
| `Ctrl+Y` | Yank (paste from kill ring) | - |
| `Alt+Y` | Yank-pop (cycle kill ring history) | v2.0.73 |
| `Ctrl+Z` | Suspend (fixed for Kitty protocol terminals) | Fixed v2.1.9 |
| `Shift+Tab` | Quick "auto-accept edits" in plan mode | v2.1.2 |
| `Tab` | Autocomplete (including bash history with `!`) | Enhanced v2.1.14 |
| `↑` / `↓` | Navigate history (vim normal mode support) | Enhanced v2.1.20 |
| `Esc Esc` | Browse and restore history | - |

---

## 16. Installation

### 16.1 Recommended Installation

```bash
# Direct install (recommended)
claude install

# Or via package managers
# macOS
brew install claude-code

# Windows
winget install claude-code
```

### 16.2 npm Deprecation Notice (v2.1.15)

npm installation is deprecated. Run `claude install` or visit https://docs.anthropic.com/en/docs/claude-code/getting-started for alternatives.

### 16.3 Auto-Updates

- `/config` includes release channel toggle (stable or latest) (v2.1.3)
- `/doctor` shows auto-update channel and available versions (v2.1.6)
- Config backups are timestamped and rotated (5 most recent) (v2.1.20)

---

## 17. Best Practices for AIWG Integration

### 17.1 Agent Design

```yaml
# AIWG agents should include:
---
name: "Requirements Analyst"
model: "sonnet"
memory: project                    # Persistent memory
tools:
  allow:
    - Read
    - Write
    - Grep
    - Glob
    - Task(Explore)                # Restricted subagent types
  deny:
    - Bash
skills:
  - voice-apply                    # Auto-load skills
---
```

### 17.2 Skill Integration

AIWG skills should:
- Live in `.claude/commands/` or `.claude/skills/` (merged in v2.1.3)
- Use `$ARGUMENTS` for full args, `$ARGUMENTS[0]` for indexed access
- Reference appropriate agents via `agent:` field
- Use `${CLAUDE_SESSION_ID}` for session-aware operations
- Document expected inputs/outputs

### 17.3 MCP Server Patterns

For AIWG MCP integrations:
- Store configs in `.mcp.json` (team-shared)
- Use environment variables for secrets
- Leverage MCP tool search auto mode for large tool sets
- Use OAuth credentials for servers like Slack
- Document server capabilities in `.aiwg/references/`

### 17.4 Hook Patterns

For AIWG hook integrations:
- Use PreToolUse `additionalContext` to inject AIWG context
- Use SubagentStart/SubagentStop for trace collection
- Hook timeout is 10 minutes (sufficient for test suites)
- TeammateIdle/TaskCompleted for multi-agent orchestration

---

## 18. Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| Context exhausted | Use `/compact`, "Summarize from here", or start new session |
| Permission denied | Check settings; content-level ask overrides tool-level allow |
| MCP server not found | Verify `.mcp.json` config and env vars |
| MCP tools using too much context | MCP auto mode defers tools; check ToolSearch |
| Model not switching | Check model name with `/model` |
| Hooks not firing | Verify matcher syntax; check 10-min timeout |
| Unreachable permission rules | Run `/doctor` for detection and fix guidance |
| Session resume issues | Try `--from-pr` for PR-linked sessions |
| PDF too large | Use `pages` parameter: `Read doc.pdf pages: "1-5"` |
| Background tasks stuck | Use `/tasks` to view, TaskStop to cancel |

### Diagnostic Commands

```bash
# Check installation health
/doctor

# Troubleshoot current session
/debug

# View context usage
/context

# List MCP servers
/mcp

# Show configuration (with search)
/config

# View usage stats
/stats
```

---

## 19. Official Documentation Links

### Core Documentation
- **Main Docs**: https://docs.anthropic.com/en/docs/claude-code
- **CLI Reference**: https://docs.anthropic.com/en/docs/claude-code/cli-reference
- **GitHub**: https://github.com/anthropics/claude-code

### Feature Documentation
- **MCP Integration**: https://docs.anthropic.com/en/docs/claude-code/mcp
- **Subagents**: https://docs.anthropic.com/en/docs/claude-code/sub-agents
- **Slash Commands**: https://docs.anthropic.com/en/docs/claude-code/slash-commands
- **Memory**: https://docs.anthropic.com/en/docs/claude-code/memory
- **Settings**: https://docs.anthropic.com/en/docs/claude-code/settings
- **Sandboxing**: https://docs.anthropic.com/en/docs/claude-code/sandboxing

### Agent SDK
- **Overview**: https://docs.anthropic.com/en/docs/agents/agent-sdk
- **Quickstart**: https://docs.anthropic.com/en/docs/agents/agent-sdk/quickstart

### Engineering Blog
- **Sandboxing Deep Dive**: https://www.anthropic.com/engineering/claude-code-sandboxing
- **Best Practices**: https://www.anthropic.com/engineering/claude-code-best-practices

---

## References

- @CLAUDE.md - Project-level Claude Code configuration
- @.claude/settings.json - Settings reference
- @.mcp.json - MCP configuration
- @.claude/agents/ - Agent definitions
- @.claude/commands/ - Custom commands/skills
- @.aiwg/planning/claude-code-features-leverage.md - Feature leverage analysis
