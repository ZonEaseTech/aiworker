---
name: aiworker-refactor-dev-loop
description: Use when continuing AIWorker destructive refactor implementation, Freeform v1 golden path, host-daemon broker routes, worker_config envelope, Host metadata schema, engine projection, engine bridge, mounted workbench proof, or contract-test driven migration work. This skill keeps development moving after a short preflight and prevents audit-only status reports.
---

# AIWorker Refactor Dev Loop

This skill is a development loop guardrail. It is not an architecture authority.

Canonical authority is:

- `AGENTS.md`
- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`

Retired planning drafts such as `tmp/refactor/` are not part of this loop. Do
not use them to resolve implementation questions. If canonical docs are silent
on a required contract, stop and update or clarify the canonical docs before
continuing.

## Core Rule

The task is development progress, not audit.

Do a short preflight. If no P0/P1 drift exists, implement one smallest
verifiable slice before final response.

Do not stop at a status report unless the user explicitly asks for status,
audit, review, or planning only.

Use Superpowers as the workflow engine:

- use `superpowers:brainstorming` when a slice changes architecture, behavior,
  product shape, or user-facing workflow and the design is not already fixed by
  canonical docs;
- use `superpowers:writing-plans` before multi-step implementation plans;
- use `superpowers:test-driven-development` for behavior changes where a focused
  test can be written before implementation;
- use `superpowers:systematic-debugging` for failures or unexpected behavior;
- use `superpowers:verification-before-completion` before claiming a slice is
  complete.

Superpowers are process guidance. Canonical docs remain architecture authority.

## Zero-Trust Review Contract

Use a zero-trust posture at two gates: startup and completion.

At startup, treat previous summaries, memory, old final responses, cached test
results, subagent claims, and uncommitted diffs as untrusted until current
evidence confirms them.

- Re-read authority from current files, not recalled conversation.
- Verify git state before choosing a slice.
- Re-run required preflight checks instead of trusting old pass results.
- Re-check P0/P1 drift against current code and canonical docs.
- Pick the next slice from current evidence, not from stale plans.

At completion, review the work as if the implementation is wrong until proven
otherwise.

- Confirm the changed files match the declared slice scope.
- Confirm tests or verification actually cover the touched behavior.
- Confirm no old docs/E2E/retired drafts were used as authority.
- Confirm Host/Soul, protocol, runtime, and monorepo boundaries did not drift.
- Confirm no unrelated files are staged and no secret-bearing data is copied into
  descriptor, DB, receipt, log, diagnostic output, OpenAPI example, or UI.
- Confirm owned subagents are joined and closed before commit or final response.
- If a claim cannot be backed by fresh evidence, do not claim it and do not
  commit it.

If the active user prompt or goal explicitly authorizes subagents, use them by
default for independent exploration, implementation, or verification sidecars.
Keep the main agent on the critical path and integrate subagent findings before
the final response.

## Subagent Reclamation Contract

Subagents are short-lived sidecars, not durable background workers.

Every subagent spawned during the current turn must have an owned-agent ledger:
agent id, task, expected output, spawned time, result status, and close status.

- Do not ask a subagent to wait around for manual cleanup. The main agent owns
  cleanup.
- When a subagent reaches a final status, collect the result and immediately
  call `close_agent` for that agent id.
- Do not start the next slice, phase commit, or final response while any
  current-turn owned subagent is still open.
- Before compaction-sensitive handoff, final response, or phase commit, reconcile
  the ledger: every owned subagent must be joined and closed, or explicitly
  cancelled/closed if it no longer matters.
- If a subagent cannot be joined or closed, keep the goal active, report the
  agent id and reason, and do not spawn more subagents until recovery is clear.
- After compaction recovery, do not assume old subagents are valid progress
  sources. If their ids are known, close stale owned agents before spawning new
  ones. If their ids are unknown, avoid new subagents until the turn can proceed
  safely with local work.
- Reuse or close; never leave a subagent open merely because its answer was
  already read.

## Anti-Exit Contract

When this skill is used inside an active long-running goal, keep the goal active
unless the user explicitly stops it or the Exit Criteria below are satisfied.

- Completing one slice is progress, not goal completion.
- Passing preflight is not goal completion.
- Context compaction, low confidence, a failing test, or a confusing code path is
  not a reason to exit the goal.
- Do not mark the goal `complete` until the Exit Criteria are satisfied.
- Do not mark the goal `blocked` for ordinary drift, failing tests, or unknown
  code. First rehydrate, shrink the slice, choose another slice, or fix the
  drift.
- Mark the goal `blocked` only when the same blocker repeats for at least three
  consecutive goal turns and no alternate slice can make meaningful progress.

If no persistent goal exists, run the same loop for the current turn. Create or
update a goal only when the user explicitly asks for goal mode.

## Compaction Recovery

At the start of each goal turn, and after any context compaction or resume,
rehydrate from current project state before choosing work:

1. Read `AGENTS.md`.
2. Read the five canonical docs.
3. Read this skill.
4. Inspect `git status --short` and preserve user or concurrent-session changes.
5. Apply the startup side of the Zero-Trust Review Contract.
6. Reconcile any known owned subagents from the previous turn by joining or
   closing them before spawning new ones.
7. Run `bun run docs:check` and `bun run test:contracts`.
8. Check the Drift Gate.
9. Choose the next smallest verifiable slice from current code state.

Never reconstruct architecture from memory, retired `tmp/refactor` drafts, old
E2E assumptions, or stale conversation summaries.

## Exit Criteria

Only end a long-running refactor goal when all of these are true:

- canonical docs describe the current implemented architecture;
- Freeform v1 golden path is verified through CLI, Web, host-daemon, mounted
  workbench, and engine bridge;
- Host/Soul descriptor-only boundaries are enforced by tests;
- monorepo app/package/soul boundaries are enforced by tests;
- old app/package authority cannot return without failing a guardrail;
- `docs:check`, `test:contracts`, and the relevant slice verification pass;
- no P0/P1 architecture drift remains.

## Phase Commit Contract

Use commits as the durable progress anchor for long-running goal work.

After a development slice is verified, create a conventional commit before the
final response unless the user explicitly forbids commits or the commit would be
unsafe.

- Commit after verification, not before it.
- For code changes, run code-review-graph before committing unless it is
  unavailable; if skipped, state the reason.
- Stage only files changed by the current slice. Never use `git add .`.
- Preserve unrelated user or concurrent-session changes as unstaged.
- Do not commit failing tests, unverified code, incomplete boundary changes, or
  mixed unrelated work.
- Use conventional commit messages, for example `feat(scope): ...`,
  `fix(scope): ...`, `test(scope): ...`, `docs(scope): ...`, or
  `chore(scope): ...`.
- Docs-only, instruction-only, and pure formatting slices may commit after
  light verification such as `git diff --check`.
- If a slice cannot be committed, keep the goal active and report the exact
  reason, remaining uncommitted files, and the next recovery step.

## Preflight

Keep preflight short. Read `AGENTS.md` and the five canonical docs, then check:

```text
git status --short
bun run docs:check
bun run test:contracts
```

Also verify by inspection:

- root `package.json` workspaces include `apps/*`, `packages/*`, `souls/*`;
- `apps/api`, `apps/aiworker-*`, `packages/core`, and `packages/shared` are absent;
- `souls/aiworker-freeform` exists;
- target packages exist: `host-daemon`, `host-runtime`, `soul-protocol`,
  `engine-bridge`, `engine-projection`, `soul-workbench`.

## Drift Gate

If P0/P1 drift exists, fix drift first and verify it.

P0/P1 drift includes:

- Host imports Soul source;
- descriptor-only install/runtime is broken;
- `apps/api` becomes a capability owner again;
- `apps/aiworker-*` returns as Soul locations;
- `packages/core`, `packages/shared`, `core-v2`, or `shared-v2` appears;
- `packages/soul-workbench` is renamed back;
- Freeform stops being the v1 strong acceptance Soul;
- follow-up stops being session-level: `POST /api/sessions/:sessionId/invocations`;
- session stores execution/process status instead of lifecycle only;
- Host DB stores Soul domain records or engine secrets;
- author-owned native MCP secrets are copied into descriptor, DB, receipt, log,
  diagnostic output, OpenAPI example, or UI;
- mounted workbench production routing stops using `router-mode="search"`;
- old docs/E2E/project-local historical skills or retired `tmp/refactor` drafts
  are treated as authority.

If no P0/P1 drift exists, continue to a development slice.

## Slice Selection

Choose the smallest verifiable slice that advances the v1 Freeform vertical
loop. Prefer, in order:

1. Freeform v1 golden path;
2. host-daemon broker routes;
3. `worker_config` envelope / Host metadata schema;
4. engine-projection receipts;
5. engine-bridge invocation lifecycle;
6. mounted workbench `router-mode="search"` proof;
7. contract test gap.

Limit the write scope to one to three packages unless the canonical docs require
a cross-package contract change.

## Execution

For the selected slice:

1. State the slice goal and write scope in one or two sentences.
2. Invoke the relevant Superpowers workflow for the slice type.
3. When subagents are authorized, dispatch independent sidecars for parallel
   codebase reading, test-gap discovery, or verification while the main agent
   proceeds on the critical path. Record each spawned id in the owned-agent
   ledger.
4. Add or update the focused contract test first when behavior is changing.
5. Implement the smallest code change that satisfies the contract.
6. Run the smallest fresh verification that proves the touched surface.
7. For UI work, follow shadcn and `packages/ui`.
8. Do not change the new architecture to satisfy old E2E assumptions.
9. Do not add temporary design docs under `docs/`; use `tmp/`.
10. For code changes, run code-review-graph before final response. For docs-only,
   instruction-only, or pure formatting changes, state that it was skipped.
11. Apply the completion side of the Zero-Trust Review Contract.
12. Apply the Subagent Reclamation Contract: every current-turn owned subagent
   is joined and closed before moving on.
13. Apply the Phase Commit Contract before the final response.

## Minimum Completion

Each development turn must complete at least one:

- a missing/failing contract test is added or fixed and passes;
- one v1 Freeform golden path link is implemented and verified;
- one old architecture residue is removed with a guardrail test;
- one canonical docs requirement is implemented with focused verification.

## Final Response Shape

Use this concise shape:

```text
Goal: active/complete/blocked, and why.
Preflight: pass/fail, with key commands.
Slice: chosen development slice.
Zero-Trust: startup checks and completion review result.
Superpowers/Subagents: workflows used; subagents spawned/joined/closed; open
owned subagents must be 0, or explain recovery.
Changes: files changed.
Verification: commands and results.
Drift: found/fixed/none.
Commit: commit hash, or skipped with reason.
Next: one next slice.
```

Do not end with audit-only output when implementation was allowed.
