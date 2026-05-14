# PLAN-279 Session Artifact Status Clarity

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 15:59
- **approvedAt**: 2026-05-12 15:59
- **completedAt**: 2026-05-12 16:17
- **relatedTask**: BUG-116

## Current State

The Worker Web session route renders session status, turn events, artifact
preview, review, and memory candidates. It also receives streaming engine events
while a turn is running.

The missing UX layer is state interpretation. During real HR flow rehearsal, the
external engine wrote the markdown artifact before the daemon finished session
finalization and artifact indexing. Until indexing completed, the workbench
looked empty or simply active. That makes the agent/workbench linkage feel
broken even when the system is behaving correctly.

## Decision

Add a frontend-only session progress summary derived from existing records:

```text
turn/session running -> artifact file written -> artifact indexed -> human review
```

Render that summary in two places that the user already watches:

- the top of the chat timeline, so the current session has a headline state;
- the artifact preview rail, so an empty preview can explain whether it is empty
  because the engine is still working or because finalization is pending.

## Scope

In scope:

- Add a small shared `session-progress` helper under `apps/web/src/worker/`.
- Detect completed artifact file events from existing `LocalSessionEvent`
  payloads.
- Add compact status panels to `WorkerSessionChat` and `SessionDetail`.
- Add CSS using existing design tokens.
- Extend focused WorkerStudio tests for file-written/finalizing and
  human-review states.
- Run focused Web gates and browser validation.

Out of scope:

- Backend artifact indexing changes.
- New session event types or schema changes.
- HR-only state storage.
- A standalone status dashboard.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Playwright browser validation on the live local worker route for session
  status placement and readability.
- `bun run crg:update`
- `bun run crg:review`

## Risks

- **False finalizing state**: file-change event payloads are engine-specific.
  Mitigation: detect only completed artifact-path file events and fall back to
  normal running state otherwise.
- **Status duplication**: the chat already shows raw engine events. Mitigation:
  the new summary explains lifecycle stage, while raw events remain expandable
  evidence.
- **Overclaiming readiness**: indexed artifacts still need human review.
  Mitigation: review-ready copy explicitly says the artifact is not memory yet.

## Progress

- 2026-05-12 15:59: Plan created and approved by the operator's delegated
  design instruction. Implementation started.
- 2026-05-12 16:17: Completed the frontend-only status UX. The session route now
  distinguishes engine-running, artifact-file-finalizing, indexed pending
  review, reviewed, failed, and empty states from existing session records.
  Playwright confirmed the ready-for-review state in the live HR session route
  across desktop and mobile viewport widths with no status-card overflow.
