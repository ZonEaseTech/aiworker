# PLAN-034 Integrate reviewed 0.4.4 repairs and optimizations

- **status**: completed
- **createdAt**: 2026-04-28 21:41
- **approvedAt**: 2026-04-28 21:41
- **relatedTask**: QA-001
- **bkd**: akif8ehr

## Context

The baseline `0.4.4` validation and extended `QA-001` campaign recorded and
dispatched a set of repairs and optimizations. Their implementation BKD
worktrees have reported completion and are in review. The current repository
worktree still contains only PMA tracking/evidence changes from the parent QA
session; source fixes should be integrated through BKD worktrees and reviewed
before any merge to the main branch.

The reviewed branches overlap in several areas, especially CLI entrypoints,
gateway commands, Web package metadata, and PMA docs. Re-dispatching the same
individual fixes would create duplicate work. The next step is a single
integration batch that combines reviewed branches into one merge-ready
integration worktree, runs verification, and reports the result.

## Proposal

Create a BKD integration coordinator plus one execution worker and one audit
worker:

1. Single worktree-mode integration worker: `lc9ls9zp`
   - Integrate reviewed repairs for `BUG-014`, `BUG-029`, `BUG-030`,
     `BUG-031`, `BUG-032`, `BUG-033`, `BUG-034`, `TODO-001`, `TODO-002`,
     `TODO-003`, `TODO-005`, and `TODO-006`.
   - Resolve overlaps around CLI entrypoints, gateway command helpers,
     responsive Web shell changes, Web smoke/package metadata, test
     reliability scripts, process cleanup utilities, safe child-env handling,
     and user-facing docs.
2. Read-only audit worker: `kq6e22bw`
   - Inspect reviewed BKD outputs and logs before merge.
   - Classify per-issue risk, identify merge blockers, recommend integration
     order, and report required gates back to coordinator `akif8ehr`.

`TODO-004` remains a proposal/review item for now because it changes the admin
public-exposure posture and should not be silently implemented as part of this
batch.

The attempted split-lane workers `yg3l8xva` and `o599yeb9` were created by
mistake, canceled, and must not be treated as merge inputs. Their partial
worktree changes are superseded by `lc9ls9zp`.

## Verification

The integration worker must:

- keep PMA docs from individual worktrees out of the integrated source branch
  unless needed for user-facing documentation;
- run focused package tests for the integrated scope;
- run `pma-cr` on its own integrated diff;
- fix P0/P1 findings before reporting;
- report changed files, merge conflicts, test results, and residual risks to
  BKD coordinator `akif8ehr`;
- leave the issue in `review`, not `done`.

The audit worker must avoid source edits and report red/yellow/green quality
signals to coordinator `akif8ehr` for follow-up.

## Annotations

- 2026-04-28 21:41 Created BKD coordinator `akif8ehr` for the integration
  batch. No source fixes were made in the parent session.
- 2026-04-28 21:45 Started coordinator `akif8ehr`, integration worker
  `lc9ls9zp`, and audit worker `kq6e22bw`. The parent session remains
  record-only for source fixes.
- 2026-04-28 21:47 Superseded the all-in-one worker `lc9ls9zp` while its
  worktree was still clean, then started lane workers `yg3l8xva`
  (CLI/gateway/runtime) and `o599yeb9` (Web/UI/build). Both are worktree-mode
  integration subtasks and must report back to `akif8ehr` after PMA-CR
  self-review.
- 2026-04-28 21:50 Confirmed the existing BKD cron
  `QA-001-PLAN-034-split-poll` is monitoring lane completion every 30 minutes.
  A duplicate short-interval status cron was created during handoff setup and
  immediately deleted to avoid duplicate coordinator wakeups.
- 2026-04-28 21:47 Quality assessment rejected the first `kq6e22bw` audit run
  because it did not produce the required risk report; the issue was moved back
  to `working` with rework instructions. Added cron `QA-001-PLAN-034-poll`
  (`wjxil9uj`) as a 30-minute coordinator follow-up safety net.
- 2026-04-28 21:49 Replaced the initial cron `wjxil9uj` with
  `QA-001-PLAN-034-split-poll` (`tigirxz7`) so coordinator follow-ups monitor
  the actual split-lane topology: `yg3l8xva`, `o599yeb9`, `kq6e22bw`, and the
  superseded `lc9ls9zp`.
- 2026-04-28 21:53 Applied coordinator correction: `lc9ls9zp` is again the
  single active integration worker and `kq6e22bw` remains the read-only audit
  worker. Canceled superseded split workers `yg3l8xva` and `o599yeb9`, leaving
  them in review/completed with explicit "do not merge" follow-ups because
  they had already started partial worktree diffs. Replaced split cron
  `tigirxz7` with single-topology cron `QA-001-PLAN-034-single-poll`
  (`743g1an3`).
- 2026-04-28 21:54 Audit worker `kq6e22bw` produced the required second audit
  report and classified `x6936h4q` (`BUG-033`) as red because the latest
  visible assistant output was unrelated memory-consolidation text with a
  `bwrap` failure, not a clean BUG-033 final report. Sent rework instructions
  to `x6936h4q`, moved it back to working, and notified `lc9ls9zp` not to
  treat BUG-033 as a green input until a clean report or explicit override.
- 2026-04-28 21:55 Replaced single-topology cron `743g1an3` with
  `QA-001-PLAN-034-single-poll` (`loqw8dd9`) so the coordinator poll tracks
  `lc9ls9zp`, `kq6e22bw`, and the active BUG-033 blocker `x6936h4q`.
