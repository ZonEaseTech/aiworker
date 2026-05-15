# PLAN-324 CLI 0.14.0 minor release

- **status**: approved
- **owner**: codex
- **createdAt**: 2026-05-15 10:07
- **approvedAt**: 2026-05-15 10:07
- **completedAt**:
- **relatedTask**: REL-034

## Current State

PR #3 has been merged into `main` at `f14af975`, and the local checkout is clean
and aligned with `origin/main`.

The merged release-relevant changes cover:

- HR profile-first Worker Web experience centered on Current Profile Summary.
- Profile workspace ledger with `README.md` as the accepted profile and local
  git-backed revisions.
- Native Soul App skill projection from app-owned `skills/` folders into engine
  workspace skill directories.
- Generic local daemon profile read and profile revision promotion APIs.
- Five HR-native skills shipped with `apps/aiworker-hr`.

`@zonease/aiworker-cli@0.13.2` is the current npm latest. Local and remote tag
checks show that `v0.14.0` is still unused.

## Proposal

Publish `@zonease/aiworker-cli@0.14.0` as a minor release.

Execution steps:

1. Bump `apps/cli/package.json` from `0.13.2` to `0.14.0`.
2. Set `REL-034` / `PLAN-324` to implementation state and add a changelog
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
6. Push `main`, create and push annotated tag `v0.14.0`.
7. Monitor the tag-triggered GitHub Actions release workflow.
8. Verify:
   - `npm view @zonease/aiworker-cli version`
   - `bunx @zonease/aiworker-cli@0.14.0 --version`
   - `gh release view v0.14.0 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url`
   - a published-package Host Web/API + official app bootstrap smoke.
9. Close `REL-034`, `PLAN-324`, index files and `docs/changelog.md` with
   evidence and residual risks.

## Risks

- If local gates fail, stop before tag/publish and fix the blocker in a focused
  commit.
- If the GitHub Actions release workflow fails before npm publish, keep the
  release task open and retry only after diagnosis with a clean tag strategy.
- If npm publishes `0.14.0` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.
- The release workflow may still emit the known Node.js 20 deprecation
  annotation from `softprops/action-gh-release@v2`; this did not block prior
  releases.

## Scope

Expected repository changes:

- `apps/cli/package.json`
- `docs/task/REL-034.md`
- `docs/task/index.md`
- `docs/plan/PLAN-324.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No Host/Soul App feature behavior should change during the release step beyond
the already merged source changes and the version bump.

## Alternatives

1. Publish `0.13.3` instead. This is not recommended because the HR
   profile-ledger/native-skills slice is user-visible product capability, not a
   patch-only bug fix.
2. Do not publish now. This avoids release risk but leaves external users on
   `0.13.2` without the merged HR profile-first experience.
3. Reuse `0.13.2`. This is invalid because npm and GitHub tags already contain
   that version.

## Annotations

- 2026-05-15 10:07：用户授权接管直到流程结束；PR #3 已合并，开始执行
  `0.14.0` release prep、local gates、push、tag 与 post-release verification。
- 2026-05-15 10:09：本地 release gates 已通过到 source/build/dist/pack/smoke
  与 code-review-graph。下一步提交 release prep、推送 `main` 并创建 annotated
  tag `v0.14.0`。

## Verification

- Passed: `bun run check`
- Passed: `bun run test`
- Passed: `bun run build`
- Passed: `git diff --check`
- Passed: `bun apps/cli/dist/aiworker-bun.js --version` returned
  `aiworker/0.14.0 darwin-arm64 node-v24.3.0`
- Passed: `bun pm pkg get version --cwd apps/cli/dist` returned `"0.14.0"`
- Passed: `cd apps/cli/dist && npm pack --dry-run --json`; parsed pack preview
  reported `@zonease/aiworker-cli@0.14.0`, 119 files, 5,138,011 unpacked bytes,
  and included HR native skills plus required runtime resources.
- Passed: `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review` with 0 affected flows and 0 test gaps.

## Result

Pending.

## Residual Risk

Pending post-release verification.
