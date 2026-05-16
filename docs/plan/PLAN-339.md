# PLAN-339 GitHub Actions Node 24 action runtime migration

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-16 23:31
- **approvedAt**: 2026-05-16 23:31
- **completedAt**: 2026-05-16 23:32
- **relatedTask**: BUG-124

## Current State

The repository has two active workflows:

- `.github/workflows/lint.yml`
- `.github/workflows/release.yml`

Both workflows already run project build scripts with Node.js 24 through
`node-version: '24'`, and both keep `NODE_OPTIONS=--max-old-space-size=1024`
from the recent release-runner stabilization work. GitHub still emits
Node.js 20 action runtime annotations because `actions/setup-node@v4` and
`softprops/action-gh-release@v2` declare Node.js 20 runtimes.

## Proposal

Apply the narrow action major upgrades that move the action runtime to Node.js
24 without changing workflow semantics:

1. Change `actions/setup-node@v4` to `actions/setup-node@v5` in `lint.yml`.
2. Change `actions/setup-node@v4` to `actions/setup-node@v5` in `release.yml`.
3. Change `softprops/action-gh-release@v2` to
   `softprops/action-gh-release@v3` in `release.yml`.
4. Keep all commands, permissions, runner labels, Node.js version, npm publish
   token handling, binary packaging, and release asset globs unchanged.

## Risks

- `softprops/action-gh-release@v3` is a major version upgrade. Its documented
  purpose is moving the action runtime from Node.js 20 to Node.js 24, but the
  next real tag-triggered release remains the strongest end-to-end validation.
- The local repository cannot fully execute the tag-triggered GitHub Release
  upload step without pushing a tag. Local verification should therefore focus
  on static workflow references and repository docs checks.

## Scope

- `.github/workflows/lint.yml`
- `.github/workflows/release.yml`
- `docs/task/BUG-124.md`
- `docs/task/index.md`
- `docs/plan/PLAN-339.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Verification

- Red check: `rg -n "actions/setup-node@v4|softprops/action-gh-release@v2" .github/workflows`
  found the existing deprecated action runtime references before the change.
- `rg -n "actions/setup-node@v4|softprops/action-gh-release@v2" .github/workflows`
  found no deprecated action runtime references after the change.
- `rg -n "actions/setup-node@v5|softprops/action-gh-release@v3|node-version: '24'|NODE_OPTIONS|runs-on: ubuntu-latest" .github/workflows/lint.yml .github/workflows/release.yml`
  confirmed the upgraded action references, GitHub-hosted runners, Node.js 24
  setup, and heap setting.
- `bun run docs:check` passed.
- `git diff --check` passed.
- `bun run crg:update` passed.
- `bun run crg:review` exited 0 with a low-risk config/docs diff.
