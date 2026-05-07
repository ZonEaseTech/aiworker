# PLAN-152 Worker product lifecycle and Brain-Executor conformance audit

- **status**: completed
- **createdAt**: 2026-05-07 10:44
- **approvedAt**: 2026-05-07 10:44
- **completedAt**: 2026-05-07 10:47
- **relatedTask**: REFACTOR-019

## Current State

1. `docs/architecture.md` already states the Project Brain Governance Kernel
   direction and thin executor adapter boundary.
2. Recent work moved Soul identity and Brain Skill Packs toward a file-first,
   open-design-style authoring model.
3. The operator-facing mental model from `init` to `up` / `serve`, and the
   concrete Brain-to-executor loop, are still spread across implementation and
   conversation rather than written as an architecture contract.
4. Code inspection shows the intended boundary is mostly implemented, but two
   limits must be explicit:
   - runtime prompt projection advertises brain skill metadata, but does not
     currently load full `SKILL.md` bodies on demand;
   - admission materialization currently supports `memory-add` only.

## Proposal

1. Add a lifecycle section to `docs/architecture.md`:
   - `init` creates Project Brain files and local worker state;
   - `up` composes scope resolution, idempotent init, validation,
     non-blocking executor readiness, and `serve`;
   - `serve` builds the worker HTTP/admin runtime and optional gateway node.
2. Add a Brain-Executor runtime section:
   - filesystem Project Brain is the canonical context surface;
   - context manager projects persona/memory/rollup and skill summaries;
   - orchestrator calls the external executor through `ExecutorProvider.run`;
   - quality/admission/compaction are governance gates around executor output.
3. Add a conformance audit table tied to current code paths and statuses.
4. Update governance status residual risks so future developers do not assume
   unimplemented skill body loading or non-memory admission materialization.

## Risks

1. Documentation can overclaim if it omits partial implementation states.
   Mitigation: use explicit `conforming`, `partial`, and `not claimed`
   statuses.
2. Code is currently dirty with unrelated Web and Brain Skill Pack changes.
   Mitigation: only edit docs and avoid staging or reverting unrelated files.
3. Architecture docs are long. Mitigation: keep new sections dense and
   cross-link implementation status instead of duplicating every code detail.

## Scope

- `docs/architecture.md`
- `docs/governance-node-status.md`
- `docs/task/REFACTOR-019.md`
- `docs/plan/PLAN-152.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`
- `packages/shared/src/brain/admission.ts` comment-only conformance fix

## Non-Scope

- Runtime code changes.
- Executor adapter expansion.
- Admission materializer expansion.
- Browser/UI validation.

## Validation

- `git diff --check` PASS.
- `bun run --filter '@zonease/aiworker-shared' test src/brain/admission.test.ts`
  PASS: 21 pass / 0 fail.

## Progress

- 2026-05-07 10:44: Investigation and code conformance audit in progress.
- 2026-05-07 10:47: Completed. Added architecture lifecycle/runtime flow,
  code conformance table, governance residual-risk updates, and a source
  comment correction for unsupported non-memory admission materialization.
