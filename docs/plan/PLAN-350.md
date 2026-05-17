# PLAN-350 CLI 0.17.1 patch release

- **status**: approved
- **owner**: codex
- **createdAt**: 2026-05-17
- **approvedAt**: 2026-05-17
- **relatedTask**: REL-040

## Current State

`@zonease/aiworker-cli@0.17.0` is the current npm latest and GitHub latest
release. `QA-037 / PLAN-349` has landed locally on
`codex/hr-native-skill-artifact-boundary`, closing the HR production-readiness
blockers around profile promotion validation, official app defaults, and
workspace README preservation.

## Proposal

Publish `@zonease/aiworker-cli@0.17.1` as a patch release carrying the HR app
production-readiness fixes.

Execution steps:

1. Bump `apps/cli/package.json` from `0.17.0` to `0.17.1`.
2. Create `REL-040` / `PLAN-350` release tracking.
3. Run local release gates:
   - `bun run check`
   - `bun run test`
   - `bun run build`
   - `git diff --check`
   - `bun apps/cli/dist/aiworker-bun.js --version`
   - `bun pm pkg get version --cwd apps/cli/dist`
   - `cd apps/cli/dist && npm pack --dry-run --json`
   - `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
4. Run code-review-graph over the release diff.
5. Commit the release prep diff with a conventional release commit.
6. Merge `codex/hr-native-skill-artifact-boundary` into `main`.
7. Push `main`, create and push annotated tag `v0.17.1`.
8. Monitor the tag-triggered GitHub Actions release workflow.
9. Verify:
   - `npm view @zonease/aiworker-cli version dist-tags --json`
   - `bunx @zonease/aiworker-cli@0.17.1 --version`
   - `gh release view v0.17.1 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
   - a published-package Host Web/API + official app smoke.
10. Close `REL-040`, `PLAN-350`, index files and `docs/changelog.md` with
    evidence and residual risks.

## Risks

- GitHub Actions release is the only path that actually publishes npm latest
  and GitHub Release binary assets. If it fails before npm publish, keep the
  release task open and retry only after diagnosis with a clean tag strategy.
- If npm publishes `0.17.1` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.
- HR production readiness depends on packaged official app resources and Worker
  Web behavior; release smoke must include the packaged Host Web/API and
  official app bootstrap, not just `--version`.

## Scope

Expected repository changes during release prep:

- `apps/cli/package.json`
- `docs/task/REL-040.md`
- `docs/task/index.md`
- `docs/plan/PLAN-350.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No additional HR app feature behavior should change during release prep beyond
the version bump and release tracking.

## Annotations

- 2026-05-17：开始 `0.17.1` patch release prep。
- 2026-05-17：本地 release gates 通过；dist CLI 与
  `apps/cli/dist/package.json` 均报告 `0.17.1`；pack dry-run 确认 package id
  为 `@zonease/aiworker-cli@0.17.1`、entryCount 为 145，包含 Worker Web、
  official HR/QA app resources 与 CLI runtime entrypoints；dist release smoke
  成功启动 Host Web/API、bootstrap official apps，并调用 HR/QA mounted
  actions。

## Verification

- `bun run check` passed.
- `bun run test` passed.
- `bun run build` passed.
- `git diff --check` passed.
- `bun run --filter '@zonease/aiworker-cli' build:bundle` passed.
- `bun apps/cli/dist/aiworker-bun.js --version` reported
  `aiworker/0.17.1 darwin-arm64 node-v24.3.0`.
- `jq -r '.version' apps/cli/dist/package.json` reported `0.17.1`.
- `npm pack --dry-run --json` under `apps/cli/dist` reported
  `@zonease/aiworker-cli@0.17.1` with 145 entries and no missing required
  release resources.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passed and
  invoked HR `create-people-profile` plus QA `create-release-gate`.
- `bun run crg:update` passed.
- `bun run crg:review` exited 0 with risk score `0.00`.
