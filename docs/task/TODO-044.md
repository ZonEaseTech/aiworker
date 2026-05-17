# TODO-044 Materialize capability prompt and review content for external engines

- **status**: completed
- **priority**: P2
- **owner**: codex
- **createdAt**: 2026-05-17
- **claimedAt**: 2026-05-17
- **completedAt**: 2026-05-17
- **plan**: PLAN-345
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

## Implementation Plan

- Covered by `PLAN-345`.

## Resolution

Host metadata enrichment now reads app-authored capability prompt and review
assets for manifest-path Soul Apps. Runtime materializes those assets under the
session context directory and includes them in external-engine invocation
prompts, without interpreting HR domain semantics.

## Verification

- `bun run --filter '@zonease/aiworker-core' test src/worker/executor.test.ts src/worker/runtime.test.ts src/host/runtime.test.ts src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
