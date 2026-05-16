# PLAN-330 Restore GitHub-hosted release workflows

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-15 21:00
- **approvedAt**: 2026-05-15 21:00
- **completedAt**: 2026-05-15 21:00
- **relatedTask**: BUG-122

## Current State

The `v0.15.2` release succeeded on temporary self-hosted runner configuration.
After the release, the repository workflows still pointed at
`[self-hosted, ttpos-uat-linux]`, even though the self-hosted runner group was
restored to disallow public repositories. That leaves future main/release runs
misconfigured and normalizes a risky fallback path.

## Proposal

Restore the workflows to `ubuntu-latest`, preserve the release-stabilizing Node
24 and Node heap settings, and record the corrected operating rule:

1. Cancel and re-run queued GitHub-hosted release jobs first.
2. Investigate org/repo Actions policy or GitHub-hosted runner availability if
   re-runs still do not start.
3. Use self-hosted fallback only with explicit operator acceptance.
4. Revert any self-hosted fallback before final release closeout.

## Scope

- `.github/workflows/lint.yml`
- `.github/workflows/release.yml`
- `docs/task/BUG-122.md`
- `docs/task/index.md`
- `docs/plan/PLAN-330.md`
- `docs/plan/index.md`
- `docs/changelog.md`
- `/Users/ben/.codex/memories/extensions/ad_hoc/notes/20260515-210053-aiworker-release-ci-fallback.md`

## Verification

- `rg -n "runs-on:|NODE_OPTIONS|node-version" .github/workflows/lint.yml
  .github/workflows/release.yml` confirms both workflows use
  `ubuntu-latest`, keep `NODE_OPTIONS=--max-old-space-size=1024`, and keep Node
  24.
- `bun run docs:check` passed.
- `git diff --check` passed.
- This change is workflow/docs/memory only; code-review-graph is not required
  because no production code changed.
