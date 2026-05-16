# PLAN-341 CLI 0.17.0 minor release

- **status**: implementing
- **owner**: codex
- **createdAt**: 2026-05-17
- **approvedAt**: 2026-05-17
- **relatedTask**: REL-039

## Current State

`@zonease/aiworker-cli@0.16.1` is the current npm latest and GitHub latest
release. `FEAT-093 / PLAN-340` has landed on local `main`, adding the HR
Profile Reading Room and README base-section contract.

## Proposal

Publish `@zonease/aiworker-cli@0.17.0` as a minor preview release carrying the
HR profile-first Reading Room.

Execution steps:

1. Bump `apps/cli/package.json` from `0.16.1` to `0.17.0`.
2. Create `REL-039` / `PLAN-341` release tracking.
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
6. Push `main`, create and push annotated tag `v0.17.0`.
7. Monitor the tag-triggered GitHub Actions release workflow.
8. Verify:
   - `npm view @zonease/aiworker-cli version dist-tags --json`
   - `bunx @zonease/aiworker-cli@0.17.0 --version`
   - `gh release view v0.17.0 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
   - a published-package Host Web/API + official app smoke.
9. Close `REL-039`, `PLAN-341`, index files and `docs/changelog.md` with
   evidence and residual risks.

## Risks

- GitHub Actions release is the only path that actually publishes npm latest
  and GitHub Release binary assets. If it fails before npm publish, keep the
  release task open and retry only after diagnosis with a clean tag strategy.
- If npm publishes `0.17.0` but post-release smoke fails, do not overwrite that
  version; record the regression and prepare a follow-up patch release.
- HR Reading Room is a Web/Soul App UX change; release smoke must include the
  packaged Host Web/API and official app bootstrap, not just `--version`.

## Scope

Expected repository changes during release prep:

- `apps/cli/package.json`
- `docs/task/REL-039.md`
- `docs/task/index.md`
- `docs/plan/PLAN-341.md`
- `docs/plan/index.md`
- `docs/changelog.md`

No additional HR Reading Room feature behavior should change during release
prep beyond the version bump and release tracking.

## Annotations

- 2026-05-17：开始 `0.17.0` minor release prep。
- 2026-05-17：本地 release gates 通过；`npm pack --dry-run --json`
  确认 package id 为 `@zonease/aiworker-cli@0.17.0`、entryCount 为 128，
  包含 Worker Web `people-workbench-BHpi7EqO.js` bundle、official HR
  workspace README base-section seed，以及 HR/QA nested mounted/standalone
  runtime files。

## Verification

- `bun run check` passed.
- `bun run test` passed.
- `bun run build` passed.
- `git diff --check` passed.
- `bun apps/cli/dist/aiworker-bun.js --version` reported
  `aiworker/0.17.0 darwin-arm64 node-v24.3.0`.
- `bun pm pkg get version --cwd apps/cli/dist` reported `0.17.0`.
- `npm pack --dry-run --json` under `apps/cli/dist` reported
  `@zonease/aiworker-cli@0.17.0` with 128 entries.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release` passed and
  invoked HR `create-people-profile` plus QA `create-release-gate`.
- `bun run crg:update` passed.
- `bun run crg:review` exited 0 with risk score `0.00`.
