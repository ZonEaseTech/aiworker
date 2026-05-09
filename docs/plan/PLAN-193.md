# PLAN-193 Executor non-interference 0.12.2 release readiness

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 16:50
- **approvedAt**: 2026-05-09 16:50
- **completedAt**: 2026-05-09 17:04
- **task**: REL-032

## Context

REFACTOR-026 has been committed and source gates have already passed. A real
worker regression against `/Users/ben/projects/my-aiworker` also passed before
the version bump, including success, failure, and long-running native adapter
paths.

npm latest is still `0.12.1`, so the next publish target is the patch release
`0.12.2`.

## Proposal

1. Record REL-032 / QA-026 / PLAN-193.
2. Bump CLI package version to `0.12.2`.
3. Run release gates: typecheck, lint, test, build, diff check.
4. Verify dist version and publish dry-run from `apps/cli/dist`.
5. Commit release docs/version bump and tag `v0.12.2`.
6. Push `main` and tag, monitor release workflow, verify npm/GitHub assets.
7. Run published-package compact governance harness and close REL/QA docs.

## Scope

- `apps/cli/package.json`
- release QA / task / plan / changelog docs
- no runtime code changes beyond the already committed REFACTOR-026
- no UI redesign

## Risks

- Release workflow depends on GitHub secrets and npm publish permission.
- Published-package harness depends on local executor availability and can fail
  due environment issues rather than product regressions; QA must distinguish
  those cases.
- If release validation exposes a product blocker, stop and open a BUG task
  rather than forcing the tag.

## Verification

- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun apps/cli/dist/aiworker-bun.js --version`
- `bun pm pkg get version --cwd apps/cli/dist`
- `cd apps/cli/dist && bun publish --dry-run --access public`
- GitHub release workflow for `v0.12.2`
- `bunx @zonease/aiworker-cli@0.12.2 --version`
- `bun scripts/governance-kernel-harness.ts --mode cli-release-local --version 0.12.2 --matrix compact ...`

## Progress

- 2026-05-09 16:50: Plan created and moved to implementing after the user
  approved the recommended real-worker regression and patch release path.
- 2026-05-09 16:44-16:49: Source real-worker regression passed on
  `/Users/ben/projects/my-aiworker`, including no default control executor,
  successful Codex Chat, durable failure Chat message, restored Codex config,
  and a 125079 ms native adapter slow-turn check.
- 2026-05-09 16:52: Source release gates passed after version bump:
  typecheck, lint, full test suite, production build, and diff check.
- 2026-05-09 16:53: dist reports `0.12.2`; publish dry-run packed
  34 files / 3.21MB and stopped at the expected local npm auth boundary.
- 2026-05-09 16:56: pushed `main` and tag `v0.12.2`; release workflow
  `25597026067` passed and published npm + GitHub Release assets.
- 2026-05-09 17:00: `npm view @zonease/aiworker-cli version` returned
  `0.12.2`; `bunx @zonease/aiworker-cli@0.12.2 --version` returned
  `aiworker/0.12.2 darwin-arm64 node-v24.3.0`.
- 2026-05-09 17:03: published-package compact governance harness passed
  80/80 checks across `developer-codex` and `general-assistant-claude-code`.
