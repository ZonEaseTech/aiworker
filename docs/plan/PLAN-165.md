# PLAN-165 Progressive CLI help and worker startup env shortcuts

- **status**: completed
- **createdAt**: 2026-05-08 01:06
- **approvedAt**: 2026-05-08 01:06
- **completedAt**: 2026-05-08 01:32
- **relatedTask**: TODO-040

## Current State

`apps/cli/src/help.ts` renders root help by expanding every local worker
shortcut, every canonical `worker` command, fleet commands, and gateway
commands. This is accurate but too large for first contact.

`AIWORKER_GATEWAY_URL` and `AIWORKER_DISPLAY_NAME` are already part of the
worker env schema and are persisted by `bootstrapDotenv()` when present in the
process environment. The current public onboarding path still asks users to
append those keys to `.aiworker/local/.env` manually.

## Proposal

1. Change root help to a short task-oriented first screen: start, inspect,
   configure executor, run, serve, and fleet enrollment.
2. Keep group-level help (`aiworker worker --help`, `aiworker fleet --help`,
   `aiworker gateway --help`) as the full command discovery surface.
3. Add `aiworker env gateway-url <url>` and
   `aiworker env display-name <name>`, plus `worker env ...` canonical forms,
   to write only allowlisted startup env keys into the current worker-local
   `.env`.
4. Keep these env shortcuts separate from `config set`, because they update
   startup env rather than worker DB config JSON.

## Risks

- If the shortcut created `.env` before `init`, it could prevent
  `bootstrapDotenv()` from minting missing secrets. The command must require an
  existing initialized worker-local `.env`.
- Root help snapshots and command registration tests must be updated together.
- The command name should not imply gateway lifecycle management; `env` is the
  least misleading namespace for worker-local startup env.

## Scope

- `apps/cli/src/help.ts`
- `apps/cli/src/aiworker.ts`
- new worker env command module and tests as needed
- `docs/cli.md`
- `README.md` / `README.zh-CN.md`
- PMA task/plan/changelog

## Alternatives

- Use `config set` for these keys. Rejected because they are process startup
  env, not worker DB config JSON.
- Add `gateway url` commands. Rejected because `gateway` is already the gateway
  lifecycle namespace and would blur worker-side enrollment config.
- Only document manual `.env` edits. Rejected because this keeps first-run
  enrollment unnecessarily shell-heavy.

## Verification

- Focused CLI tests for help, argv folding, and env shortcut writes.
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run typecheck`
- `bun run lint`
- `git diff --check`

## Progress

- 2026-05-08 01:06: Plan opened as implementing after user approved the
  progressive help direction and added the gateway URL / display name shortcut
  requirements.
- 2026-05-08 01:32: Implemented short root help, full command index discovery,
  worker-local gateway/display-name env shortcuts, README/CLI docs, and focused
  test coverage.

## Result

- Root `aiworker --help` now stays first-run oriented and points users to
  scoped help / full command index for advanced discovery.
- `aiworker env gateway-url <url>` and `aiworker env display-name <name>` write
  allowlisted startup env keys to the current initialized worker-local `.env`;
  `aiworker worker env ...` forms are registered as canonical equivalents.
- `commands` / help / diagnostic / env-shortcut commands do not trigger
  automatic dotenv bootstrap side effects.

## Validation Result

- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts src/commands/worker/env.test.ts src/lib/bootstrap.test.ts` — pass (43 tests).
- `bun run typecheck` — pass.
- `bun run lint` — pass.
- `bun run --filter '@zonease/aiworker-cli' build:bundle` — pass.
- `git diff --check` — pass.
