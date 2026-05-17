# TODO-043 Make HR native skill artifact kinds first-class

- **status**: completed
- **priority**: P1
- **owner**: codex
- **createdAt**: 2026-05-17
- **claimedAt**: 2026-05-17
- **completedAt**: 2026-05-17
- **plan**: PLAN-345
- **relatesTo**: apps/aiworker-hr/soul-app.manifest.json, apps/aiworker-hr/product/artifacts, packages/core/src/worker/executor.ts

## Context

The 30-turn HR matrix exercised five native skills, but AIWorker registered all
artifacts through only two capability output kinds: `person-profile` and
`candidate-screen`.

Observed examples:

- `interview-brief` artifacts registered as `person-profile`.
- `hiring-risk-review` artifacts registered as `candidate-screen`.
- `profile-update-proposal` artifacts registered as `person-profile`.

## Desired Outcome

HR should expose first-class artifact kinds for native skill outputs such as
`interview-brief`, `hiring-risk-review`, `evidence-matrix`, and
`profile-update-proposal`, or provide a protocol-level way for native skills to
declare artifact kind without expanding Host product semantics.

## Acceptance Criteria

- Each HR native skill output can be registered with a product-meaningful kind.
- Existing Host/Soul boundaries remain intact: Host records descriptors; HR owns
  the meaning and promotion rules.
- Artifact preview/review surfaces can distinguish supporting artifacts from
  promotable profile proposals.

## Implementation Plan

- Covered by `PLAN-345`.

## Resolution

HR now declares first-class artifact types and capability output kinds for
`evidence-matrix`, `interview-brief`, `hiring-risk`, and
`profile-update-proposal`. The app manifest and shared official fixture stay
aligned, and the new product assets live under the HR Soul App namespace.

## Verification

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-hr' test`
