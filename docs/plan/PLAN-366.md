# PLAN-366 CLI 0.18.0 minor release

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: REL-046

## Current State

The current public release state is `@zonease/aiworker-cli@0.17.6` on npm
latest and GitHub Release `v0.17.6`. Remote tag `v0.18.0` does not exist.

`FEAT-098 / PLAN-365` has been implemented and committed as
`9bfce75a feat: 收敛 operator CLI 命令面`. It changes the default CLI discovery
surface, adds `daemon restart`, changes update apply semantics, and documents
`aiworker dev` as a source-checkout compatibility alias.

## Proposal

Publish `@zonease/aiworker-cli@0.18.0` as a minor release carrying the compact
operator CLI surface and updater behavior changes.

Execution steps:

1. Bump `apps/cli/package.json` from `0.17.6` to `0.18.0`.
2. Create `REL-046` / `PLAN-366` release tracking.
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
5. Commit the release prep diff.
6. Push `main`, create and push annotated tag `v0.18.0`.
7. Monitor the tag-triggered GitHub Actions release workflow.
8. Verify:
   - `npm view @zonease/aiworker-cli version dist-tags --json`
   - `bunx @zonease/aiworker-cli@0.18.0 --version`
   - `gh release view v0.18.0 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
   - a published-package Host Web/API + official app smoke.
9. Close `REL-046`, `PLAN-366`, index files and `docs/changelog.md` with
   evidence and residual risks.

## Risks

- GitHub Actions release is the only path that publishes npm latest and GitHub
  Release binary assets. If it fails before publish, keep the release task open
  and diagnose before retrying.
- If npm publishes `0.18.0` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.
- This release carries CLI behavior changes. If external automation depended on
  default `commands` output being the full list, it must switch to
  `commands --all`.

## Scope

Expected repository changes during release prep:

- `apps/cli/package.json`
- `docs/task/REL-046.md`
- `docs/task/index.md`
- `docs/plan/PLAN-366.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No additional CLI feature behavior should change during release prep beyond the
version bump and release tracking.

## Annotations

- 2026-05-19：开始 `0.18.0` minor release prep。
- 2026-05-19：本地 release gates 通过；dist dry-run 包含 CLI、Worker Web、
  official HR/QA resources 与 migrations；`smoke:dist-release` 覆盖 Host
  Web/API、official Soul App bootstrap 与 HR/QA mounted actions。
- 2026-05-19：release prep commit `39cb5495`、tag `v0.18.0` 已推送；
  release workflow `26048444696` 与 main lint workflow `26048434417` 均成功。
- 2026-05-19：post-release verification 通过；npm latest 为 `0.18.0`，
  GitHub Release `v0.18.0` 为 non-draft / non-prerelease 且包含 8 个
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
- [x] `gh run watch 26048444696 --repo ZonEaseTech/aiworker --exit-status`
- [x] `npm view @zonease/aiworker-cli version dist-tags --json`
- [x] `bunx @zonease/aiworker-cli@0.18.0 --version`
- [x] `gh release view v0.18.0 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
- [x] Published-package smoke.
