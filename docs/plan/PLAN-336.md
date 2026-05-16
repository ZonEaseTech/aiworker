# PLAN-336 CLI 0.16.0 minor release

- **status**: in_progress
- **owner**: codex
- **createdAt**: 2026-05-16
- **approvedAt**: 2026-05-16
- **relatedTask**: REL-037

## Current State

`@zonease/aiworker-cli@0.15.2` is the current npm latest and GitHub latest
release. `origin/main` includes the updater source-detection patch release and
the GitHub-hosted runner restoration. The feature branch adds Soul App authoring
layout v2 across official apps, scaffold, shared manifest schema, SDK, runtime
and core workspace projection.

## Proposal

Publish `@zonease/aiworker-cli@0.16.0` as a minor 0.x preview release.

Execution steps:

1. Merge the feature branch with current `origin/main` and resolve PMA numbering
   conflicts without dropping either release track.
2. Bump `apps/cli/package.json` from `0.15.2` to `0.16.0`.
3. Set `REL-037` / `PLAN-336` to implementation state and add a changelog
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
7. Fast-forward local `main` to the release prep commit, push `main`, create and
   push annotated tag `v0.16.0`.
8. Monitor the tag-triggered GitHub Actions release workflow.
9. Verify:
   - `npm view @zonease/aiworker-cli version dist-tags --json`
   - `bunx @zonease/aiworker-cli@0.16.0 --version`
   - `gh release view v0.16.0 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
   - a published-package Host Web/API + official app bootstrap smoke.
10. Close `REL-037`, `PLAN-336`, index files and `docs/changelog.md` with
    evidence and residual risks.

## Risks

- A conflict-resolution mistake could drop the `0.15.2` release documents or
  mis-number the Soul App v2 plans. Verify indexes and docs contract before
  release prep.
- The authoring layout refactor touches package resources that must be included
  in the CLI dist package; `npm pack --dry-run --json` and dist smoke are
  release blockers.
- If the GitHub Actions release workflow fails before npm publish, keep the
  release task open and retry only after diagnosis with a clean tag strategy.
- If npm publishes `0.16.0` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.

## Scope

Expected repository changes during the release step:

- `apps/cli/package.json`
- `docs/task/REL-037.md`
- `docs/task/index.md`
- `docs/plan/PLAN-336.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No additional Host/Soul App feature behavior should change during release prep
beyond the already merged source changes and the version bump.

## Verification

- `bun run check` passed.
- `bun run test` passed.
- `bun run build` passed.
- `git diff --check` passed.
- `bun apps/cli/dist/aiworker-bun.js --version` reported
  `aiworker/0.16.0 darwin-arm64 node-v24.3.0`.
- `bun pm pkg get version --cwd apps/cli/dist` reported `0.16.0`.
- `npm pack --dry-run --json` under `apps/cli/dist` reported
  `@zonease/aiworker-cli@0.16.0` with 132 files including CLI shims, Worker Web
  static, migrations and official HR/QA app resources.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passed.
- `bun run crg:update` passed.
- `bun run crg:review` passed with risk score `0.00`.
