# Concierge Guide

The AIWG Concierge is the front-facing interaction layer for the AIWG daemon. When you have a daemon session running, the Concierge is the single surface you talk to — regardless of what is executing behind it.

## What the Concierge Is

The Concierge is an agent-based behavior that attaches to the daemon at session start. Its job is to receive your requests, route them to the right AIWG primitive (skill, agent, flow, or task), and return composed, appropriately registered responses — without exposing how any of it works.

Think of it as the front desk at a well-run operation. You tell the concierge what you need. The concierge handles the coordination. You receive results.

This is distinct from the daemon itself, which is the infrastructure: the supervisor, the task queue, the scheduler, the file watcher, the automation engine. The Concierge is the interaction layer that sits in front of all of it.

## Enabling the Concierge

Add the Concierge to your daemon configuration in `.aiwg/daemon.json`:

```json
{
  "supervisor": {
    "behaviors": ["concierge"]
  },
  "behaviors": {
    "concierge": {
      "enabled": true,
      "memory": {
        "cross_session": true,
        "store": ".aiwg/daemon/concierge-memory.json"
      }
    }
  }
}
```

Or deploy via CLI:

```bash
aiwg add-behavior concierge
```

The Concierge activates on each daemon session start and remains active for the session's duration.

## The Interaction Model

Talk to the Concierge naturally. You do not need to know which skill handles a given request, which agent is appropriate, or how to format a task submission. The Concierge identifies your intent and routes accordingly.

**Examples of natural requests:**

```
"What's the situation?"
"Fix the failing auth tests."
"Run the security audit tonight at 9."
"Start watching builds."
"Show me what's in the queue."
"Something seems slow."
```

The Concierge handles each of these without requiring you to know the underlying command.

### How Routing Works

Routing is invisible. You see a composed response; the routing decision is not surfaced.

Internally, the Concierge classifies each request by intent:

| Intent | Examples | What happens |
|--------|---------|--------------|
| **Status** | "How's the build?", "Any issues?" | Daemon state is read and summarized |
| **Task** | "Fix the failing tests", "Update the docs" | Submitted to the task queue via `aiwg task submit` |
| **Schedule** | "Run the audit tonight", "Check builds every 4 hours" | Routes to the scheduler |
| **Behavior** | "Start watching tests", "Enable the security scan" | Starts the named behavior via `aiwg behavior run` |
| **Information** | "What's in the queue?", "Show me the last report" | State files are read and formatted |
| **Meta** | "What can you do?", "How does the scheduler work?" | Concierge answers directly |
| **Escalation** | "Something seems wrong", "Why is this failing?" | Concierge diagnoses and surfaces cleanly |

You do not need to match these categories explicitly. Natural phrasing is enough.

### Fallback Behavior

When the Concierge cannot resolve a request, it surfaces what it does know, states what it cannot action directly, and — if relevant — suggests where to look. It does not surface stack traces, internal error codes, or routing logic.

```
"That's outside what I can action directly — I'll flag it for your attention."
```

## Tone and Discretion

The Concierge operates on five principles, the five Ps.

### Prompt

The Concierge answers first. It does not preface responses with filler, does not hedge when the answer is known, and does not ask clarifying questions when context is sufficient to proceed.

**Right:** "The last build failed at 14:22 — three TypeScript errors in `src/auth/token.ts`."
**Not this:** "That's a great question! Based on what I can see, it looks like there may have been some issues..."

### Pertinent

Every word earns its place. The Concierge does not summarize what it just said, does not append "Is there anything else I can help you with?", and does not pad responses.

**Right:** "Tests pass. PR is ready for review."
**Not this:** "I've completed the analysis and I'm happy to report that all of the tests have been successfully executed..."

### Pleasant

The Concierge is warm without being informal. You feel attended to, not processed. When the Concierge knows your name from session memory, it uses it. When a request falls outside what it can action, it acknowledges that directly before redirecting.

### Professional

The same quality of attention applies to every request — a production incident and a formatting question receive the same register. The Concierge does not break register for humor, commentary, or sarcasm.

### Discreet

Sensitive operations — security scan results, credential warnings, error conditions — are acknowledged and handled without drama. The Concierge does not amplify problems or minimize them. It states what happened, provides the relevant reference, and notes a recommended next step if one is clear.

**Right:** "The security scan flagged two medium-severity issues. Details are at `.aiwg/reports/security/2026-03-27.md`. Recommend reviewing before the next deployment."
**Not this:** "CRITICAL SECURITY VULNERABILITIES DETECTED. IMMEDIATE ACTION REQUIRED."

### Discreet Mode

When handling sensitive operations — key rotation, secret scanning, privilege escalation — the Concierge confirms before proceeding and presents findings proportionally. It does not emit alarm-level language for routine security findings.

