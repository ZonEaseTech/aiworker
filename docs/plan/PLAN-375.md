# PLAN-375 CLI 0.18.4 patch release

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: REL-050

## Current State

The current public release is `@zonease/aiworker-cli@0.18.3`, with GitHub
Release `v0.18.3`.

Current `main` contains four commits after `v0.18.3`:

- `6900431a` updates the Worker Web bundle size baseline after the previous
  release exposed stale lint metadata.
- `8fbfec15` records the `0.18.3` release evidence.
- `46cb72cc` refines HR recent session entries.
- `b47ecaa9` fixes the HR profile composer select expanded menu styling.

## Proposal

Publish `@zonease/aiworker-cli@0.18.4` as a patch release and clean the local
worktree after release closeout.

Execution steps:

1. Bump `apps/cli/package.json` from `0.18.3` to `0.18.4`.
2. Record `REL-050` / `PLAN-375`.
3. Run local gates:
   - `bun run check`
   - `bun run test`
   - `bun run build`
   - `bun run web:smoke:mounted-surfaces`
   - `git diff --check`
   - `bun apps/cli/dist/aiworker-bun.js --version`
   - `jq -r '.name + "@" + .version' apps/cli/dist/package.json`
   - `cd apps/cli/dist && npm pack --dry-run --json`
   - `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
   - `bun run crg:update`
   - `bun run crg:review`
4. Commit release prep, push `main`, create and push annotated tag `v0.18.4`.
5. Monitor GitHub Actions release and main lint workflows.
6. Verify npm latest, `bunx` version, GitHub Release assets, and a
   published-package smoke.
7. Record release results, push release docs, and verify clean worktree.

## Risks

- The release workflow is the only publish path for npm and binary assets. If
  it fails before publish, keep this task open and diagnose before retrying.
- If npm publishes but published-package smoke fails, do not overwrite
  `0.18.4`; record the regression and prepare a follow-up patch release.
- The release includes Web-visible changes, so full Web build/test and
  mounted-surface smoke are required.

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
- [x] GitHub Actions release workflow.
- [x] GitHub Actions main lint workflow.
- [x] `npm view @zonease/aiworker-cli version dist-tags --json`
- [x] `bunx @zonease/aiworker-cli@0.18.4 --version`
- [x] `gh release view v0.18.4 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
- [x] Published-package smoke.
- [x] `git status --short --branch`

## Annotations

- 2026-05-19 18:05 CST: Started `0.18.4` patch release prep. Root
  `check/test/build` already passed after the feature commit and before the
  version bump; continuing with release-specific dist and published-package
  gates.
- 2026-05-19 18:18 CST: Local release gates passed. Dist CLI reports
  `aiworker/0.18.4 darwin-arm64 node-v24.3.0`; dist package metadata reports
  `@zonease/aiworker-cli@0.18.4`; pack dry-run produced
  `zonease-aiworker-cli-0.18.4.tgz` with 146 entries; dist release smoke
  passed; code-review-graph reported risk score `0.00`.
- 2026-05-19 18:23 CST: Pushed `main` and annotated tag `v0.18.4`. Release
  workflow `26090536203` passed; main lint workflow `26090531497` passed; npm
  latest resolves to `0.18.4`; `bunx @zonease/aiworker-cli@0.18.4 --version`
  reported `aiworker/0.18.4`; GitHub Release `v0.18.4` is formal with 8
  binary/checksum assets; published-package smoke passed from public npm package
  with report at
  `/tmp/aiworker-release-0.18.4-published-smoke-AwGwV9/report.json`.
