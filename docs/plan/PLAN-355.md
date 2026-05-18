# PLAN-355 CLI 0.17.2 patch release

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-18
- **approvedAt**: 2026-05-18
- **completedAt**: 2026-05-18
- **relatedTask**: REL-041

## Current State

`@zonease/aiworker-cli@0.17.1` is the current npm latest and GitHub latest
release. Local `main` is ahead of `origin/main` with the already-reviewed Host
shell V9, Host/Soul workbench contract cleanup, scaffold migration and HR
Profile Patch Review workbench changes.

The release workflow is tag-triggered by `v*`, runs on GitHub-hosted
`ubuntu-latest`, publishes from `apps/cli/dist`, and attaches four platform
binary bundles plus matching SHA256 assets to the GitHub Release.

## Proposal

Publish `@zonease/aiworker-cli@0.17.2` as a patch release carrying the HR
Profile Patch Review workbench and current Host shell/workbench boundary
updates.

Execution steps:

1. Bump `apps/cli/package.json` from `0.17.1` to `0.17.2`.
2. Create `REL-041` / `PLAN-355` release tracking.
3. Run local release gates:
   - `bun run check`
   - `bun run test`
   - `bun run build`
   - `git diff --check`
   - `bun apps/cli/dist/aiworker-bun.js --version`
   - `jq -r '.version' apps/cli/dist/package.json`
   - `cd apps/cli/dist && npm pack --dry-run --json`
   - `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
4. Run code-review-graph over the release diff.
5. Commit the release prep diff with a conventional release commit.
6. Push `main`, create and push annotated tag `v0.17.2`.
7. Monitor the tag-triggered GitHub Actions release workflow.
8. Verify:
   - `npm view @zonease/aiworker-cli version dist-tags --json`
   - `bunx @zonease/aiworker-cli@0.17.2 --version`
   - `gh release view v0.17.2 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
   - a published-package Host Web/API + official app smoke.
9. Close `REL-041`, `PLAN-355`, index files and `docs/changelog.md` with
   evidence and residual risks.

## Risks

- GitHub Actions release is the only path that actually publishes npm latest
  and GitHub Release binary assets. If it fails before npm publish, keep the
  release task open and retry only after diagnosis with a clean tag strategy.
- If npm publishes `0.17.2` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.
- Worker Web bundle size can trip the main lint gate. If CI flags bundle-size
  growth after release, diagnose whether the reviewed HR workbench growth needs
  a baseline update or a follow-up reduction.

## Scope

Expected repository changes during release prep:

- `apps/cli/package.json`
- `docs/task/REL-041.md`
- `docs/task/index.md`
- `docs/plan/PLAN-355.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No additional HR app feature behavior should change during release prep beyond
the version bump and release tracking.

## Annotations

- 2026-05-18：开始 `0.17.2` patch release prep。
- 2026-05-18：本地 release gates 通过；dist CLI 与
  `apps/cli/dist/package.json` 均报告 `0.17.2`；pack dry-run 确认 package id
  为 `@zonease/aiworker-cli@0.17.2`、entryCount 为 145，包含 Worker Web、
  official HR/QA app resources 与 CLI runtime entrypoints；dist release smoke
  成功启动 Host Web/API、bootstrap official apps，并调用 HR/QA mounted
  actions。
- 2026-05-18：release prep commit `35eb0d61` 已推送到 `main`，annotated tag
  `v0.17.2` 已推送；release workflow `26010518321` 成功发布 npm package 并
  上传 GitHub Release assets。
- 2026-05-18：main lint workflow `26010512951` 成功。
- 2026-05-18：发布后验证确认 npm latest、`bunx` 显式版本、GitHub Release
  asset set 与 published-package smoke 均通过。

## Verification

- `bun run check` passed.
- `bun run test` passed.
- `bun run build` passed.
- `git diff --check` passed.
- `bun apps/cli/dist/aiworker-bun.js --version` reported
  `aiworker/0.17.2 darwin-arm64 node-v24.3.0`.
- `jq -r '.name + "@" + .version' apps/cli/dist/package.json` reported
  `@zonease/aiworker-cli@0.17.2`.
- `npm pack --dry-run --json` under `apps/cli/dist` reported
  `@zonease/aiworker-cli@0.17.2` with 145 entries and no missing required
  release resources.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passed and
  invoked HR `create-people-profile` plus QA `create-release-gate`.
- `bun run crg:update` passed.
- `bun run crg:review` exited 0 with risk score `0.00`.
- `gh run watch 26010518321 --repo ZonEaseTech/aiworker --exit-status` passed.
- Main lint run `26010512951` completed successfully on `35eb0d61`.
- `npm view @zonease/aiworker-cli version dist-tags --json` reported `0.17.2`
  and `latest: 0.17.2`.
- `bunx @zonease/aiworker-cli@0.17.2 --version` reported
  `aiworker/0.17.2 darwin-arm64 node-v24.3.0`.
- `gh release view v0.17.2` reported a non-draft, non-prerelease release with
  8 uploaded assets: 4 platform tarballs and 4 `.sha256` files.
- Published-package smoke passed from an isolated `AIWORKER_HOME`: daemon
  `/health`, `/api/local/info` runtimeVersion `0.17.2`, Host Web static serving,
  official app bootstrap, app/soul/template listing, HR `create-people-profile`
  and QA `create-release-gate` mounted actions.
