# PLAN-361 Profile ledger Git identity side-effect hardening

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-18
- **approvedAt**: 2026-05-18
- **completedAt**: 2026-05-18
- **relatedTask**: BUG-136

## Current State

`BUG-126 / PLAN-344` already changed profile ledger repository detection from
`git rev-parse --is-inside-work-tree` to a top-level equality check with
`GIT_CEILING_DIRECTORIES`, which prevents child workspaces under ignored source
checkout paths from reusing the parent repository.

The incident review found a remaining design issue: `profile-ledger` still
persists the ledger identity by running `git config user.name` and
`git config user.email`. That makes the correct ledger repository stateful and
made the wrong repository contamination more durable when parent discovery
leaked before `BUG-126`.

Current source checkout state:

- Global Git identity is `BenDaye <ben@ttpos.com>`.
- The source checkout local config no longer reports `user.name` or
  `user.email` overrides.
- Commits from `285e5f22` through `b31ff94a` were authored as
  `AIWorker Profile Ledger <aiworker@local>`.

## Proposal

1. Extend the existing ignored-parent-repository regression test so it verifies:
   - the parent repository does not gain local `user.name` or `user.email`;
   - the profile workspace does not persist local `user.name` or `user.email`;
   - the actual profile commit author remains
     `AIWorker Profile Ledger <aiworker@local>`.
2. Replace persistent `git config` identity writes with per-process Git
   identity environment variables in `runGit`.
3. Keep history rewrite out of scope. Record the contaminated range and leave
   remediation to a separate explicit decision if needed.
4. Close PMA records and changelog with the evidence.

## Scope

- `packages/core/src/worker/profile-ledger.ts`
- `packages/core/src/worker/runtime.test.ts`
- `docs/task/BUG-136.md`
- `docs/task/index.md`
- `docs/plan/PLAN-361.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Risks

- Profile ledger commits must still succeed in repositories without any global
  Git identity configured.
- Annotated profile tags also need committer identity from the process
  environment.
- Avoid rewriting already-pushed release history during this fix.

## Verification

- [x] Regression test fails before the production change for the expected
  persisted local config reason.
- [x] `bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts`
- [x] `bun run --filter '@zonease/aiworker-core' test`
- [x] `bun run --filter '@zonease/aiworker-core' typecheck`
- [x] `git config --local --list | rg '^(user\\.name|user\\.email)='` returns no
  matches for the source checkout.
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Annotations

- 2026-05-18: User authorized Codex to take over the BUG handling end to end.
- 2026-05-18: The focused regression failed before the production change because
  the workspace ledger persisted `user.name` and `user.email` into local Git
  config.
- 2026-05-18: Profile ledger identity was moved to per-process Git environment
  variables; focused runtime tests, full core tests, and core typecheck passed.

## Outcome

Completed the hardening:

- Removed persistent `git config user.name/user.email` writes from
  `profile-ledger`.
- Kept profile commit and tag provenance via `GIT_AUTHOR_*` and
  `GIT_COMMITTER_*` environment variables.
- Extended the ignored-parent-repository regression to prove parent and
  workspace local Git config remain clean while the profile commit author stays
  `AIWorker Profile Ledger <aiworker@local>`.
- Confirmed the current source checkout has no local `user.name` /
  `user.email` override.
- Recorded the contaminated shared-history range as 27 commits,
  `285e5f22..b31ff94a`, without rewriting it.
