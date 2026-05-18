# PLAN-363 CLI 0.17.6 patch release

- **status**: implementing
- **owner**: codex
- **createdAt**: 2026-05-18
- **approvedAt**: 2026-05-18
- **relatedTask**: REL-045

## Current State

The current external release state is `@zonease/aiworker-cli@0.17.5` on npm
latest and GitHub Release `v0.17.5`. The release branch contains one
post-release fix commit:

- `2bee1f18 fix: 高亮 Host 左侧面板切换激活态`

That commit repairs the Host left sidebar toggle active state and records
`BUG-137 / PLAN-362`. The main checkout contains unrelated local
`BUG-136 / PLAN-361` profile-ledger changes, so this release is prepared from
the isolated `codex/host-left-toggle-active-0176` worktree and must not include
those unrelated files.

## Proposal

Publish `@zonease/aiworker-cli@0.17.6` as a patch release carrying only the Host
left panel toggle active-state repair.

Execution steps:

1. Bump `apps/cli/package.json` from `0.17.5` to `0.17.6`.
2. Create `REL-045` / `PLAN-363` release tracking.
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
6. Push the release branch HEAD to `origin/main`, create and push annotated tag
   `v0.17.6`.
7. Monitor the tag-triggered GitHub Actions release workflow.
8. Verify:
   - `npm view @zonease/aiworker-cli version dist-tags --json`
   - `bunx @zonease/aiworker-cli@0.17.6 --version`
   - `gh release view v0.17.6 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
   - a published-package Host Web/API + official app smoke.
9. Close `REL-045`, `PLAN-363`, index files and `docs/changelog.md` with
   evidence and residual risks.

## Risks

- GitHub Actions release is the only path that actually publishes npm latest
  and GitHub Release binary assets. If it fails before npm publish, keep the
  release task open and retry only after diagnosis with a clean tag strategy.
- If npm publishes `0.17.6` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.
- This release intentionally excludes unrelated local profile-ledger changes
  visible in the main checkout.

## Scope

Expected repository changes during release prep:

- `apps/cli/package.json`
- `docs/task/REL-045.md`
- `docs/task/index.md`
- `docs/plan/PLAN-363.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No additional product behavior should change during release prep beyond the
version bump and release tracking.

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
- [ ] GitHub Actions release workflow succeeds.
- [ ] `npm view @zonease/aiworker-cli version dist-tags --json`
- [ ] `bunx @zonease/aiworker-cli@0.17.6 --version`
- [ ] `gh release view v0.17.6 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
- [ ] Published-package smoke.

## Annotations

- 2026-05-18：本地 release gates 通过；dist dry-run 包含 CLI、Worker Web、
  official HR/QA resources 与 migrations；`smoke:dist-release` 覆盖 Host
  Web/API、official Soul App bootstrap 与 HR/QA mounted actions。
