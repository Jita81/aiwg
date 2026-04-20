# Fork Workflow

This explains what the Steward does under the hood when you use the fork-based ownership model. Most users don't need this — just tell the Steward what you want. But if you're curious about the git mechanics or want to understand how upstream sync and conflict handling work, this is the reference.

---

## The Model

```
jmagly/aiwg  (upstream — AIWG releases happen here)
      │
      │  gh repo fork  (Steward does this once, during setup)
      ▼
you/aiwg  (your fork — your source of truth)
      │
      │  git clone
      ▼
~/my-aiwg/  (your local working copy)
      │
      │  aiwg --use-dev ~/my-aiwg
      ▼
global AIWG = your fork
```

Your fork has two remotes:
- `origin` — your fork on GitHub (`github.com/you/aiwg`)
- `upstream` — the canonical AIWG repo (`github.com/jmagly/aiwg`)

---

## Initial Setup

The Steward runs these steps when you say "set up AIWG customization mode":

```bash
# Fork and clone in one step — sets both remotes
gh repo fork jmagly/aiwg --clone --remote --clone-dir ~/my-aiwg

# Point AIWG CLI at your local clone
aiwg --use-dev ~/my-aiwg

# Build TypeScript (only needed once at setup)
npm --prefix ~/my-aiwg run build

# Deploy everything from your fork
aiwg use all
```

After setup, `aiwg version` shows `[dev]` and the path to your clone. That's how you know it's working.

---

## The Edit Cycle (Daily Use)

```
Edit a file in ~/my-aiwg
    ↓
Tell Steward: "apply my changes"
    ↓
Steward runs: aiwg use all
    ↓
Change is active in your next session
```

Most customizations (rules, agents, skills) don't need a TypeScript build — `aiwg use all` alone is sufficient. The Steward only runs `npm run build` when you've changed something in `src/`.

---

## Upstream Sync

When AIWG releases new features, you pull them into your fork with:

> "Sync my AIWG"

The Steward runs:

```bash
git fetch upstream
git log HEAD..upstream/main --oneline   # shows what's incoming
git merge upstream/main
# (handle conflicts if any — see below)
aiwg use all
git push origin main
```

You see a summary of what changed before the merge happens. The Steward reports what was new upstream after the sync.

---

## Conflict Handling

Conflicts can happen when upstream changes a file you've also modified. The Steward's strategy:

| Situation | What Happens |
|-----------|-------------|
| File you added (not in upstream) | Always kept — upstream never sees it |
| File only upstream changed | Auto-accepted — you never touched it |
| File both you and upstream changed | Steward shows the diff and asks which version to keep |

When in doubt, the Steward keeps your version and flags it for your review. Your customizations are never silently overwritten.

---

## Contributing Back

If you build something that might be useful to others:

> "PR this back to AIWG"

The Steward:
1. Reviews the candidate for general applicability — is it useful to anyone, or is it specific to you?
2. If general: creates a feature branch off your fork, makes a conventional commit, opens a PR to `jmagly/aiwg`
3. If personal: explains why it's a good private customization but not a fit for the main repo

PR branches follow the naming convention `feat/contribute-<name>`. Your `main` branch is unaffected — you keep working normally while the PR is in review.

---

## What `aiwg doctor` Reports

When you're in customize mode, `aiwg doctor` includes a **Customize Mode** check:

```
✓ Customize Mode: Active (fork) — source: ~/my-aiwg — up to date with upstream
```

Or, if upstream has new commits:

```
○ Customize Mode: Active — source: ~/my-aiwg | upstream has 3 commit(s) — tell Steward "sync my AIWG" to update
```

---

## Going Back

To return to the standard npm-installed AIWG:

> "Switch back to stable AIWG"

The Steward runs `aiwg --use-stable` and resyncs from the npm package. Your fork stays on GitHub and your local clone stays on disk — reactivating customize mode later is just `aiwg --use-dev ~/my-aiwg`.

---

## Local Clone Mode (No Fork)

If you chose the local clone path instead of forking:

- `origin` doesn't point to your GitHub account — it points to `jmagly/aiwg` directly (or there's no `origin` at all)
- `upstream` remote doesn't exist — so "sync my AIWG" won't work
- Everything else (edit cycle, apply changes, doctor) works the same

You can add a fork later by following the fork path at any time. The Steward handles that transition too.
