# PLAN-325 CLI self-updater

- **status**: completed
- **owner**: codex
- **task**: FEAT-086
- **created**: 2026-05-15
- **updated**: 2026-05-15

## Decision

Implement the approved top-level AIWorker distribution updater as a CLI-owned
module with dependency-injected release resolution, command execution,
filesystem replacement and daemon inspection.

## Work Items

1. Add updater core tests and install-source detection.
2. Add release resolution and upgrade plan building.
3. Add execution, checksum and dry-run behavior.
4. Add Host convergence and daemon restart guards.
5. Wire CLI commands and daily notices.
6. Update docs and run verification gates.

## Verification Plan

```bash
bun test --timeout=15000 apps/cli/src/updater.test.ts apps/cli/src/aiworker.test.ts
bun run --filter '@zonease/aiworker-cli' typecheck
bun run --filter '@zonease/aiworker-cli' build:bundle
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
git diff --check
bun run crg:update
bun run crg:review
```

## Verification Evidence

2026-05-15 completed:

- `bun test --timeout=15000 apps/cli/src/updater.test.ts apps/cli/src/aiworker.test.ts`
  passed with 66 tests.
- `bun run --filter '@zonease/aiworker-cli' typecheck` passed.
- `bun run --filter '@zonease/aiworker-cli' build:bundle` passed.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passed.
- `git diff --check` passed.
- `bun run crg:update` passed.
- `bun run crg:review` passed with risk score 0.00 for the final docs-only
  diff after code review fixes had passed focused CRG reviews.
