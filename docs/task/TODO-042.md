# TODO-042 Refresh README from current CLI onboarding behavior

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-08 02:17
- **claimedAt**: 2026-05-08 02:17
- **completedAt**: 2026-05-08 02:44
- **plan**: PLAN-167
- **sourceObjective**: Feed the latest CLI onboarding, env shortcut, doctor
  behavior, target audience framing, and readable topology back into README.md
  and README.zh-CN.md.
- **relatesTo**: TODO-040, TODO-041, README.md, README.zh-CN.md

## Context

After PLAN-165 and PLAN-166, the CLI now has a short root help screen, a full
`aiworker commands` index, worker-local env shortcuts, commented gateway
enrollment examples in newly minted `.env`, and `aiworker doctor` gateway
enrollment INFO/PASS output.

The README still contains older wording in a few places: `aiworker up` implies
executor selection, install text points only at `~/.aiworker/.env`, and the
Chinese README has stale status/version wording.

## Scope

- Update README.md and README.zh-CN.md to match current CLI behavior.
- Add a user-facing "who needs AIWorker" section.
- Replace the compact topology diagram with a wider, easier-to-read layout.
- Remove wording that reads like internal process rather than product/user
  guidance.
- Keep the README short and route detailed command reference to docs/cli.md.
- Sync PMA task/plan and changelog.

## Out of Scope

- No code changes.
- No release version bump.
- No deep architecture rewrite.

## Acceptance Criteria

1. README quickstart no longer says `aiworker up` selects an executor.
2. README explains short help / full command discovery.
3. README explains worker-local `.env` comments and doctor gateway guidance at
   the right level.
4. English and Chinese README status/version facts are aligned.
5. README includes a user-facing target-audience section.
6. README topology is more readable while preserving the same architecture
   boundaries.
7. README status and links avoid exposing internal regression implementation as
   the main user-facing explanation.

## Validation

- `git pull --ff-only` — already up to date.
- `bun apps/cli/src/aiworker.ts --help` — inspected current first-run help.
- `rg` stale-wording checks across README.md / README.zh-CN.md — pass for the
  targeted drift terms.
- `git diff --check` — pass.
