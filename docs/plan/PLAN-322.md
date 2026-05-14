# PLAN-322 CLI 0.13.2 patch release

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-15 00:18
- **approvedAt**: 2026-05-15 00:24
- **completedAt**: 2026-05-15 00:31
- **relatedTask**: REL-033

## Current State

`@zonease/aiworker-cli@0.13.1` is already published and cannot be reused:

1. npm latest resolves to `0.13.1`.
2. Local and remote tags include `v0.13.1`.
3. GitHub Release `v0.13.1` is published, non-draft and non-prerelease, with
   four uploaded binary tarballs.
4. Local `main` is ahead of `origin/main` by 13 commits.
5. The current source package still declares `apps/cli/package.json` version
   `0.13.1`, so the next publishable version must be bumped before tagging.

The release-relevant commits after `origin/main` cover:

- dev/source runtime home isolation under `~/.aiworker-dev`;
- Soul App SDK/runtime authoring boundary cleanup before independent SDK npm
  publication;
- release daemon runtime version propagation;
- Soul App Web Storage discipline and boundary checks.

## Proposal

Publish `@zonease/aiworker-cli@0.13.2` as a patch release.

Execution steps after approval:

1. Bump `apps/cli/package.json` from `0.13.1` to `0.13.2`.
2. Set `REL-033` / `PLAN-322` to implementation state and add a changelog
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
4. Commit the release prep diff with a conventional release commit.
5. Push `main`, create and push annotated tag `v0.13.2`.
6. Monitor the tag-triggered GitHub Actions release workflow.
7. Verify:
   - `npm view @zonease/aiworker-cli version`
   - `bunx @zonease/aiworker-cli@0.13.2 --version`
   - `gh release view v0.13.2 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url`
   - a published-package Host Web/API + official app bootstrap smoke.
8. Close `REL-033`, `PLAN-322`, index files and `docs/changelog.md` with
   evidence and residual risks.

## Risks

- Pushing release will publish the current 13 local commits after `origin/main`.
- If local gates fail, the release must stop before tag/publish and the blocker
  should be fixed in a separate focused commit.
- If the GitHub Actions release workflow fails before npm publish, keep the
  release task open and retry only after diagnosis with a clean tag strategy.
- If npm publishes `0.13.2` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up `0.13.3` patch.
- The workflow still uses `softprops/action-gh-release@v2`, which may emit the
  existing Node.js 20 deprecation annotation. Previous releases were not blocked
  by this annotation.

## Scope

Expected repository changes:

- `apps/cli/package.json`
- `docs/task/REL-033.md`
- `docs/task/index.md`
- `docs/plan/PLAN-322.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No Host/Soul App feature behavior should change during the release step beyond
the already committed source changes and the version bump.

## Alternatives

1. Do not publish now and only push the 13 commits to `origin/main`. This avoids
   npm/GitHub Release risk but leaves users on `0.13.1`.
2. Publish `0.14.0` instead. This is not recommended because the post-`0.13.1`
   changes are release-hardening and boundary fixes rather than a new preview
   minor surface.
3. Reuse `0.13.1`. This is invalid because npm and GitHub tags already contain
   that version.

## Annotations

- 2026-05-15 00:24：用户确认继续推进直至发版完成；开始执行 version bump、
  local release gates、push、tag 与 post-release verification。
- 2026-05-15 00:25：本地 release gates 已通过到 source/build/dist/pack/smoke
  与 code-review-graph。下一步提交 release prep、推送 `main` 并创建
  annotated tag `v0.13.2`。
- 2026-05-15 00:31：`@zonease/aiworker-cli@0.13.2` 已发布并完成
  post-release verification。release workflow、main lint workflow、npm latest、
  explicit `bunx`、GitHub Release assets 与 published-package smoke 均通过。

## Verification

- Passed: `bun run check`
- Passed: `bun run test`
- Passed: `bun run build`
- Passed: `git diff --check`
- Passed: `bun apps/cli/dist/aiworker-bun.js --version` returned
  `aiworker/0.13.2 darwin-arm64 node-v24.3.0`
- Passed: `bun pm pkg get version --cwd apps/cli/dist` returned `"0.13.2"`
- Passed: `cd apps/cli/dist && npm pack --dry-run --json`; parsed pack preview
  reported `@zonease/aiworker-cli@0.13.2`, 114 files, 5,118,294 unpacked bytes,
  and no missing required runtime resources.
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- Passed: `bun run crg:update`
- Passed: `uvx code-review-graph detect-changes --repo . --base origin/main --brief`
  with 0 affected flows and static helper-level test-gap hints.
- Passed: GitHub Actions release workflow `25871841845` for `v0.13.2`
- Passed: main lint workflow `25871841945`
- Passed: `npm view @zonease/aiworker-cli version` returned `0.13.2`
- Passed: `bunx @zonease/aiworker-cli@0.13.2 --version` returned
  `aiworker/0.13.2 darwin-arm64 node-v24.3.0`
- Passed: `gh release view v0.13.2 --repo ZonEaseTech/aiworker --json
  tagName,isDraft,isPrerelease,assets,url`
- Passed: published-package smoke report at
  `/private/tmp/aiworker-release-0.13.2-published-smoke-pDiAut/report.json`

## Result

Completed on 2026-05-15.

- Published `@zonease/aiworker-cli@0.13.2` through annotated tag `v0.13.2`.
- Local source/build gates, dist package checks, npm pack dry-run,
  `smoke:dist-release` and code-review-graph passed before tagging.
- GitHub Actions release run `25871841845` completed successfully and published
  npm plus four GitHub Release binary tarballs.
- npm latest is `0.13.2`; explicit `bunx @zonease/aiworker-cli@0.13.2
  --version` reports `aiworker/0.13.2`.
- Published-package smoke passed for Host Web/API, runtime version, official app
  bootstrap, app/Soul catalog and HR template projection.

## Residual Risk

- `softprops/action-gh-release@v2` still emits the known Node.js 20 deprecation
  annotation. This did not block the release.
- Independent SDK/runtime npm publication remains out of scope.
