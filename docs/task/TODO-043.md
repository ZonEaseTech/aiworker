# TODO-043 Make HR native skill artifact kinds first-class

- **status**: pending
- **priority**: P1
- **owner**: unassigned
- **createdAt**: 2026-05-17
- **plan**: PLAN-344
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
