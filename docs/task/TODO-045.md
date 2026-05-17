# TODO-045 Clarify capability asset source refs for external engines

- **status**: completed
- **priority**: P2
- **owner**: codex
- **createdAt**: 2026-05-17
- **claimedAt**: 2026-05-17
- **completedAt**: 2026-05-17
- **plan**: PLAN-346
- **relatesTo**: packages/core/src/worker/runtime.ts, packages/core/src/worker/runtime.test.ts

## Background

The follow-up HR regression run showed that real Codex turns repeatedly treated
`./product/workflows/...` capability asset refs as workspace files and reported
that they did not exist. The content was correctly embedded and materialized
under `.aiworker/sessions/<session>/context/capability/`, but the wording
still invited the engine to chase an app source path inside the workspace.

## Resolution

Runtime prompts and projected session-only capability files now describe these
paths as app-owned source refs and explicitly tell external engines to use the
embedded content rather than expecting the ref to exist in the workspace.

## Verification

- Updated worker runtime coverage for the invocation prompt wording.
- New real sessions after this change should stop treating app source refs as
  workspace files.
