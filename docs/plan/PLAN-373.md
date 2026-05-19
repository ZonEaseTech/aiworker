# PLAN-373 CLI 0.18.3 patch release

- **status**: implementing
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: REL-049

## Current State

The current public release is `@zonease/aiworker-cli@0.18.2`, with GitHub
Release `v0.18.2`.

Local `main` is clean and ahead of `origin/main` by three commits:

- `ff93c84a` replaces SVG brand assets with PNG assets and adjusts API static
  asset tests.
- `2da2dae6` adds the shared UI component governance gate.
- `c3424fd0` refines the HR profile composer right panel and moves proposal
  type to the shared component `Select`.

## Proposal

Publish `@zonease/aiworker-cli@0.18.3` as a patch release and clean the local
worktree after release closeout.

Execution steps:

1. Bump `apps/cli/package.json` from `0.18.2` to `0.18.3`.
2. Record `REL-049` / `PLAN-373`.
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
4. Commit release prep, push `main`, create and push annotated tag `v0.18.3`.
5. Monitor GitHub Actions release and main lint workflows.
6. Verify npm latest, `bunx` version, GitHub Release assets, and a
   published-package smoke.
7. Record release results, push release docs, and verify clean worktree.

## Risks

- The release workflow is the only publish path for npm and binary assets. If
  it fails before publish, keep this task open and diagnose before retrying.
- If npm publishes but published-package smoke fails, do not overwrite
  `0.18.3`; record the regression and prepare a follow-up patch release.
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
- [ ] GitHub Actions release workflow.
- [ ] GitHub Actions main lint workflow.
- [ ] `npm view @zonease/aiworker-cli version dist-tags --json`
- [ ] `bunx @zonease/aiworker-cli@0.18.3 --version`
- [ ] `gh release view v0.18.3 --repo ZonEaseTech/aiworker --json tagName,isDraft,isPrerelease,assets,url,publishedAt,targetCommitish`
- [ ] Published-package smoke.
- [ ] `git status --short --branch`

## Annotations

- 2026-05-19 16:57 CST：开始 `0.18.3` patch release prep。
- 2026-05-19 17:23 CST：本地 release gates 全部通过。`npm pack --dry-run`
  生成 `zonease-aiworker-cli-0.18.3.tgz`，dist CLI 报告
  `aiworker/0.18.3`，dist release smoke 证明 Host Web/API、官方 HR/QA app
  bootstrap 与 mounted actions 正常；code-review-graph 风险分数 `0.00`。