- 2026-04-28 21:56 `x6936h4q` completed its wake-up turn but still did not
  produce a clean BUG-033 final report; the latest visible output remains
  contaminated by unrelated memory-consolidation failure text. Treat BUG-033
  as not green until `lc9ls9zp` self-reviews that diff during integration or a
  coordinator/human override is recorded.
- 2026-04-28 21:58 Recorded the full read-only audit report as the current
  merge-gate input. Overall audit status is red because `x6936h4q` still lacks
  a clean BUG-033 final report; all other reviewed issues are yellow except
  `jfmsr8wc` green. Sent the audit merge order, conflict notes, and required
  verification gates to `lc9ls9zp`. Replaced cron `loqw8dd9` with
  `QA-001-PLAN-034-single-poll` (`rbnw92in`) so the coordinator monitors only
  the single integration worker and does not repeatedly auto-retry the known
  BUG-033 red signal.
- 2026-04-28 21:59 Received a clean BUG-033 final report for `x6936h4q`.
  The issue is now review/completed and can be treated as a reviewed input for
  `apps/cli/src/test-utils/integration-cleanup.ts`,
  `apps/cli/src/test-utils/integration-cleanup.test.ts`, and
  `apps/cli/src/commands/init.integration.test.ts`. Verification reported
  passing focused cleanup/init tests, full CLI tests, CLI typecheck, targeted
  ESLint, `git diff --check`, and recent temp-dir leftover scan. Forwarded the
  clean status to `lc9ls9zp` and replaced cron `rbnw92in` with
  `QA-001-PLAN-034-single-poll` (`lznk9t9h`) so the coordinator no longer
  treats BUG-033 as red, while still requiring integration self-review and the
  detached-daemon residual risk in the final report.
- 2026-04-28 22:08 `lc9ls9zp` reported successful integration at commit
  `897d15c` (`fix: integrate reviewed 0.4.4 repairs`) on `bkd/lc9ls9zp` with
  full gate results and PMA-CR self-review. A later BUG-033 clean-status
  follow-up started another review/running turn for supplemental verification,
  so the coordinator moved `lc9ls9zp` back to working until that final
  confirmation completes. No source changes were made in the parent worktree.
- 2026-04-28 22:16 `lc9ls9zp` completed the supplemental verification and
  returned to review/completed. The authoritative branch remains
  `bkd/lc9ls9zp` at commit `897d15c`, with BUG-033 now cleared and included as
  reviewed input. Coordinator checks found the integration worktree clean,
  `diff --check` clean, no child PMA/changelog paths, and no TODO-004/public
  exposure matches. Started final read-only merge-gate audit on `kq6e22bw` and
  replaced cron `lznk9t9h` with `QA-001-PLAN-034-final-audit-poll`
  (`4pzburr4`).
- 2026-04-28 22:18 The first final-audit attempt from `kq6e22bw` was rejected
  as red because its latest assistant output was unrelated memory-consolidation
  text and did not provide a `green|yellow|red` merge-gate classification for
  commit `897d15c`. Sent explicit rework instructions limiting the audit to
  `/workspace/worktrees/lded7ogt/lc9ls9zp` and BKD context, then moved
  `kq6e22bw` back to working.
- 2026-04-28 22:20 Final read-only audit from `kq6e22bw` returned green:
  blockers none, findings none, and merge recommendation `merge` for
  `bkd/lc9ls9zp` commit `897d15c`. The reviewed integration branch is
  merge-ready but has not been merged into parent `main`. Residual human-review
  risks: future detached daemon-style tests need explicit daemon-stop cleanup,
  systemd behavior still needs live user/system-scope validation, Vite chunk
  warnings remain non-fatal, Web mobile layout still needs final human visual
  acceptance after merge/deploy, and safe Git env intentionally preserves
  Git SSH/askpass behavior while filtering AIWorker/token-like secrets.
- 2026-04-28 22:21 Deleted final-audit cron
  `QA-001-PLAN-034-final-audit-poll` (`4pzburr4`) and moved BKD coordinator
  `akif8ehr` to review. No issue was moved to done, and parent `main` was not
  merged.
- 2026-04-29 03:41 Merged `bkd/lc9ls9zp` into `main` with merge commit
  `05762a4` (`fix: merge reviewed 0.4.4 repairs`). Pre-merge `merge-tree`
  found no conflicts; current `main` agent/Serena configuration was preserved.
  `TODO-004` remains excluded and pending proposal approval.
- 2026-04-29 03:48 Post-merge gates passed: root typecheck, lint, build,
  workspace tests, CLI `smoke:aiworker-run`, CLI `smoke:aiworker-fleet`, and
  Web `smoke:e2e`. The first Web smoke attempt failed because local
  `node_modules` lacked the newly merged workspace symlink for
  `@zonease/aiworker-gateway`; `bun install --frozen-lockfile` refreshed the
  symlink without source or lockfile changes, and the smoke then passed.
  Moved merged BKD implementation/audit/coordinator issues to `done`.
  Superseded split workers `yg3l8xva` and `o599yeb9`, proposal-only
  `TODO-004`/`kz12xf5k`, and active parent issue `veyrxhkc` remain open.
- 2026-04-29 03:56 Closed the remaining review-state QA discovery subtasks
  `pow2u9ox`, `e3lt7ehz`, `ay9a9yox`, and `4j09qpa5` because their findings
  were already incorporated into `QA-001` and the merged repair batch. Also
  closed superseded split workers `yg3l8xva` and `o599yeb9` as do-not-merge
  cleanup. Kept `kz12xf5k` in review because `TODO-004` remains a pending
  proposal decision, not a merged repair.
