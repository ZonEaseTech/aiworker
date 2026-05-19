# PLAN-370 CLI 0.18.2 patch release

- **status**: implementing
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: REL-048

## Current State

The current public release state is `@zonease/aiworker-cli@0.18.1` on npm
latest and GitHub Release `v0.18.1`.

The local `main` branch now contains `FEAT-100 / PLAN-369`, which implements the
HR profile composer flow and the follow-up icon-only send button refinement.
The branch was fast-forwarded from `codex/hr-profile-composer-flow`.

## Proposal

Publish `@zonease/aiworker-cli@0.18.2` as a patch release carrying the HR
profile composer flow.

Execution steps:

1. Bump `apps/cli/package.json` from `0.18.1` to `0.18.2`.
2. Create `REL-048` / `PLAN-370` release tracking.
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
6. Push `main`, create and push annotated tag `v0.18.2`.
7. Monitor the tag-triggered GitHub Actions release workflow and main lint
   workflow.
8. Verify:
   - `npm view @zonease/aiworker-cli version dist-tags --json`
   - `bunx @zonease/aiworker-cli@0.18.2 --version`
   - `gh release view v0.18.2 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
   - a published-package Host Web/API + official app smoke.
9. Close `REL-048`, `PLAN-370`, index files and `docs/changelog.md` with
   evidence and residual risks.

## Risks

- GitHub Actions release is the only path that publishes npm latest and GitHub
  Release binary assets. If it fails before publish, keep the release task open
  and diagnose before retrying.
- If npm publishes `0.18.2` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.
- The product diff is visible HR Web UI. Release gates must include full Web
  tests/build plus browser or mounted-surface smoke.

## Scope

Expected repository changes during release prep:

- `apps/cli/package.json`
- `docs/task/REL-048.md`
- `docs/task/index.md`
- `docs/plan/PLAN-370.md`
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
- [ ] `gh run watch <release-run-id> --repo ZonEaseTech/aiworker --exit-status`
- [ ] `npm view @zonease/aiworker-cli version dist-tags --json`
- [ ] `bunx @zonease/aiworker-cli@0.18.2 --version`
- [ ] `gh release view v0.18.2 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
- [ ] Published-package smoke.

## Annotations

- 2026-05-19：开始 `0.18.2` patch release prep。
- 2026-05-19 15:51 CST：本地 release gate 全部通过；dist package
  version 为 `@zonease/aiworker-cli@0.18.2`，`npm pack --dry-run --json`
  生成 `zonease-aiworker-cli-0.18.2.tgz`，dist release smoke 成功启动
  Host Web/API、bootstrap official HR/QA Soul Apps 并调用 mounted actions。
