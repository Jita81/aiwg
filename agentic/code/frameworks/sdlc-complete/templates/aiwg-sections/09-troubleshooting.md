## Troubleshooting

**Template Not Found**:

```bash
# Verify AIWG installation
ls $AIWG_ROOT/agentic/code/frameworks/sdlc-complete/templates/

# Set environment variable if installed elsewhere
export AIWG_ROOT=/custom/path/to/ai-writing-guide
```

**Agent Access Denied**:

- Check `.claude/settings.local.json` has read access to AIWG installation path
- Verify path uses absolute path (not `~` shorthand for user home)

**Command Not Found**:

```bash
# Deploy commands to project
aiwg use sdlc

# Verify deployment
ls .claude/commands/flow-*.md
```

**Disable AIWG context**:

```bash
# Temporarily remove AIWG from context (does not uninstall)
aiwg hook-disable

# Re-enable
aiwg hook-enable
```
