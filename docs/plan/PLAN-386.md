# PLAN-386 CLI 0.19.0 minor release

- **status**: in_progress
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: REL-051

## Current State

The current public release is `@zonease/aiworker-cli@0.18.4`, with GitHub
Release `v0.18.4`.

Current `main` contains Session Kit and MCP cleanup commits after `v0.18.4`:

- `709caccd` extracts shared Session Kit composer/timeline primitives.
- `12da3022` adds Session Activity Pipeline parsing and composer media previews.
- `2dd3a965` through `94b75637` close composer/timeline review gaps,
  attachments, busy state, usage and dedupe polish.
- `e3e75d35` and `9abb2909` close Host/Soul configuration terminology and MCP
  workspace-binding entrypoint cleanup.
- `8a4a3226` closes merge-time lint fallout.

## Proposal

Publish `@zonease/aiworker-cli@0.19.0` as a 0.x minor release.

Execution steps:

1. Bump `apps/cli/package.json` from `0.18.4` to `0.19.0`.
2. Record `REL-051` / `PLAN-386`.
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
4. Commit release prep, push `main`, create and push annotated tag `v0.19.0`.
5. Monitor GitHub Actions release and main lint workflows.
6. Verify npm latest, `bunx` version, GitHub Release assets and
   published-package smoke.
7. Record release results, push release docs and verify clean worktree.

## Risks

- The release includes broad Worker Web visible changes. Mitigation: use full
  check/test/build plus mounted-surface smoke and dist smoke.
- The release workflow is the only publish path for npm and binary assets. If
  it fails before publish, keep this task open and diagnose before retrying.
- If npm publishes but published-package smoke fails, do not overwrite
  `0.19.0`; record the regression and prepare a follow-up patch release.

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
- [ ] GitHub Actions release workflow
- [ ] GitHub Actions main lint workflow
- [ ] `npm view @zonease/aiworker-cli version dist-tags --json`
- [ ] `bunx @zonease/aiworker-cli@0.19.0 --version`
- [ ] `gh release view v0.19.0 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
- [ ] Published-package smoke
- [ ] `git status --short --branch`

## Annotations

- 2026-05-19 22:25 CST: Started `0.19.0` minor release prep. Root
  `check/test/build` already passed after Session Kit merge, MCP cleanup and
  before the version bump; continuing with release-specific dist and
  published-package gates.
- 2026-05-19 22:38 CST: Local release-prep gates passed. Dist CLI reports
  `aiworker/0.19.0 darwin-arm64 node-v24.3.0`; dist package metadata reports
  `@zonease/aiworker-cli@0.19.0`; pack dry-run produced
  `zonease-aiworker-cli-0.19.0.tgz` with 146 entries; mounted-surface smoke and
  dist release smoke passed; code-review-graph reported risk score `0.00`.
