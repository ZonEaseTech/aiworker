# PLAN-031 Publish aiworker CLI 0.4.4

- **status**: completed
- **createdAt**: 2026-04-28 19:14
- **approvedAt**: 2026-04-28 19:14
- **relatedTask**: REL-001

## Context

Current release state:

1. npm `@zonease/aiworker-cli` latest is `0.4.3`.
2. Git tag `v0.4.3` exists locally.
3. Local `apps/cli/package.json` still declared `0.4.3` before this plan.
4. Commits after `v0.4.3` are:
   - `fix(core): preserve accepted gateway chat ids`
   - `fix(web): restore Tailwind utility generation`
   - `chore(skills): add AIWorker fleet test workflow`
5. Local npm auth is not available, but the repository has a tag-triggered
   release workflow that publishes from `apps/cli/dist` using `NPM_TOKEN`.

## Proposal

1. Bump `apps/cli/package.json` to `0.4.4`.
2. Mark `BUG-027` and `BUG-028` as targeting
   `@zonease/aiworker-cli@0.4.4`.
3. Run local release gates:
   - root typecheck;
   - root tests;
   - root lint;
   - root build;
   - CLI smoke scripts.
4. Verify package output:
   - `apps/cli/dist/package.json` reports `0.4.4`;
   - Web bundles and migrations are present in dist;
   - publish dry-run succeeds up to authentication/publish boundary.
5. Commit the release bump with a conventional commit, tag `v0.4.4`, push
   `main` and the tag, then monitor the GitHub Actions release run.
6. Verify npm after the workflow completes.

## Risks

- If the repository `NPM_TOKEN` secret is missing or expired, the GitHub release
  workflow will fail at publish time.
- Full test-server Codex worker E2E is not part of the GitHub workflow and may
  still need an operator smoke after npm publish.
- The Web bundle now includes the restored Tailwind utilities, so artifact size
  is intentionally larger than the broken 0.4.3 CSS.

## Scope

Expected repository changes:

- `apps/cli/package.json`
- `docs/task/REL-001.md`
- `docs/task/index.md`
- `docs/task/BUG-027.md`
- `docs/task/BUG-028.md`
- `docs/plan/PLAN-031.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Alternatives

1. Publish locally from `apps/cli/dist`. Rejected for the primary path because
   local npm auth is not available.
2. Reuse version `0.4.3`. Rejected because npm already has `0.4.3` and the
   release contains patch fixes after that tag.

## Annotations

- User requested release directly with "发版"; this plan is treated as approved
  release execution.
- 2026-04-28 19:19 Completed. Local gates passed, `v0.4.4` was pushed, the
  GitHub release workflow succeeded, npm latest is `0.4.4`, and GitHub Release
  `v0.4.4` is published with platform tarballs.
