---
id: developer.codebase-orientation
name: Codebase Orientation
description: Build codebase context before editing, with narrow search, impact tracing, and focused verification.
version: 0.1.0
capabilities:
  - codebase
  - implementation
permissions:
  - filesystem-read
  - filesystem-write
  - shell
---
# Codebase Orientation Skill

Use this before implementing code changes.

## Workflow

1. Locate the smallest relevant files and tests.
2. Trace upstream inputs and downstream consumers.
3. Identify existing conventions before introducing new structure.
4. Make scoped edits that map directly to the requested behavior.
5. Run focused verification first, then broaden only when the change crosses package boundaries.

## Guardrails

- Do not rewrite unrelated code.
- Do not use destructive git operations.
- Keep secrets out of source, logs, and Brain memory.
