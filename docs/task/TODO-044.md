# TODO-044 Materialize capability prompt and review content for external engines

- **status**: pending
- **priority**: P2
- **owner**: unassigned
- **createdAt**: 2026-05-17
- **plan**: PLAN-344
- **relatesTo**: packages/shared/src/soul-app/registry.ts, packages/core/src/host/runtime.ts, packages/core/src/worker/runtime.ts

## Context

Real Codex sessions receive input hints such as
`Prompt ref: ./product/workflows/person-profile/prompt.md`, but the projected
workspace does not contain those product files. In the first pilot session,
Codex explicitly reported that the hinted product prompt/review files were not
present and fell back to the projected session context plus native skill file.

## Desired Outcome

When Host starts an external-engine session from a Soul App capability, the
engine should receive the capability prompt and review rubric content, not only
source refs that are inaccessible from the workspace.

## Acceptance Criteria

- Capability prompt/review content is materialized into session context or
  otherwise embedded in runtime metadata.
- External engines can follow product workflow guidance without reading app
  source files outside the workspace.
- The mechanism remains Soul App-owned and does not make Host interpret HR
  profile semantics.
