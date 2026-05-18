# PLAN-359 CLI 0.17.4 patch release

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-18
- **approvedAt**: 2026-05-18
- **relatedTask**: REL-043

## Current State

`FEAT-097 / PLAN-358` has been merged into `main`. The current external release
state is `@zonease/aiworker-cli@0.17.3` on npm latest and GitHub Release
`v0.17.3`.

The release workflow is tag-triggered by `v*`, runs on GitHub-hosted
`ubuntu-latest`, publishes from `apps/cli/dist`, and attaches four platform
binary bundles plus matching SHA256 assets to the GitHub Release.

## Proposal

Publish `@zonease/aiworker-cli@0.17.4` as a patch release carrying the HR Soul
App header/search convergence.

Execution steps:

1. Bump `apps/cli/package.json` from `0.17.3` to `0.17.4`.
2. Create `REL-043` / `PLAN-359` release tracking.
3. Run local release gates:
   - `bun run check`
   - `bun run test`
   - `bun run build`
   - `git diff --check`
   - `bun apps/cli/dist/aiworker-bun.js --version`
   - `jq -r '.name + "@" + .version' apps/cli/dist/package.json`
   - `cd apps/cli/dist && npm pack --dry-run --json`
   - `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
4. Run code-review-graph over the release diff.
5. Commit the release prep diff with a conventional release commit.
6. Push `main`, create and push annotated tag `v0.17.4`.
7. Monitor the tag-triggered GitHub Actions release workflow.
8. Verify:
   - `npm view @zonease/aiworker-cli version dist-tags --json`
   - `bunx @zonease/aiworker-cli@0.17.4 --version`
   - `gh release view v0.17.4 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
   - a published-package Host Web/API + official app smoke.
9. Close `REL-043`, `PLAN-359`, index files and `docs/changelog.md` with
   evidence and residual risks.

## Risks

- GitHub Actions release is the only path that actually publishes npm latest
  and GitHub Release binary assets. If it fails before npm publish, keep the
  release task open and retry only after diagnosis with a clean tag strategy.
- If npm publishes `0.17.4` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.
- The release is intentionally narrow. Any additional Host shell layout changes
  from parallel work should ship in a separate release.

## Scope

Expected repository changes during release prep:

- `apps/cli/package.json`
- `docs/task/REL-043.md`
- `docs/task/index.md`
- `docs/plan/PLAN-359.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No additional HR app feature behavior should change during release prep beyond
the version bump and release tracking.

## Annotations

- 2026-05-18：开始 `0.17.4` patch release prep。
- 2026-05-18：本地 release gate 通过；dist dry-run 包含 CLI、Worker Web、
  official HR/QA resources 与 migrations；`smoke:dist-release` 覆盖 Host
  Web/API、official Soul App bootstrap 与 HR/QA mounted actions。
- 2026-05-18：release prep commit `61579293`、tag `v0.17.4` 已推送；
  release workflow `26033776748` 与 main lint workflow `26033769144` 均成功。
- 2026-05-18：post-release verification 通过；npm latest 为 `0.17.4`，
  GitHub Release `v0.17.4` 为 non-draft / non-prerelease 且包含 8 个
  binary/checksum assets，published-package smoke 从公开包启动 Host
  Web/API、bootstrap official HR/QA，并调用 HR/QA mounted actions。

## Verification

- [x] `bun run check`
- [x] `bun run test`
- [x] `bun run build`
- [x] `git diff --check`
- [x] `bun apps/cli/dist/aiworker-bun.js --version`
- [x] `jq -r '.name + "@" + .version' apps/cli/dist/package.json`
- [x] `cd apps/cli/dist && npm pack --dry-run --json`
- [x] `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- [x] `bun run crg:update`
- [x] `bun run crg:review`
- [x] `gh run watch 26033776748 --repo ZonEaseTech/aiworker --exit-status`
- [x] `npm view @zonease/aiworker-cli version dist-tags --json`
- [x] `bunx @zonease/aiworker-cli@0.17.4 --version`
- [x] `gh release view v0.17.4 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
- [x] Published-package smoke.
