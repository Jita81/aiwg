# Just Try It

You don't want to read documentation. You want to see something happen. That's fine.

---

## One-minute setup

Install AIWG and deploy it to your project:

```bash
npm install -g aiwg
cd /path/to/any/project     # or make an empty folder
aiwg use sdlc
```

Open Claude Code in that directory:

```bash
claude .
```

Now ask it anything about your project:

```
What does this codebase do?
```

```
Find the most complex function and explain it.
```

```
What tests are missing?
```

```
Where would a security reviewer look first?
```

AIWG has pre-loaded 50+ specialized agents and rules. The AI will answer with the knowledge of a test engineer, security auditor, or architect — not a generic chatbot.

---

## If you don't have a project to try it on

Make a folder, drop in one or two files, and run:

```bash
mkdir my-test && cd my-test
echo "console.log('hello')" > index.js
aiwg use sdlc
claude .
```

Then:

```
What would a senior engineer say about this code?
```

It will answer as one. That's what AIWG does.

---

## What you just installed

`aiwg use sdlc` copied agent definitions, slash commands, and behavioral rules into `.claude/` in your project. Claude Code reads those automatically when it starts. You don't need to configure anything — it just works.

---

## What to explore next

Once you've seen it in action, pick a path:

- **Starting a real project?** → [New Project](new-project.md)
- **You have existing code?** → [Existing Project](existing-project.md)
- **Want structured auditing?** → [Audit Existing Code](audit-existing-code.md)
