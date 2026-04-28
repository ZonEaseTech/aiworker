# PLAN-026 Codex app-server protocol compatibility for 0.4.1

- **status**: completed
- **createdAt**: 2026-04-28 10:40
- **approvedAt**: 2026-04-28 10:40
- **completedAt**: 2026-04-28 10:50
- **relatedTask**: BUG-024

## Current State

`v0.4.0` is published and the test-server fleet gateway is upgraded, but the
release e2e scenario with a local Codex worker failed during the first real
chat turn. The worker joined the fleet successfully and remote `config get`
confirmed `executor.engine="codex"`, but installed `codex-cli 0.125.0` rejected
the executor's legacy `thread_start` request.

## Proposal

1. Keep the legacy Codex app-server path unchanged for older CLI versions.
2. Detect legacy `thread_start` rejection and retry with current
   `thread/start`.
3. Use current `turn/start` input payloads and close the executor event queue
   on `turn/completed`.
4. Normalize current Codex notifications into `AgentEvent`s.
5. Update the Codex default model and Web model hints to current Codex models.
6. Release `@zonease/aiworker-cli@0.4.1`, upgrade the test fleet, restart the
   local worker, and rerun the e2e chat.

## Risks

- Codex app-server is not a stable public API. Keep compatibility additive and
  narrow instead of replacing the legacy path.
- Current Codex CLI exposes richer event shapes than AIWorker currently
  displays. This patch maps only the event types required for chat progress,
  token usage, errors, and completion.

## Scope

In scope:

- Codex executor protocol negotiation.
- Codex notification normalization.
- Codex default model metadata.
- Focused tests and patch release.

Out of scope:

- Full rendering of every new Codex app-server notification.
- Permission profile or sandbox policy redesign.
- General Codex model discovery from the app-server at runtime.

## Implementation

- Added protocol negotiation in the Codex executor: try legacy
  `thread_start`, then fall back to current `thread/start` when the installed
  Codex CLI rejects the legacy method.
- Added current `turn/start` request support and terminal queue close on
  `turn/completed`.
- Normalized current Codex notification methods for assistant deltas, reasoning
  deltas, token usage, turn completion, and errors.
- Updated the Codex default model and Worker Web model hints to current Codex
  models.
- Extended the Codex stub and focused tests to cover both protocol variants.

## Verification

- Focused Codex executor / normalizer / protocol tests passed.
- `bun run check` passed.
- `bun run test` passed.
- `bun run build` passed.
- CLI run and fleet smokes passed.
- `git diff --check` passed.
- Publish dry-run packed the expected `0.4.1` npm artifact.
- GitHub release workflow for `v0.4.1` passed.
- npm latest is `@zonease/aiworker-cli@0.4.1`.
- Test server gateway upgraded to `0.4.1` and `/health` returned ok.
- Final test-server fleet to local Codex worker e2e chat returned
  `finishReason=stop`.
