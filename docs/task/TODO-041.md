# TODO-041 Gateway enrollment hints in init dotenv and doctor

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-08 01:46
- **claimedAt**: 2026-05-08 01:46
- **completedAt**: 2026-05-08 01:59
- **plan**: PLAN-166
- **sourceObjective**: Make optional gateway enrollment discoverable without
  adding interactive questions to `aiworker init`.
- **relatesTo**: TODO-040, PLAN-165, docs/cli.md, apps/cli/src/lib/dotenv-bootstrap.ts,
  apps/cli/src/commands/worker/doctor.ts

## Context

`aiworker env gateway-url` and `aiworker env display-name` now exist, but a new
worker-local `.env` still does not reserve commented examples for those startup
keys. `aiworker doctor` also validates Project Brain state without explaining
that standalone gateway enrollment is optional and configurable later.

## Scope

- Add commented gateway enrollment examples to newly minted worker-local `.env`
  files.
- Add doctor INFO output for standalone gateway enrollment and missing display
  name.
- Cover the new dotenv and doctor output with focused tests.

## Out of Scope

- No interactive `init` prompts.
- No gateway runtime protocol changes.
- No change to standalone worker validity.
- No empty env assignments such as `AIWORKER_GATEWAY_URL=`.

## Acceptance Criteria

1. New worker-local `.env` includes commented `AIWORKER_GATEWAY_URL` and
   `AIWORKER_DISPLAY_NAME` examples.
2. Commented examples do not populate `process.env`.
3. `aiworker doctor` reports gateway enrollment as standalone/configured with
   INFO-level next-step guidance.
4. Existing configured values remain authoritative and are not overwritten.

## Validation

- `bun run --filter '@zonease/aiworker-cli' test src/lib/dotenv-bootstrap.test.ts src/commands/worker/doctor.test.ts src/commands/worker/env.test.ts src/aiworker.test.ts src/lib/bootstrap.test.ts` — pass (58 tests).
- `bun run typecheck` — pass.
- `bun run lint` — pass.
- `bun run --filter '@zonease/aiworker-cli' build:bundle` — pass.
- `git diff --check` — pass.
- Manual temporary project check: `aiworker init --soul developer` generated
  commented gateway/display-name examples; `aiworker doctor` reported
  standalone gateway enrollment with INFO next-step commands.
