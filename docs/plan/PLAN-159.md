# PLAN-159 Executor selection timeout override for smooth validation

- **status**: completed
- **createdAt**: 2026-05-07 13:35
- **approvedAt**: 2026-05-07 13:35
- **completedAt**: 2026-05-07 14:11
- **relatedTask**: BUG-087

## Current State

1. `ExecutorProfile.overrides.timeoutMs` is already part of the variant-body
   model and is consumed by Codex / Claude Code executors.
2. `aiworker executor select` exposes engine, variant, model, reasoning, and
   permission policy, but not timeout.
3. The Governance Kernel harness passes `aiworker run --timeout-ms 240000`
   while leaving the executor profile at its `codex/default` 120000ms cap.

## Proposal

Add a public `--timeout-ms` option to `executor select` and its `worker`
alias. Persist it as `executor.overrides.timeoutMs`, show it in the selected
executor summary, and have the harness pass its own per-turn timeout when it
selects each executor.

## Risks

1. `overrides` is intentionally shallow and engine-specific; keep the new
   field minimal and do not introduce a generic override parser.
2. Longer executor timeouts can make hung external engines wait longer. This
   is an explicit operator choice through `--timeout-ms`.
3. The previous QA-020 failure still needs a rerun after the fix.

## Scope

- `apps/cli/src/aiworker.ts`
- `apps/cli/src/commands/worker/executor.ts`
- `apps/cli/src/commands/worker/executor.test.ts`
- `scripts/governance-kernel-harness.ts`
- `docs/task/BUG-087.md`
- `docs/plan/PLAN-159.md`
- `docs/task/QA-020.md`
- `docs/plan/PLAN-158.md`
- Index/changelog/status docs as needed after validation.

## Validation

- Focused executor select CLI test.
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run typecheck`
- `git diff --check`
- Rerun `worker-source-local --matrix full` for QA-020.

## Progress

- 2026-05-07 13:35: Opened after QA-020 found the Codex 120s hard-cap
  mismatch.
- 2026-05-07 13:38: Implemented `executor select --timeout-ms`, updated the
  `worker executor select` alias, and made the harness set executor timeout
  to its per-turn budget.
- 2026-05-07 14:11: Focused CLI tests, CLI full tests, CLI typecheck, full
  typecheck, harness help, and QA-020 final full matrix all passed.
