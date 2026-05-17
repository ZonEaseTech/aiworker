# HR Native Skill Artifact Boundary Design

## Decision

HR native skills should be treated as artifact producers, not as owners of the
accepted profile state.

The service loop is:

```text
native skill -> reviewable artifact
HR product logic -> interpretation, validation and promotion policy
accepted HR state -> README.md for the current HR People Profile
Host -> projection, execution, storage, review records and protocol shell
```

For HR, `README.md` remains the accepted People Profile. That is an HR Soul App
product decision, not a generic native skill rule and not a Host platform
assumption. Other Soul Apps may choose a different accepted state surface while
still reusing the same artifact-first pattern.

## Current Context

The current HR workspace already has the core profile ledger:

- `apps/aiworker-hr/engine-assets/workspace/README.md` is the accepted People
  Profile template.
- `apps/aiworker-hr/engine-assets/workspace/AGENTS.md` says agent sessions must
  produce reviewable artifacts and must not directly update `README.md`.
- `packages/core/src/worker/runtime.ts` injects the same profile ledger boundary
  into session prompts.
- `promoteProfileRevision` can promote a reviewed artifact into `README.md`.
- HR ships five native skills:
  `candidate-profile`, `evidence-screening`, `interview-brief`,
  `hiring-risk-review` and `profile-update-proposal`.

The gap is not framework capability. The gap is responsibility wording. The
skills currently look like independent task templates, so an executor can use
them subjectively without seeing how their artifacts enter the HR product loop.
The fix should not make every skill know about `README.md`; that would leak an
HR product decision into the native skill layer.

## Boundary Model

### Native Skill Layer

A native skill owns only the artifact it produces.

It may define:

- when to use the skill;
- expected inputs;
- artifact shape;
- evidence, assumptions, risks and human-decision boundaries;
- privacy and compliance constraints for the produced artifact.

It should not define:

- whether the artifact updates `README.md`;
- which accepted-state section changes;
- promotion rules;
- Host storage or protocol behavior;
- cross-Soul assumptions about canonical state.

This keeps native skills portable across engines and easy for other Soul Apps to
adopt. A QA skill can produce a regression artifact; a finance skill can produce
a reconciliation artifact; a PM skill can produce a roadmap artifact. None of
them needs the HR `README.md` convention.

### Soul App Product Layer

The Soul App product owns how artifacts become domain state.

For HR, product logic owns:

- artifact taxonomy;
- profile section mapping;
- review requirements;
- risk gates;
- promotion policy;
- accepted-state writes;
- how supporting artifacts are referenced by the People Profile.

This layer may say that a reviewed `profile-update-proposal` can become the next
accepted `README.md`, while an `interview-brief` usually stays a supporting
artifact and may only update profile next actions after review. That is HR
domain logic and belongs to the HR Soul App.

### Host Layer

Host remains generic. It projects app-owned workspace files and native skills,
runs sessions, stores metadata, records artifacts and reviews, serves protocol
surfaces and executes generic promotion plumbing when explicitly called.

Host must not infer that all Soul Apps have a `README.md` core, that an artifact
means a particular domain change, or that a review verdict has HR-specific
meaning. It may provide reusable mechanics, but the Soul App owns semantics.

## HR Product Contract

HR should define the product loop in app-owned instructions and docs:

```text
accepted state: People Profile
accepted state surface: README.md
session output: artifacts/<sessionId>/*
review record: reviews/*.md
promotion gate: HR product review with pass or warn
promotion result: README.md updated, review recorded, git revision created when available
```

The workspace instruction should keep the operational rule simple:

- durable session results are artifacts first;
- executor output is not accepted profile state;
- product review decides whether an artifact can affect the People Profile;
- only product-owned promotion logic updates `README.md`.

The skill files should point to artifact duties, not promotion duties.

## HR Artifact Taxonomy

The first HR taxonomy should be small and explicit:

| Artifact | Native skill | Product meaning |
| --- | --- | --- |
| Candidate profile artifact | `candidate-profile` | Candidate-focused profile work product. May propose profile section changes after review. |
| Evidence matrix | `evidence-screening` | Supporting evidence artifact. May be referenced by profile proposals. |
| Interview brief | `interview-brief` | Supporting artifact for interview planning. May feed profile next actions only after review. |
| Hiring risk review | `hiring-risk-review` | Promotion guard artifact. It reviews whether another artifact is safe to promote. |
| Profile update proposal | `profile-update-proposal` | Direct candidate for People Profile promotion when review passes or warns. |

This taxonomy should live in HR product-owned material, not in Host code.

## Expected Flow

```text
operator starts HR session
  -> selected native skill produces artifact under artifacts/<sessionId>/
  -> HR product classifies artifact kind
  -> HR product applies review policy
  -> human review records pass, warn, fail or needs_review
  -> only pass/warn profile update proposals can be promoted
  -> HR product promotion updates README.md
  -> Host records metadata and review events
```

Supporting artifacts can still matter even when they never become accepted
profile state. They can provide evidence, risk analysis, interview planning or
review context that a later `profile-update-proposal` references.

## Error Handling And Safety

- If a skill output claims to update the accepted profile directly, treat it as
  an invalid artifact and ask for a profile update proposal instead.
- If an artifact lacks source references, the HR product review should return
  `needs_review` or `fail`.
- If a risk review flags protected-class inference, unsupported personal
  judgment, copied sensitive evidence or unapproved employment commitment, the
  product promotion should stop.
- If an artifact kind is unknown, keep it as a session artifact and do not
  promote it.
- If a Soul App does not declare a product promotion path, Host should not
  invent one.

## Scope

The first implementation should stay instruction-level and HR-owned:

- refine HR native skill wording so every skill clearly produces an artifact;
- refine HR workspace instructions so promotion belongs to HR product review,
  not to skill execution;
- add HR product taxonomy guidance in app-owned material;
- preserve current runtime, manifest and Host protocol behavior.

Do not change shared manifest schema, public protocol or Host promotion
framework in this slice. A future Soul App may justify a generic product-state
descriptor, but HR does not need that framework change to close the current
instruction loop.

## Validation

Because this design only changes instructions and product guidance, validation
for the later implementation should focus on:

- `git diff --check`;
- `aiworker app validate apps/aiworker-hr`;
- focused projection/runtime tests if workspace templates or native skills are
  changed;
- no code-review-graph requirement for docs-only or instruction-only edits.

If implementation later touches runtime code, promotion code, manifest schema or
shared protocol, the validation scope must expand to the affected package tests
and code-review-graph.
