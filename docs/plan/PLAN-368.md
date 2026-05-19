# PLAN-368 CLI 0.18.1 patch release

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: REL-047

## Current State

The current public release state is `@zonease/aiworker-cli@0.18.0` on npm
latest and GitHub Release `v0.18.0`.

The release branch contains `FEAT-099 / PLAN-367`, which makes
`packages/component` the shared Host/Soul Web primitive and style source of
truth, migrates key Host Web settings/session surfaces to package-owned
components, adds HR Soul App direct-consumption proof, and fixes the engine icon
style delivery regression by moving icon styles into the shared package style
entrypoint.

## Proposal

Publish `@zonease/aiworker-cli@0.18.1` as a patch release carrying the shared
component library uplift and engine icon regression repair.

Execution steps:

1. Bump `apps/cli/package.json` from `0.18.0` to `0.18.1`.
2. Create `REL-047` / `PLAN-368` release tracking.
3. Run local release gates:
   - `bun run check`
   - `bun run test`
   - `bun run build`
   - `bun run web:smoke:mounted-surfaces`
   - `git diff --check`
   - `bun apps/cli/dist/aiworker-bun.js --version`
   - `jq -r '.name + "@" + .version' apps/cli/dist/package.json`
   - `cd apps/cli/dist && npm pack --dry-run --json`
   - `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
4. Run code-review-graph over the release diff.
5. Commit the release prep diff.
6. Push the release branch HEAD to `origin/main`, create and push annotated tag
   `v0.18.1`.
7. Monitor the tag-triggered GitHub Actions release workflow.
8. Verify:
   - `npm view @zonease/aiworker-cli version dist-tags --json`
   - `bunx @zonease/aiworker-cli@0.18.1 --version`
   - `gh release view v0.18.1 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
   - a published-package Host Web/API + official app smoke.
9. Close `REL-047`, `PLAN-368`, index files and `docs/changelog.md` with
   evidence and residual risks.

## Risks

- GitHub Actions release is the only path that publishes npm latest and GitHub
  Release binary assets. If it fails before publish, keep the release task open
  and diagnose before retrying.
- If npm publishes `0.18.1` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.
- This release changes the Web component/style ownership. The release gates must
  include both full workspace checks and visible Host Web smoke, especially the
  engine icon delivery chain.

## Scope

Expected repository changes during release prep:

- `apps/cli/package.json`
- `docs/task/REL-047.md`
- `docs/task/index.md`
- `docs/plan/PLAN-368.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No additional product behavior should change during release prep beyond the
version bump and release tracking.

## Verification

- [x] `bun run check`
- [x] `bun run test`
- [x] `bun run build`
- [x] `bun run web:smoke:mounted-surfaces`
- [x] `git diff --check`
- [x] `bun apps/cli/dist/aiworker-bun.js --version`
- [x] `jq -r '.name + "@" + .version' apps/cli/dist/package.json`
- [x] `cd apps/cli/dist && npm pack --dry-run --json`
- [x] `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- [x] `bun run crg:update`
- [x] `bun run crg:review`
- [x] `gh run watch 26074095645 --repo ZonEaseTech/aiworker --exit-status`
- [x] `npm view @zonease/aiworker-cli version dist-tags --json`
- [x] `bunx @zonease/aiworker-cli@0.18.1 --version`
- [x] `gh release view v0.18.1 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
- [x] Published-package smoke.

## Annotations

- 2026-05-19：开始 `0.18.1` patch release prep。
- 2026-05-19：本地 release gates 通过；mounted-surface smoke 覆盖
  creation/settings dialogs 与 engine icon delivery chain；dist dry-run 包含
  CLI、Worker Web、engine-icons、fonts、official HR/QA resources 与 migrations；
  `smoke:dist-release` 覆盖 Host Web/API、official Soul App bootstrap 与
  HR/QA mounted actions。CRG risk score `0.00`，无 test gap。
- 2026-05-19：release prep commit `2aca8102`、tag `v0.18.1` 已推送；
  release workflow `26074095645` 与 main lint workflow `26074093498` 均成功。
- 2026-05-19：post-release verification 通过；npm latest 为 `0.18.1`，
  GitHub Release `v0.18.1` 为 non-draft / non-prerelease 且包含 8 个
  binary/checksum assets，published-package smoke 从公开包启动 Host Web/API、
  验证 `openai.svg`、bootstrap official HR/QA，并调用 HR/QA mounted actions。
