# PLAN-147 Harness — serve process restart continuity regression

- **status**: completed
- **createdAt**: 2026-05-07 00:58
- **approvedAt**: 2026-05-07 00:58
- **completedAt**: 2026-05-07 01:12
- **relatedTask**: TODO-037

## Current State

1. `docs/governance-node-status.md` still marks serve process restart between
   REST turns as an uncovered residual.
2. `scripts/governance-kernel-harness.ts` already starts `aiworker serve` per
   pair, runs REST health/auth/OpenAPI/SSE/admin smoke, then runs
   `runRestMultiTurnRegression()` while the same process stays alive.
3. `runRestMultiTurnRegression()` currently proves:
   - unauthenticated `POST /tasks` returns 401;
   - authenticated `POST /tasks` creates a task and persisted conversation;
   - authenticated `POST /conversations/:id/messages` continues it;
   - authenticated `GET /conversations/:id/messages` returns at least 4
     messages.
4. The missing assertion is specifically process restart continuity for the
   serve process, not Brain semantics or executor ownership.

## Proposal

1. Refactor the harness's local serve lifecycle into small helpers:
   launch serve, wait for health, stop serve, write redacted serve log.
2. Pass a restart callback into `runRestMultiTurnRegression()`.
3. After turn 1 succeeds and the conversation id is known, stop the active
   serve process, verify the port goes down, relaunch `serve` on the same
   project and port, wait for `/health`, then run turn 2 against the same
   conversation id.
4. Add one explicit check per pair for restart setup, keeping existing submit,
   continue, and messages checks intact.
5. Update governance docs and changelog only after a source-local compact run
   proves the new check.

## Risks

1. Port release can race with process shutdown. Mitigation: wait for `/health`
   to stop responding before relaunching, then wait for `/health` to return.
2. Some executor-native sessions may not resume across process restart. That
   is acceptable for this check; AIWorker must still continue the persisted
   conversation through worker-owned history projection and `worker.db`.
3. Harness runtime increases by a small amount per pair; no extra LLM turn is
   added beyond the existing REST two-turn block.

## Scope

- `scripts/governance-kernel-harness.ts`
- `docs/governance-node-status.md`
- `docs/task/TODO-037.md`
- `docs/plan/PLAN-147.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Non-Scope

- Fleet/gateway.
- Admin UI e2e.
- Release version bump.
- Executor engine behavior changes.

## Validation

- `bun scripts/governance-kernel-harness.ts --help`
- `bun run lint`
- `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts
  --mode worker-source-local --matrix compact --debug-root
  tmp/governance-kernel-plan147-source --port-base 19720 --timeout-ms 240000`
- `git diff --check`

## Progress

- 2026-05-07 00:58: PLAN-147 / TODO-037 created and claimed.
- 2026-05-07 01:12: Implemented serve lifecycle restart inside
  `runRestMultiTurnRegression()`. Source-local compact harness passed 72 / 72
  checks, including both `REST serve restart continuity setup` checks.
