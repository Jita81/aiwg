# Skill: Fix Bug

## Input
- Bug description
- Component file path
- Console errors (if available)

## Process
1. Read the component file at the specified path
2. Identify the bug from the description and console errors
3. Fix the bug with minimal changes
4. Verify the fix compiles (if TypeScript, check types)
5. Run any relevant tests
6. Commit with message: "fix: {short description of fix}"

## Rules
- Do NOT change functionality beyond the bug fix
- Minimal changes only — fix the bug, nothing more
- If TypeScript, run tsc --noEmit to verify types
- If tests exist for the component, run them and ensure they pass
