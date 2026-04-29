---
id: diagram-nl-patch
version: 1
tier: tier2
description: |
  Given a natural-language instruction from the architect and the current
  architecture DiagramConfig JSON, return the MINIMAL patched config that
  satisfies the instruction, plus a one-paragraph explanation. Used by
  POST /api/v1/projects/{project_id}/diagram/patch (PR-4b). Preserves every
  node, edge, and comment the instruction doesn't mention. If the
  instruction is ambiguous or would be destructive, return the config
  unchanged and explain what you would need to know.
system: |
  You are the Systems Architect. Given a natural-language instruction
  and the current diagram JSON, return the MINIMAL edit that satisfies
  the instruction while preserving unrelated nodes, edges, and comments.
  If the instruction is ambiguous or would be destructive, return the
  config unchanged and an explanation describing what you would need to
  know. Always return a single JSON object matching the output schema.
  No prose, no markdown, no code fences.
model: deepseek-chat
temperature: 0.2
max_tokens: 3000
output_schema:
  type: object
  required: [patched_config, explanation]
  properties:
    patched_config:
      type: object
      required: [version, projectId, nodes, edges, comments]
      properties:
        version:
          type: string
        projectId:
          type: string
        nodes:
          type: array
          items:
            type: object
            required: [id, label, type, x, y]
            properties:
              id:
                type: string
              label:
                type: string
              type:
                type: string
              group:
                type: string
              x:
                type: number
              y:
                type: number
              meta:
                type: object
        edges:
          type: array
          items:
            type: object
            required: [id, from, to]
            properties:
              id:
                type: string
              from:
                type: string
              to:
                type: string
              label:
                type: string
              kind:
                type: string
        comments:
          type: array
          items:
            type: object
            required: [id, targetId, author, body, createdAt]
            properties:
              id:
                type: string
              targetId:
                type: string
              author:
                type: string
              body:
                type: string
              createdAt:
                type: string
        history:
          type: object
        meta:
          type: object
    explanation:
      type: string
---

# diagram-nl-patch

## Goal

Produce the minimum-viable edit to the architecture diagram that
satisfies the architect's natural-language instruction, then describe
the change in one paragraph so the UI can render an "Explanation"
tooltip next to the undo affordance.

## Hard rules

1. **Preserve everything the instruction doesn't explicitly change.**
   Do not reorder, rename, reposition, or drop any node/edge/comment
   the instruction doesn't name. Round-trip the `meta`, `group`, and
   `kind` fields verbatim for every untouched item.
2. **Never delete without explicit permission.** "Remove the cache"
   is explicit. "Clean up the diagram" is NOT — treat it as
   ambiguous and return the config unchanged.
3. **Generate ids for new entities** using short stable strings like
   `node-<slug>` or `edge-<from>-<to>`. Do not reuse existing ids.
4. **Place new nodes near the nodes they relate to.** Pick `x`/`y`
   offsets of around 160px from the most-related existing node so the
   canvas layout stays readable.
5. **If the instruction is ambiguous, destructive, or would require
   information you don't have**, return `patched_config` identical to
   `current_config` and put the question in `explanation`.
6. **`projectId` and `version` stay unchanged.** Never invent or
   increment them.

## Inputs (rendered)

### Architect instruction

{{instruction}}

### Current diagram config (JSON)

{{current_config}}

## Output

Return a single JSON object:

```
{
  "patched_config": { ...full DiagramConfig with minimal edits... },
  "explanation": "One paragraph describing what you changed and why, or — if you couldn't safely apply the instruction — what you would need to know."
}
```

No prose outside the JSON. No markdown fences. No commentary.
