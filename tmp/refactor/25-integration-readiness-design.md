# Integration Readiness Design

Date: 2026-05-27 Asia/Shanghai
Branch: `codex/destructive-refactor`
Baseline HEAD before readiness: `6d4e6a63 refactor: 固化 Freeform golden path 验收`

## Authority

This file is non-authoritative evidence for the next handoff step. The active
AIWorker contract remains only:

- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`

`tmp/refactor/*` is historical evidence and must not override the canonical
docs.

## Goal

Confirm the destructive refactor is ready for PR/release handoff by running the
fresh integration readiness gates on the current branch and by classifying the
known compatibility or historical residue observed during baseline patrol.

Do not claim root `bun run test` or root `bun run build` pass until this phase
runs them fresh and records the result.

## Scope

This phase is verification-first. It does not change product code unless a
fresh command or drift check exposes a P0/P1 issue.

Included:

- rerun the minimum release gates requested for integration readiness;
- add root `bun run test` and root `bun run build` for PR/release-level
  confidence;
- classify the observed compatibility and historical residue;
- prepare a concise PR/release handoff if no P0/P1 issue remains.

Excluded unless a P0/P1 is proven:

- deleting compatibility CLI commands or local compatibility routes;
- rewriting drizzle migration history;
- migrating QA/HR descriptor-producing samples;
- treating lint warnings as blockers without fresh evidence that they now
  break a release gate.

## Verification Plan

Run these commands from `/Users/ben/projects/aiworker` in this order:

1. `bun run test:cli`
2. `bun run test:browser:freeform`
3. `bun run test:contracts`
4. `bun run test:protocol`
5. `bun run lint`
6. `bun run crg:update`
7. `bun run crg:review`
8. `bun run test`
9. `bun run build`

If an early command fails, stop the release-readiness claim, record the exact
failure, classify severity, and only fix after identifying whether the failure
is a contract drift, test fragility, environment issue, or unrelated existing
problem.

## Observed Issues To Classify

### `turn send` CLI compatibility command

Current evidence: `apps/cli/src/aiworker.ts` still registers `turn send`, while
the canonical follow-up route and preferred CLI proof use session-level
invocation through `session invoke`.

Blocker threshold:

- P0/P1 if `turn send` is used as the main Freeform follow-up proof;
- P0/P1 if `turn send` bypasses `engine_invocations` or contradicts session
  lifecycle semantics;
- non-blocking compatibility debt if it remains an old command surface and the
  release gates prove `session invoke` as the authoritative path.

### `/api/local/.../turns` compatibility routes

Current evidence: local routes under `/api/local/.../turns` still exist for
mounted/runtime compatibility, while canonical broker follow-up is
`POST /api/sessions/:sessionId/invocations`.

Blocker threshold:

- P0/P1 if these routes are documented as canonical broker follow-up;
- P0/P1 if Freeform browser proof depends on them instead of session-level
  invocations;
- P0/P1 if they store or expose Soul domain workflow state in Host;
- non-blocking compatibility debt if they are local compatibility shims and do
  not undermine the canonical route or descriptor-only boundary.

### Historical drizzle `reviews` migration/meta residue

Current evidence: old drizzle migration and meta snapshots can still contain
historical `reviews` references, while active Host DB schema guardrails reject
domain tables.

Blocker threshold:

- P0/P1 if active schema creation still creates `reviews` or other Soul domain
  tables;
- P0/P1 if runtime snapshots expose review/profile/business domain objects as
  Host-owned state;
- non-blocking historical residue if old migration history is inert and current
  schema/tests prove the active DB no longer owns those domain tables.

## Readiness Decision Rule

The phase may proceed to PR/release handoff only if:

- all fresh verification commands above pass, or any failure is explicitly
  classified as non-blocking with evidence;
- no observed issue meets the P0/P1 blocker threshold;
- the final report distinguishes fresh verification from previous-session
  evidence;
- root `bun run test` and root `bun run build` are reported only from this
  phase's fresh output.

If a P0/P1 issue appears, stop handoff work and produce:

- the command or search evidence;
- impacted files;
- proposed correction;
- focused contract tests required before re-entering readiness.

## Handoff Output

If readiness passes, prepare a concise handoff containing:

- branch and HEAD;
- clean/dirty worktree state;
- command results with pass/fail counts when available;
- classification of the three observed issues;
- remaining non-blocking debt, including QA/HR sample migration and existing
  lint warnings if still present;
- whether PR/release handoff is ready, not pushed, or blocked.
