# PLAN-298 Make Host runtime a first-class bounded context

- **status**: completed
- **createdAt**: 2026-05-13 17:54
- **approvedAt**: 2026-05-13 17:54
- **relatedTask**: REFACTOR-077

## Context

The current architecture allows `apps/api`, `apps/cli` and `apps/web` to be
separate delivery adapters. That is not the defect. The defect risk is that
Host semantics are partly encoded in each adapter instead of being owned by one
bounded context.

Current investigation found:

- `packages/core/src/soul-app/registry.ts` owns static manifest install,
  lifecycle and catalog projection primitives.
- `packages/core/src/soul-app/official.ts` owns official app bootstrap and
  legacy metadata discard primitives.
- `apps/api/src/modes/worker.ts` still directly validates available Souls,
  mints worker ids, creates worker metadata, lists templates and enriches
  template metadata.
- `apps/cli/src/aiworker.ts` duplicates similar Host decisions for app
  lifecycle, worker creation, template lookup and official bootstrap output.
- Web already consumes API state, so the first unification point is API/CLI over
  a shared Host runtime facade.

## Proposal

1. Add `packages/core/src/host/runtime.ts` as the Host bounded context facade.
2. Cover it with Host contract tests before production code.
3. Move shared Host use cases behind the facade:
   - app list/show/install/enable/disable/healthcheck;
   - official app bootstrap plus legacy metadata discard;
   - Host catalog / Soul / template lookup;
   - app-projected Soul worker creation;
   - worker runtime creation;
   - worker template validation and template metadata enrichment.
4. Refactor API routes to call the Host facade while preserving route shapes.
5. Refactor CLI commands to call the Host facade while preserving command
   shapes and JSON response contracts where practical.

## Scope

In scope:

- core Host runtime facade and contract tests;
- API/CLI adapter refactor to use the facade;
- PMA, Superpowers plan/spec and changelog updates;
- focused and root verification.

Out of scope:

- merging API/CLI/Web packages;
- changing Web UI flows;
- introducing a new `packages/host` workspace;
- remote gateway/control-plane work;
- changing Soul App protocol shape.

## Risks

- **Adapter regressions.** API and CLI responses must remain compatible with
  existing tests.
- **Over-abstraction.** The facade must only cover current duplicated Host use
  cases, not become a speculative platform layer.
- **Runtime ownership confusion.** API still owns request/stream handling and
  mounted service processes; Host core should own the rules, not Hono details.
- **ID shape drift.** Worker ids minted through the shared Host boundary should
  use the current `mintWorkerId` helper.

## Verification

- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run web:smoke:mounted-surfaces`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-13 17:54: Created and claimed after confirming Host rules are
  duplicated in API and CLI while primitives live in core.
- 2026-05-13 18:05: Completed Host runtime facade and adapter convergence for
  API and CLI while preserving existing route/command behavior.

## Verification Results

- TDD red passed: `bun run --filter '@zonease/aiworker-core' test` first failed
  because `packages/core/src/host/runtime.ts` did not exist.
- Focused gates passed:
  `bun run --filter '@zonease/aiworker-core' test`,
  `bun run --filter '@zonease/aiworker-cli' test`,
  `bun run --filter '@zonease/aiworker-api' test`,
  `bun run --filter '@zonease/aiworker-core' typecheck`,
  `bun run --filter '@zonease/aiworker-cli' typecheck`,
  `bun run --filter '@zonease/aiworker-api' typecheck`.
- Root gates passed: `bun run lint`, `bun run typecheck`, `bun run test`,
  `bun run build`.
- Runtime smoke passed: `bun run web:smoke:mounted-surfaces`.
- Integrity and review passed: `git diff --check`, `bun run crg:update`,
  `bun run crg:review`.
- code-review-graph exited 0 with overall risk 0.60 and static test-gap hints
  around `bootstrapWorkerApp`, `requireRuntime`, `requireTemplateForWorker` and
  `enrichTemplateMetadata`; new Host contract tests plus existing API/CLI
  tests and mounted surface smoke cover those adapter paths.
