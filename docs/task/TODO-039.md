# TODO-039 README product positioning clarity

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-07 23:36
- **claimedAt**: 2026-05-07 23:36
- **completedAt**: 2026-05-07 23:36
- **plan**: PLAN-163
- **relatesTo**: REL-026, QA-021

## Problem

The README described AIWorker's architecture but did not state the product
reason early enough. New users could still read AIWorker as another coding
assistant or executor platform.

## Expected

The README should state up front that AIWorker turns existing external
executors into durable, scope-bound, governed workers. It should also name what
AIWorker is not: not a replacement for Codex / Claude Code / Cursor / Hermes /
OpenClaw, and not the owner of executor-native MCP, plugins, sandbox, auth, or
model routing.

## Resolution

Added a "Why AIWorker exists" section to both English and Chinese README files.
The new section frames Project Brain, governed self-iteration, bring-your-own
executor, and Worker/Fleet operations as the core competitive surface.

## Validation

- `git diff --check` passed.
