# MCP Profiles

Named, ordered subsets of registered MCP servers. Profiles let you launch sessions
or inject only the servers relevant to a specific task, without modifying your
default provider configuration.

- **Registry file:** `~/.aiwg/mcp-profiles.json`
- **Schema:** `apiVersion: aiwg.io/v1`, `kind: McpProfileRegistry`

## Quick Start

```bash
# Install built-in presets
aiwg mcp profile init-presets

# Launch claude with the 'dev' profile (ephemeral — default config unchanged)
aiwg session --profile dev

# Launch codex with the 'ops' profile
aiwg session --provider codex --profile ops
```

## Preset Profiles

Installed by `aiwg mcp profile init-presets`. Do not overwrite existing profiles with the same name.

| Name | Servers | Description |
|------|---------|-------------|
| `minimal` | (none) | Minimal toolset for smoke tests |
| `dev` | git-gitea, codeindex-codehound, memory-fortemi | Code editing + git + memory |
| `ops` | git-gitea, cmdb-itassets, memory-fortemi | Infra + git + CMDB |
| `research` | memory-fortemi, google-drive, google-calendar | Documentation + memory + calendar |
| `incident` | git-gitea, cmdb-itassets, memory-fortemi, codeindex-codehound | Incident response |
| `full` | `__all__` | All registered servers (expands at inject time) |

## Profile Management

### Create a profile

```bash
aiwg mcp profile add <name> --servers <a,b> [--description <text>]
```

Server names must exist in the registry (`aiwg mcp list`). Use the special sentinel
`__all__` to expand to all registered servers at inject time.

```bash
aiwg mcp profile add my-work \
  --servers git-gitea,memory-fortemi \
  --description "Daily work — git + memory only"
```

### Inspect profiles

```bash
# List all profiles
aiwg mcp profile list

# Show a profile and its resolved servers
aiwg mcp profile show dev
```

### Edit a profile

```bash
# Add a server
aiwg mcp profile edit my-work --add-server codeindex-codehound

# Remove a server
aiwg mcp profile edit my-work --remove-server memory-fortemi

# Update description
aiwg mcp profile edit my-work --description "Code + search"
```

### Remove a profile

```bash
aiwg mcp profile remove my-work
```

### Import / export

```bash
# Export one profile
aiwg mcp profile export dev --out ./dev-profile.json

# Export all profiles
aiwg mcp profile export --out ./all-profiles.json

# Import from file
aiwg mcp profile import ./shared-profiles.json
```

Importing merges profiles: existing profiles are updated, new profiles are added.
Invalid names are skipped silently.

## Using Profiles in Sessions

### Ephemeral (default)

The provider's default config is **not modified**. A temp config is written for the
duration of the session.

```bash
aiwg session --profile dev                   # claude (default provider)
aiwg session --provider codex --profile ops  # codex
```

For Claude: the temp config is passed via `--mcp-config <path>`.  
For Codex: a per-profile runtime home is set up instead (see [Codex Profiles](./codex-profiles.md)).

### Persistent

Writes the profile's servers into the provider's default config permanently.

```bash
aiwg session --profile dev --persist
```

### Ephemeral inject (direct)

```bash
# Write ephemeral config to a temp file
aiwg mcp inject --provider claude --profile ops --ephemeral

# Write to a specific path
aiwg mcp inject --provider claude --profile ops --ephemeral --out /tmp/ops.json
```

## Provider Overrides

Profiles can carry per-provider tool allow/deny lists. These restrict which tools
from a server are exposed to a specific provider without affecting other providers.

### Structure

```json
{
  "name": "dev",
  "servers": ["git-gitea", "memory-fortemi"],
  "providerOverrides": {
    "codex": {
      "toolDeny": ["git-gitea__delete_*", "git-gitea__actions_config_write"],
      "toolAllow": []
    }
  }
}
```

**`toolDeny`** — glob patterns of tool names to block for this provider.  
**`toolAllow`** — if non-empty, only these tools are exposed (allowlist mode). Takes precedence over `toolDeny`.

Tool name format: `<server-name>__<tool-name>`, e.g. `git-gitea__delete_branch`.
Glob patterns are supported: `git-gitea__delete_*` blocks all delete operations.

### The `dev` preset and Codex

The built-in `dev` preset ships with a Codex override that blocks destructive Gitea
operations. This prevents accidental branch/repo deletion when running Codex against
a shared Gitea instance:

```json
"providerOverrides": {
  "codex": {
    "toolDeny": ["git-gitea__delete_*", "git-gitea__actions_config_write"]
  }
}
```

### Setting overrides via CLI

Provider overrides are not yet editable via `aiwg mcp profile edit`. Edit
`~/.aiwg/mcp-profiles.json` directly or use import/export to update the JSON.

## Registry File Format

`~/.aiwg/mcp-profiles.json`:

```json
{
  "apiVersion": "aiwg.io/v1",
  "kind": "McpProfileRegistry",
  "profiles": {
    "dev": {
      "name": "dev",
      "description": "Code editing + git + memory",
      "servers": ["git-gitea", "codeindex-codehound", "memory-fortemi"],
      "providerOverrides": {
        "codex": {
          "toolDeny": ["git-gitea__delete_*", "git-gitea__actions_config_write"]
        }
      },
      "createdAt": "2026-04-17T00:00:00.000Z",
      "updatedAt": "2026-04-17T00:00:00.000Z"
    }
  }
}
```

## Further Reading

- [Codex Per-Profile Runtime Homes](./codex-profiles.md) — OAuth isolation for Codex
- [MCP Server Registry](./README.md) — Registering and managing servers
- [CLI Reference: mcp profile](../cli-reference.md#mcp-profile) — Full command reference
