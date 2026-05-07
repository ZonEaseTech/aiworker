# PLAN-166 Gateway enrollment hints in init dotenv and doctor

- **status**: completed
- **createdAt**: 2026-05-08 01:46
- **approvedAt**: 2026-05-08 01:46
- **completedAt**: 2026-05-08 01:59
- **relatedTask**: TODO-041

## Current State

`aiworker init` creates a worker-local `.env` through `bootstrapDotenv()`.
Gateway enrollment startup env is persisted when explicitly provided, but a
fresh `.env` has no commented examples for `AIWORKER_GATEWAY_URL` or
`AIWORKER_DISPLAY_NAME`.

`aiworker doctor` validates Project Brain capability state and scope metadata.
It does not currently surface whether the worker is standalone or configured to
join a gateway.

## Proposal

1. Add a small commented optional gateway enrollment section to newly minted
   worker-local `.env` files.
2. Keep the examples commented when unset, and continue writing real values
   only when explicit process env is present or `aiworker env ...` is run.
3. Add a doctor gateway enrollment section:
   - standalone mode: INFO with `aiworker env gateway-url` and
     `aiworker env display-name` guidance.
   - gateway URL set but display name missing: PASS for URL, INFO for display
     name fallback and shortcut.
   - gateway URL and display name set: PASS for both.

## Risks

- Empty uncommented env assignments would break runtime validation, so examples
  must stay commented.
- Doctor must remain zero-side-effect and should only read existing worker-local
  `.env`.
- Gateway absence is valid standalone mode, so the output must be INFO, not WARN.

## Scope

- `apps/cli/src/lib/dotenv-bootstrap.ts`
- `apps/cli/src/lib/dotenv-bootstrap.test.ts`
- `apps/cli/src/commands/worker/doctor.ts`
- `apps/cli/src/commands/worker/doctor.test.ts`
- PMA task/plan/changelog

## Verification

- Focused dotenv and doctor tests.
- Focused CLI onboarding tests if affected.
- `bun run typecheck`
- `bun run lint`
- `git diff --check`

## Progress

- 2026-05-08 01:46: Plan opened after deciding not to add init prompts and to
  make gateway enrollment discoverable through `.env` comments plus doctor INFO.
- 2026-05-08 01:59: Implemented init dotenv comments, doctor gateway enrollment
  INFO/PASS output, focused tests, docs, and changelog.

## Result

- New worker-local `.env` files include commented examples for
  `AIWORKER_GATEWAY_URL` and `AIWORKER_DISPLAY_NAME`; unset values remain
  comments, not empty assignments.
- `aiworker doctor` now shows a gateway enrollment section and suggests
  `aiworker env gateway-url` / `aiworker env display-name` when the worker is
  standalone.
- When a gateway URL is configured, doctor reports it without printing the URL
  value; missing display name remains INFO with a shortcut.

## Validation Result

- `bun run --filter '@zonease/aiworker-cli' test src/lib/dotenv-bootstrap.test.ts src/commands/worker/doctor.test.ts src/commands/worker/env.test.ts src/aiworker.test.ts src/lib/bootstrap.test.ts` — pass (58 tests).
- `bun run typecheck` — pass.
- `bun run lint` — pass.
- `bun run --filter '@zonease/aiworker-cli' build:bundle` — pass.
- `git diff --check` — pass.
- Manual temporary project check: `aiworker init --soul developer` generated
  commented gateway/display-name examples; `aiworker doctor` reported
  standalone gateway enrollment with INFO next-step commands.