If you receive findings and want them suppressed from the session log, set `"verbosity": "minimal"` in the tone configuration:

```json
{
  "behaviors": {
    "concierge": {
      "tone": {
        "register": "professional-warm",
        "verbosity": "minimal"
      }
    }
  }
}
```

In minimal verbosity mode, the Concierge confirms task completion and flags blockers but omits detail unless asked.

## Session Memory

### What Gets Remembered

The Concierge maintains two memory scopes.

**Session memory** is in-memory for the current daemon session:
- All requests made this session and their outcomes
- Tasks currently in progress
- Blockers and pending decisions flagged

**Cross-session memory** persists to `.aiwg/daemon/concierge-memory.json` across daemon restarts:
- Last 5 completed tasks (type, outcome, timestamp)
- Active automation rules and behaviors
- User preferences stated during sessions (e.g., "always confirm before committing")
- Unresolved items from prior sessions

The Concierge incorporates relevant prior context into the session-start greeting without reciting a full history.

**Example — returning session with context:**
```
Welcome back. The overnight security scan completed clean. Two automation rules are
active — build-monitor and test-watcher — and the agent loop from yesterday is still
queued.
```

**Example — new session, no prior context:**
```
Good morning. The daemon is running. What would you like to address?
```

### What Does Not Persist

- Raw agent output (summaries are stored; raw output is not)
- Internal task IDs
- Routing decisions
- Error stack traces (these go to `.aiwg/reports/`; the Concierge references them by path)

### Managing Memory

```bash
# Show current concierge memory
aiwg daemon memory show

# Clear concierge memory
aiwg daemon memory clear

# Clear only session memory (cross-session preferences retained)
aiwg daemon memory clear --session-only
```

You can also inspect or edit the memory file directly:

```
.aiwg/daemon/concierge-memory.json
```

## Influencing Behavior

### Preferences

State preferences conversationally. The Concierge stores them in cross-session memory and applies them going forward.

```
"Always confirm before committing."
"I prefer morning summaries."
"Don't surface findings below medium severity."
```

These preferences persist across daemon restarts.

### Voice Profiles

The Concierge's tone register can be tuned via the AIWG voice profile system. To apply a custom register, reference a voice profile in the daemon configuration:

```json
{
  "behaviors": {
    "concierge": {
      "tone": {
        "register": "professional-warm",
        "voice_profile": ".aiwg/voices/my-voice.md"
      }
    }
  }
}
```

See `agentic/code/addons/voice-framework/` for available profiles and instructions for creating custom ones.

### Composing with Other Behaviors

The Concierge composes automatically with other active behaviors. When `build-monitor` emits a build failure event, the Concierge formats the output before it reaches you. When `test-watcher` completes a run, the Concierge wraps the summary.

Composition is automatic — you do not configure it per-pair. Any behavior listed in `manifest.composable_with` in the Concierge's BEHAVIOR.md will have its output routed through the Concierge's response layer.

## Troubleshooting

### Routing Sends the Request Somewhere Wrong

The Concierge routes by intent. If intent is ambiguous, it may route incorrectly. To bypass routing entirely and submit a task directly:

```bash
aiwg task submit "Specific task description here" --raw
```

The `--raw` flag skips the Concierge and submits directly to the task queue.

Similarly, to invoke a skill directly without Concierge mediation:

```bash
aiwg chat send "/skill-name argument"
```

### The Concierge Does Not Recognize a Preference

Preferences are stored from natural language statements during sessions. If a preference was not confirmed explicitly ("Noted — I'll always confirm before committing"), it may not have been stored. Restate it and check:

```bash
aiwg daemon memory show
```

### Session Greeting Does Not Reflect Recent Activity

Cross-session memory reads from `.aiwg/daemon/concierge-memory.json`. If the daemon was stopped abnormally (e.g., SIGKILL), the memory file may not have been flushed. Check whether the file exists and contains recent entries:

```bash
aiwg daemon memory show
```

If the file is stale or missing, the Concierge will greet with a clean-state message. Prior activity is not lost — it is available in `.aiwg/daemon/daemon.log` and the task history.

### Seeing Internal Routing Details in Responses

If routing decisions or internal primitives are appearing in responses, the `expose_internals` setting may have been changed. Verify in `.aiwg/daemon.json`:

```json
{
  "behaviors": {
    "concierge": {
      "routing": {
        "expose_internals": false
      }
    }
  }
}
```

This should be `false` for normal use. Setting it to `true` is useful for debugging but surfaces internal routing detail that most users do not need to see.

## Reference

- Behavior definition: `agentic/code/behaviors/concierge/BEHAVIOR.md`
- Memory store: `.aiwg/daemon/concierge-memory.json`
- Daemon guide: `docs/daemon-guide.md`
- Behaviors guide: `docs/behaviors-guide.md`
- Voice profiles: `agentic/code/addons/voice-framework/`
