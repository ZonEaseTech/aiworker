# PLAN-172 AIWorker product north star guardrail

- **status**: completed
- **createdAt**: 2026-05-09 02:07
- **approvedAt**: 2026-05-09 02:07
- **completedAt**: 2026-05-09 02:07
- **relatedTask**: DOC-007

## Current State

README explains why AIWorker exists for users. `docs/architecture.md` defines
the Brain / Executor / Fleet implementation boundary. `docs/governance-node-status.md`
records current conformance and residual risk.

The missing piece is a short, root-level north-star contract for future
development sessions. Without it, a later implementation can still drift toward
building another executor platform, generic memory layer, or coding-only project
manager.

## Proposal

1. Add `GOALS.md` as the canonical product north star.
2. Add a compact `AGENTS.md` entry that requires future sessions to read
   `GOALS.md` before Brain / Executor / Soul / Fleet / scope / memory /
   capability work.
3. Add a small `docs/architecture.md` reference so the implementation contract
   points back to the product north star.
4. Record the docs-only change in PMA and changelog.

## Scope

- `GOALS.md`
- `AGENTS.md`
- `docs/architecture.md`
- `docs/task/DOC-007.md`
- `docs/task/index.md`
- `docs/plan/PLAN-172.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Verification

- `git diff --check`

## Progress

- 2026-05-09 02:07: Plan approved by the user and PMA tracking opened.
- 2026-05-09 02:07: Added `GOALS.md`, linked it from `AGENTS.md`, added the
  architecture reference, and synchronized PMA docs.
- 2026-05-09 02:20: Added the Brain Kernel / Brain Engine / Executor split and
  Journal / Gate / Admission operating model to `GOALS.md`.
- 2026-05-09 02:35: Added 1.0 product judgment and the developer repo worker
  proof loop to `GOALS.md`.
