# PLAN-035 Publish aiworker CLI 0.4.5

- **status**: completed
- **createdAt**: 2026-04-29 06:02
- **approvedAt**: 2026-04-29 06:02
- **relatedTask**: REL-002

## Context

Current release state:

1. npm `@zonease/aiworker-cli` latest is `0.4.4`.
2. Git tag `v0.4.4` exists locally and remotely.
3. Local `apps/cli/package.json` declared `0.4.4` before this plan.
4. Local `main` is ahead of `origin/main` by reviewed post-0.4.4 commits:
   - `chore(agents): refresh project tool configuration`
   - `fix: integrate reviewed 0.4.4 repairs`
   - `fix: merge reviewed 0.4.4 repairs`
   - `docs: record 0.4.4 validation cleanup`
   - `docs: record review issue cleanup`
   - `fix(security): fail closed public admin serving`
5. The existing tag-triggered release workflow publishes from `apps/cli/dist`
   using repository npm credentials.

## Proposal

1. Bump `apps/cli/package.json` to `0.4.5`.
2. Mark the post-0.4.4 repair and hardening tasks as targeting
   `@zonease/aiworker-cli@0.4.5`.
3. Run local release gates:
   - workspace tests;
   - root typecheck;
   - root lint;
   - root build;
   - CLI smoke scripts.
4. Verify package output:
   - `apps/cli/dist/package.json` reports `0.4.5`;
   - Web bundles and migrations are present in dist;
   - publish dry-run succeeds up to the publish boundary.
5. Run a release-diff review and commit the release bump with a conventional
   commit.
6. Tag `v0.4.5`, push `main` and the tag, monitor the GitHub Actions release
   run, then verify npm after the workflow completes.

## Risks

- If the repository `NPM_TOKEN` secret is missing or expired, the GitHub release
  workflow will fail at publish time.
- Local `main` is ahead of `origin/main`; pushing this release also publishes
  the reviewed post-0.4.4 commits currently queued locally.
- The release workflow does not run the full remote fleet Codex worker E2E
  campaign, so npm publication verification is separate from any later fleet
  upgrade.

## Scope

Expected repository changes:

- `apps/cli/package.json`
- `docs/task/REL-002.md`
- `docs/task/index.md`
- post-0.4.4 task release-target metadata
- `docs/plan/PLAN-035.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Alternatives

1. Publish locally from `apps/cli/dist`. Rejected for the primary path because
   the repository already has a tag-triggered release workflow with npm
   credentials.
2. Reuse version `0.4.4`. Rejected because npm already has `0.4.4` and the
   release contains additional patch fixes after that tag.

## Annotations

- 2026-04-29 06:02 Direct release request treated as approval to execute the
  patch release.
- 2026-04-29 06:10 Completed. Local gates passed, `v0.4.5` was pushed, the
  GitHub release workflow succeeded, npm latest is `0.4.5`, and GitHub Release
  `v0.4.5` is published with platform tarballs.

## Verification

- `bun install --frozen-lockfile`
- `bun run --filter '*' test`
- `bun run typecheck`
- `bun run lint`
- `bun run build`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- `bun publish --dry-run --access public` from `apps/cli/dist` packed 25 files
  and stopped at the local npm authentication boundary.
- GitHub Actions release run `25093652889` completed successfully.
- npm registry verification resolved `@zonease/aiworker-cli@0.4.5` as
  `latest`.
- Published-package smoke reported `aiworker/0.4.5`.
