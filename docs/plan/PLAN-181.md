# PLAN-181 AIWorker 1.0 proof-loop readiness

- **status**: draft
- **createdAt**: 2026-05-09 03:12
- **relatedTask**: FEAT-056

## Current State

The 1.0 proof-loop needs a final readiness slice after implementation and dogfood
evidence. Without closeout, docs can overclaim or under-explain what AIWorker
actually governs.

## Goal

Package the developer repo worker proof loop into a coherent 1.0 readiness story:
docs, governance status, validation, and release criteria all match implemented
behavior.

## Scope

- Update README / CLI docs / architecture / governance status to describe:
  - Journal;
  - Gate verdict;
  - Brain Engine reviewer;
  - Brain Inbox;
  - authority mode;
  - developer repo proof-loop workflow.
- Add or update validation commands and harness docs.
- Decide whether the current release should remain pre-1.0, ship as a milestone,
  or reserve final release work for a separate REL task.
- Close FEAT-056 only if dogfood evidence supports the product claim.

## Non-Goals

- No new runtime feature beyond closeout fixes.
- No marketing-style claims stronger than implemented behavior.
- No 1.0 release without explicit approval.

## Acceptance Criteria

1. User-facing docs explain why to install AIWorker for the developer repo worker
   proof loop.
2. Architecture docs match implementation boundaries and no-false-security
   authority promise.
3. Governance status identifies conforming rows and residual risk.
4. FEAT-056 has a clear completed / blocked / partial outcome based on evidence.

## Verification

- `bun run check` if implementation changes landed in prior plans.
- Focused harness / dogfood evidence from PLAN-180.
- `git diff --check`

## Dependencies

- **blocked by**: PLAN-180
- **relatesTo**: GOALS.md, docs/governance-node-status.md, docs/changelog.md
