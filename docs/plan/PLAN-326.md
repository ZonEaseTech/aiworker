# PLAN-326 CLI 0.15.0 minor release

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-15 13:37
- **approvedAt**: 2026-05-15 13:37
- **completedAt**: 2026-05-15 13:50
- **relatedTask**: REL-035

## Current State

Local `main` contains FEAT-086 / PLAN-325 and is ahead of `origin/main`.
`@zonease/aiworker-cli@0.14.0` is the current npm latest and GitHub latest
release. Local release checks show `v0.15.0` is unused.

The release-relevant changes cover:

- Top-level `aiworker update` / `aiworker upgrade` aliases.
- Read-only update checks, dry-run plans, stable/preview channel handling and
  explicit target support.
- Install-source detection for source checkout, npm global, Bun global,
  ephemeral `npx` / `bunx`, GitHub bundle and unknown sources.
- Package-manager update actions for npm/Bun globals.
- GitHub release bundle checksum requirement and full bundle directory
  replacement for binary tarball installs.
- Host convergence, daily update notices and conservative daemon restart guards.
- CLI/deployment/PMA docs synced under FEAT-086 / PLAN-325.

## Proposal

Publish `@zonease/aiworker-cli@0.15.0` as a minor release.

Execution steps:

1. Bump `apps/cli/package.json` from `0.14.0` to `0.15.0`.
2. Update release workflow to generate and upload `.sha256` checksum assets for
   all GitHub binary tarballs.
3. Set `REL-035` / `PLAN-326` to implementation state and add a changelog
   progress entry.
4. Run local release gates:
   - `bun run check`
   - `bun run test`
   - `bun run build`
   - `git diff --check`
   - `bun apps/cli/dist/aiworker-bun.js --version`
   - `bun pm pkg get version --cwd apps/cli/dist`
   - `cd apps/cli/dist && npm pack --dry-run --json`
   - `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
5. Run code-review-graph over the release diff.
6. Commit the release prep diff with a conventional release commit.
7. Push `main`, create and push annotated tag `v0.15.0`.
8. Monitor the tag-triggered GitHub Actions release workflow.
9. Verify:
   - `npm view @zonease/aiworker-cli version`
   - `bunx @zonease/aiworker-cli@0.15.0 --version`
   - `gh release view v0.15.0 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url`
   - a published-package Host Web/API + official app bootstrap smoke.
10. Close `REL-035`, `PLAN-326`, index files and `docs/changelog.md` with
    evidence and residual risks.

## Risks

- If local gates fail, stop before tag/publish and fix the blocker in a focused
  commit.
- If the GitHub Actions release workflow fails before npm publish, keep the
  release task open and retry only after diagnosis with a clean tag strategy.
- If npm publishes `0.15.0` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.
- If checksum assets are missing from GitHub Release, GitHub bundle users cannot
  use automatic tarball self-update; release verification must check matching
  `.sha256` assets.
- The release workflow may still emit the known Node.js 20 deprecation
  annotation from `softprops/action-gh-release@v2`; this did not block prior
  releases.

## Scope

Expected repository changes:

- `.github/workflows/release.yml`
- `apps/cli/package.json`
- `docs/task/REL-035.md`
- `docs/task/index.md`
- `docs/plan/PLAN-326.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No Host/Soul App feature behavior should change during the release step beyond
the already merged source changes, release checksum assets and the version bump.

## Alternatives

1. Publish `0.14.1` instead. This is not recommended because FEAT-086 is a
   user-visible CLI/Host distribution capability, not a patch-only bug fix.
2. Do not publish now. This avoids release risk but leaves external users on
   `0.14.0` without self-update.
3. Reuse `0.14.0`. This is invalid because npm and GitHub already contain that
   version.

## Annotations

- 2026-05-15 13:37：用户要求发版；确认 npm latest 和 GitHub latest release
  均为 `0.14.0`，开始执行 `0.15.0` release prep、local gates、push、tag 与
  post-release verification。
- 2026-05-15 13:46：本地 release gates 已通过；补齐 release workflow
  `.sha256` tarball checksum assets，CLI package version bump 到 `0.15.0`。
  CLI 集成测试中的显式 update target 改为稳定未来版本，避免后续版本 bump
  让 source-checkout check 测试误判为 already current。
- 2026-05-15 13:50：`main` 和 annotated tag `v0.15.0` 推送成功；
  release workflow `25902585088` 成功发布 npm package 并上传 GitHub
  Release assets。发布后验证确认 npm latest、`bunx` 显式版本、GitHub
  Release asset set 与 published-package smoke 均通过。

## Verification

- `bun run check` passed.
- `bun run test` passed.
- `bun run build` passed.
- `git diff --check` passed.
- `bun apps/cli/dist/aiworker-bun.js --version` reported
  `aiworker/0.15.0 darwin-arm64 node-v24.3.0`.
- `bun pm pkg get version` under `apps/cli/dist` reported `0.15.0`.
- `npm pack --dry-run --json` under `apps/cli/dist` reported
  `@zonease/aiworker-cli@0.15.0` with CLI shims, Worker Web static,
  migrations and official HR/QA app resources.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passed.
- `bun run crg:update` passed.
- `bun run crg:review` passed with risk score `0.40`; the reported
  `WorkerStudio` test gap belongs to pre-existing unrelated worktree changes.
- `git push origin main` pushed release prep commit `12c5c33c`.
- `git push origin v0.15.0` pushed the annotated release tag.
- `gh run watch 25902585088 --exit-status` passed; release job completed in
  1m46s.
- `npm view @zonease/aiworker-cli version dist-tags --json` reported latest
  `0.15.0`.
- `bunx @zonease/aiworker-cli@0.15.0 --version` reported
  `aiworker/0.15.0 darwin-arm64 node-v24.3.0`.
- `gh release view v0.15.0 --repo ZonEaseTech/aiworker --json
  tagName,isDraft,isPrerelease,assets,url` reported a non-draft,
  non-prerelease release with four platform tarballs and four `.sha256`
  checksum assets.
- Published-package smoke passed using `bunx @zonease/aiworker-cli@0.15.0`:
  daemon health, `/api/local/info`, Host Web HTML, `app bootstrap official`,
  `app list`, `soul list` and HR template discovery all succeeded.
