# PLAN-024 Phase A hardening — project-scope CLI placement

- **status**: completed
- **createdAt**: 2026-04-28 08:46
- **approvedAt**: 2026-04-28 08:46
- **completedAt**: 2026-04-28 08:55
- **relatedTask**: BUG-021
- **bkd**: qy7pzo1m

> This is a hardening plan for PLAN-021 Phase A / PLAN-023. It must complete
> before starting the originally planned Phase B work, because later phases rely
> on project-scope runtime selection being real.

## Current State

`packages/fs-layout` has the right low-level APIs:

- `resolveAiworkerScope()` can detect project scope from `<cwd>/.aiworker/`.
- `resolveWorkerHome()` and `resolveBrainHome()` return `<project>/.aiworker/`
  in project scope.
- `ensureProjectAiworker()` seeds the intended project layout.

The CLI entrypoint breaks that contract:

- `apps/cli/src/lib/bootstrap.ts` resolves a scope and writes the result back to
  `process.env.AIWORKER_HOME`.
- `apps/cli/src/aiworker.ts` then calls `bootstrapDotenv()` a second time with
  no explicit home.
- `apps/cli/src/commands/init.ts` treats the derived `AIWORKER_HOME` as an
  operator-provided explicit override and exits through legacy bootstrap.

Focused smoke reproduction:

```text
fresh git repo + isolated HOME + aiworker init
=> explicit-scope worker ... ready ($HOME/.aiworker)
=> no <project>/.aiworker/
```

Existing tests miss the failure because they validate command registration and
`fs-layout` pure functions, not the real CLI entrypoint side effects.

## Proposal

1. Make side-effect bootstrap command-aware:
   - skip dotenv bootstrap for `scope`, help, and version commands;
   - skip bootstrap for `init` so `runInit()` can choose the correct home after
     applying `--global`, existing project detection, or brand-new project
     initialization.
2. Stop writing derived scope values into `AIWORKER_HOME`.
   - only operator-provided `AIWORKER_HOME` remains explicit;
   - project detection remains available for later `resolveAiworkerScope()`
     calls.
3. Make `runInit()` bootstrap each mode explicitly:
   - `--global`: force user-scope home before loading worker context;
   - explicit env: load that home;
   - existing project: load `<project>/.aiworker/local`;
   - brand-new project / `--force`: create layout, then load project local env.
4. Remove the duplicate unscoped `bootstrapDotenv()` call in the CLI entrypoint.
5. Add real subprocess tests around `apps/cli/src/aiworker.ts`.
6. Update docs/changelog and PMA task state after verification.

## Risks

- Some operator commands rely on dotenv being loaded before action handlers.
  The skip list must stay narrow: only `scope`, `init`, help, and version skip
  the side-effect bootstrap.
- `init --global` runs from inside a project must not accidentally select the
  project. It should pin `AIWORKER_HOME` to the user home intentionally.
- Tests must isolate `HOME` and avoid asserting secret values printed during
  first-run setup.

## Scope

In scope:

- CLI bootstrap and init behavior.
- CLI subprocess regression tests.
- PMA task/plan/changelog sync.
- BKD coordinator follow-up with verification outcome.

Out of scope:

- PLAN-021 Phase B dmScope / compaction.
- Skill/MCP per-worker configuration.
- Three-state memory injection.
- Evolution/self-iteration work.

## Alternatives

- Keep setting `AIWORKER_HOME` and add another sentinel env var to distinguish
  derived values from operator-provided values. Rejected because it preserves a
  confusing mutable global and would require every caller to understand the
  sentinel.
- Leave `scope` mutating and update docs. Rejected because `scope` is explicitly
  a diagnostic command and should be safe before data-mutating operations.

## Implementation

- `apps/cli/src/lib/bootstrap.ts` now skips side-effect dotenv bootstrap for
  `init`, `scope`, help, and version commands, and never writes derived scope
  into `AIWORKER_HOME`.
- `apps/cli/src/commands/init.ts` owns dotenv bootstrap for each init mode:
  global, explicit env, existing project, brand-new project, and `--force`.
- `apps/cli/src/commands/scope.ts` writes deterministic stdout directly so
  piped/subprocess usage can reliably inspect diagnostic output.
- `apps/cli/src/aiworker.ts` removed the duplicate unscoped
  `bootstrapDotenv()` call and avoids `process.exit()` in the `scope` handler.
- `apps/cli/src/commands/init.integration.test.ts` exercises the real CLI
  entrypoint in subprocesses with isolated `HOME`.
- `docs/cli.md` was updated to match deterministic scope output.

## Verification

- `bun run --filter '@zonease/aiworker-cli' test` -> 38 pass / 0 fail.
- `bun run typecheck` -> pass.
- `bun run lint` -> pass.
- `bun run test` -> pass across all packages.
- `bun run build` -> pass; Vite emitted existing deprecation/chunk-size warnings.
- Manual isolated smoke:
  - pre-init `aiworker scope` did not create `$HOME/.aiworker/.env`;
  - fresh git repo `aiworker init` created `<project>/.aiworker/local/worker.db`;
  - fresh git repo `aiworker init` did not create `$HOME/.aiworker/.env`;
  - post-init `aiworker scope` reported `project-detect` and top-level persona
    paths.
- PMA code review pass found no blocking issues.
