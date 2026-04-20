# Make AIWG Yours

By the end of this, Claude will permanently know your preferences — your rules, your agents, your workflow — and any changes you make will go live immediately.

This is the **personal customization** guide. If you're building framework components to contribute upstream, see [Developer Mode](../development/dev-testing.md) instead.

---

## What You Can Make Yours

Everything AIWG deploys to Claude is just a text file. That means you can edit any of it:

**Rules** — how Claude behaves with you, specifically:
- "Always know I'm a backend engineer who prefers direct answers without trailing summaries"
- "When writing SQL, default to PostgreSQL syntax"
- "My team uses trunk-based development — never suggest long-lived feature branches"

**Agents** — specialized personas tuned to your domain:
- A domain specialist for your industry (fintech, biotech, legal, whatever)
- A code reviewer who knows your team's specific standards
- A writing partner who understands your voice

**Skills** — trigger phrases and workflows for how you actually work:
- A personal research workflow that saves notes in your preferred format
- A commit message helper that follows your team's conventions
- A deployment checklist tuned to your stack

**Prompts and templates** — reusable starting points for recurring work.

---

## The Steward Sets This Up

You don't need to run CLI commands or edit config files. The AIWG Steward handles the setup.

Tell the Steward what you want:

> "Set up AIWG customization mode for me — I want to edit my rules and agents live"

The Steward will ask one question: do you want to fork AIWG on GitHub first (recommended), or just clone it locally?

- **Fork** (recommended): Your fork on GitHub is your source of truth. You can pull upstream updates when AIWG releases new features, and contribute your customizations back if they'd be useful to others.
- **Local clone**: Fastest to start. No upstream sync, but everything else works the same.

The Steward takes care of the rest — the fork or clone, the dev mode setup, the initial deployment. You don't see npm or build internals.

---

## The Live Edit Loop

Once you're set up, the loop is:

```
1. Edit a file in your AIWG clone
2. Tell the Steward: "apply my changes"
3. Change is active in your next session
```

That's it. "Apply my changes", "rebuild", "make this live", "deploy my customizations" — they all do the same thing. The Steward figures out what changed and deploys it.

Most customizations (rules, agents, skills) are instant — no build step, just a deploy. The Steward only runs a full build when something in the TypeScript source changed, which for personal customization almost never happens.

---

## Two Paths

### Fork (recommended)

When the Steward sets up a fork, you get:
- Your own copy of AIWG on GitHub that you control
- Upstream sync: pull in new AIWG releases without losing your customizations
- The ability to contribute a customization back if it turns out to be generally useful

Tell the Steward: `"sync my AIWG"` to pull upstream updates. It shows you what's coming in before merging, and never overwrites files you've added.

### Local Clone

If you don't need upstream sync or GitHub integration, a local clone is simpler. Everything works the same — edit files, say "apply my changes", done. You just won't get upstream updates automatically.

You can always add a fork later.

---

## Check What You've Customized

> "What have I customized?" / "Show my AIWG setup" / "Customization status"

The Steward shows:
- Which mode you're in (fork vs local clone)
- Where your AIWG clone lives
- Which files you've added or changed vs the default
- How many upstream commits you haven't pulled yet (fork mode)

---

## Contributing a Customization Back

If you build something that might be useful to others — a domain agent, an improved skill, a generally applicable rule — the Steward can open a PR to the main AIWG repo.

> "PR this back to AIWG" / "Contribute this upstream"

The Steward reviews whether it's generally applicable (not personal to you), creates a feature branch with a proper conventional commit, and opens a pull request. If it looks personal, it declines gracefully and explains why that's fine — your fork is exactly the right place for personal stuff.

---

## Going Back

If you ever want to go back to the standard npm-installed AIWG:

> "Switch back to stable AIWG"

The Steward runs `aiwg --use-stable` and syncs from the npm package. Your fork/clone stays where it is — you can reactivate customization mode anytime.

---

## Quick Reference

| You Say | What Happens |
|---------|-------------|
| "Set up AIWG customization mode" | Steward forks/clones, sets up dev mode, deploys |
| "Apply my changes" | Deploys changes from your clone |
| "What have I customized?" | Shows your changes vs default |
| "Sync my AIWG" | Pulls upstream updates into your fork |
| "PR this back to AIWG" | Opens a pull request to the main repo |
| "Switch back to stable" | Returns to npm package |

---

## Next Steps

- [Customization Examples](examples.md) — 5 concrete examples of what people actually customize
- [Fork Workflow](fork-workflow.md) — How the fork/upstream sync works under the hood
- [Developer Mode](../development/dev-testing.md) — If you want to contribute to AIWG itself (not just customize it)
