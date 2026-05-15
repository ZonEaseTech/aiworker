# PLAN-327 CLI 0.15.1 patch release

- **status**: in_progress
- **owner**: codex
- **createdAt**: 2026-05-15 13:57
- **approvedAt**: 2026-05-15 13:57
- **completedAt**:
- **relatedTask**: REL-036

## Current State

`@zonease/aiworker-cli@0.15.0` is the current npm latest and GitHub latest
release. The remote `v0.15.1` tag is unused. `main` includes the post-0.15.0
Worker Web shell header action fix, so the release source is current `main`
rather than the already published `v0.15.0` tag.

The release-relevant change is a Host Web Shell patch:

- Successful Soul App header actions no longer render a persistent
  `.shell-action-status` line in the workbench body.
- Failed Soul App header actions still render an alert status.
- The WorkerStudio regression test asserts the HR create-profile action opens
  the expected dialog without exposing the success message as page status.

## Proposal

Publish `@zonease/aiworker-cli@0.15.1` as a patch release.

Execution steps:

1. Bump `apps/cli/package.json` from `0.15.0` to `0.15.1`.
2. Set `REL-036` / `PLAN-327` to implementation state and add a changelog
   progress entry.
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
6. Push `main`, create and push annotated tag `v0.15.1`.
7. Monitor the tag-triggered GitHub Actions release workflow.
8. Verify:
   - `npm view @zonease/aiworker-cli version`
   - `bunx @zonease/aiworker-cli@0.15.1 --version`
   - `gh release view v0.15.1 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url`
   - a published-package Host Web/API + official app bootstrap smoke.
9. Close `REL-036`, `PLAN-327`, index files and `docs/changelog.md` with
   evidence and residual risks.

## Risks

- If local gates fail, stop before tag/publish and fix the blocker in a focused
  commit.
- If the GitHub Actions release workflow fails before npm publish, keep the
  release task open and retry only after diagnosis with a clean tag strategy.
- If npm publishes `0.15.1` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.
- If checksum assets are missing from GitHub Release, GitHub bundle users cannot
  use automatic tarball self-update; release verification must check matching
  `.sha256` assets.
- The release workflow may still emit the known Node.js 20 deprecation
  annotation from `softprops/action-gh-release@v2`; this did not block prior
  releases.

## Scope

Expected repository changes:

- `apps/cli/package.json`
- `docs/task/REL-036.md`
- `docs/task/index.md`
- `docs/plan/PLAN-327.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No Host/Soul App feature behavior should change during the release step beyond
the already merged source fix and the version bump.

## Alternatives

1. Do not publish now. This avoids release risk but leaves external users on
   `0.15.0` with the visible header action status regression.
2. Reuse `0.15.0`. This is invalid because npm and GitHub already contain that
   version.
3. Publish `0.16.0`. This is not recommended because the only post-0.15.0
   source change is a patch-level Web shell bug fix.

## Annotations

- 2026-05-15 13:57：用户要求发版；确认 npm latest 为 `0.15.0`，GitHub
  Release `v0.15.0` 已发布且 `v0.15.1` tag 未使用，开始执行 `0.15.1`
  patch release prep、local gates、push、tag 与 post-release verification。
- 2026-05-15 14:02：本地 release gates 已通过；CLI package version bump 到
  `0.15.1`，dist package 与 dist CLI 均报告 `0.15.1`，pack dry-run
  包含 CLI shims、Worker Web static、worker migrations 与官方 HR/QA app
  resources。

## Verification

- `bun run check` passed.
- `bun run test` passed.
- `bun run build` passed.
- `git diff --check` passed.
- `bun apps/cli/dist/aiworker-bun.js --version` reported
  `aiworker/0.15.1 darwin-arm64 node-v24.3.0`.
- `bun pm pkg get version` under `apps/cli/dist` reported `0.15.1`.
- `npm pack --dry-run --json` under `apps/cli/dist` reported
  `@zonease/aiworker-cli@0.15.1` with 119 files including CLI shims, Worker Web
  static, migrations and official HR/QA app resources.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passed.
- `bun run crg:update` passed.
- `bun run crg:review` passed with risk score `0.00`.
