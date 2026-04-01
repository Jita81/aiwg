# Deployment Issues

Problems with agent and command deployment.

## Agents Not Found

**Symptoms**: "Agent not found", subagent calls fail, Task tool errors.

**Cause**: Agents not deployed to project.

**Solution**:

```bash
# Deploy agents
aiwg -deploy-agents --mode sdlc

# Verify deployment
ls .claude/agents/

# Should show 50+ agent files
```

## Commands Not Found

**Symptoms**: Slash commands not recognized, "/command not found".

**Cause**: Commands not deployed to project.

**Solution**:

```bash
# Deploy commands
aiwg -deploy-commands --mode sdlc

# Verify deployment
ls .claude/commands/

# Should show flow-*.md and other command files
```

## Duplicate Commands in Command Palette

**Symptoms**: Slash commands appear twice in Claude Code (or another provider's command palette) after running `aiwg use`.

**Cause**: An old `.claude/commands/` directory exists alongside the new `.claude/skills/` directory. Both locations are scanned, so every overlapping file produces two entries.

**Solution**: Remove the legacy commands directory:

```bash
rm -rf .claude/commands/
```

Then re-run `aiwg use` to ensure skills are fully deployed:

```bash
aiwg use sdlc
```

**Prevention**: `aiwg use` normally prompts to delete the commands directory automatically (the commands → skills migration step). If you skipped that prompt or passed `--skip-commands-migration`, remove the directory manually as shown above.

---

## Agent Access Denied

**Symptoms**: "Permission denied" when agent tries to read AIWG files.

**Cause**: Claude Code settings missing read permission for AIWG installation.

**Solution**:

1. Open `.claude/settings.local.json` (or create it)
2. Add read permission:

```json
{
  "permissions": {
    "allow": [
      "Read(/home/YOUR_USER/.local/share/ai-writing-guide/**)"
    ]
  }
}
```

Replace `YOUR_USER` with your actual username.

## Outdated Agents

**Symptoms**: Agents missing new features, old behavior.

**Cause**: Project has old agent versions.

**Solution**:

```bash
# Update AIWG installation first
aiwg -update

# Force redeploy agents
aiwg -deploy-agents --mode sdlc --force
aiwg -deploy-commands --mode sdlc
```

## Factory AI Droids Not Loading

**Symptoms**: Droids not appearing in Factory `/droids` menu.

**Cause**: Factory requires manual import after deployment.

**Solution**:

```bash
# In Factory CLI
droid .
/droids
# Press 'I' to import
# Press 'A' to select all
# Press Enter to confirm
```

See [Factory Quickstart](#integrations-factory) for details.

## Warp Not Loading WARP.md

**Symptoms**: Warp AI doesn't recognize AIWG commands/context.

**Cause**: WARP.md not in project root or Warp not reindexed.

**Solution**:

```bash
# Verify WARP.md exists
ls WARP.md

# If missing, deploy
aiwg -deploy-agents --platform warp --mode sdlc

# In Warp, reindex
/init
```

## Related

- [Setup Issues](#ts-setup) - Installation problems
- [Platform Issues](#ts-platforms) - Platform-specific problems
