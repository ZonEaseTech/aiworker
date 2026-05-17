# PLAN-344 HR native skills README closure debug campaign

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-17 11:23
- **approvedAt**: 2026-05-17 11:23
- **completedAt**: 2026-05-17
- **relatedTask**: QA-035

## Context

The previous slice aligned HR native skill wording around artifact production
and HR product-owned promotion. That work proved static instruction intent, but
it did not prove that real Codex-backed AIWorker sessions can move from a zero
profile through all native skills, produce useful artifacts, pass review, and
promote a coherent accepted `README.md`.

Current investigation found:

- `codex-cli 0.128.0` is available in the real user environment.
- CLI `session start` and `turn send` use the local Codex executor.
- CLI artifact/session commands exist, but profile promotion currently uses the
  local daemon REST endpoint
  `POST /api/local/workspaces/:workspaceId/profile-revisions`.
- Previous memory notes show an accepted-profile mismatch risk: generated
  proposal-shaped content can leak into `README.md` if promotion input is not
  normalized.

## Proposal

1. Use a disposable debug root under `tmp/` with isolated `AIWORKER_HOME` while
   preserving the real user `HOME` for Codex login.
2. Build a debug matrix with at least three HR profiles. For each profile, run
   all five HR native skills with at least two turns per skill session.
3. Capture CLI JSON, workspace trees, artifacts, reviews, Codex invocation logs
   and profile README snapshots under the debug root.
4. Promote at least two profile update proposals through the local daemon REST
   profile revision endpoint.
5. Apply systematic debugging: no prompt/code changes before reproducing and
   locating root causes.
6. When concrete bugs or optimization items are found, record them as PMA
   `BUG-*` or `TODO-*` tasks and only implement tightly scoped fixes after the
   root cause is proven.
7. Rerun the affected matrix entries after tuning and close with a sanitized
   report, PMA/changelog updates and a commit.

## Debug Matrix

| Profile | Workspace intent | Skills | Turns per skill | Promotion target |
| --- | --- | --- | --- | --- |
| `hr-profile-alpha` | Candidate profile with strong role evidence | all five HR native skills | 2+ | promote profile proposal |
| `hr-profile-beta` | Candidate profile with conflicting evidence and risk notes | all five HR native skills | 2+ | promote only if review is safe |
| `hr-profile-gamma` | People lifecycle profile with sparse evidence | all five HR native skills | 2+ | inspect artifact loop; promote if coherent |

## Risks

- Real Codex execution may be slow or produce nondeterministic artifact shapes.
  The campaign should capture raw prompts, stdout/stderr and artifacts rather
  than relying on summary text.
- Promotion can currently accept caller-supplied `profileMarkdown`; if product
  normalization is missing, `README.md` may become proposal-shaped. Treat that
  as a root-cause candidate, not as an assumption.
- CLI does not expose profile promotion. Use REST against the local daemon and
  record that as a product/API surface gap if it blocks the workflow.
- Keep raw sensitive evidence synthetic. Do not use real candidate data.

## Scope

- Disposable debug root under `tmp/`.
- HR app engine assets and product policy only if tuning is required.
- PMA bug/TODO records for defects or follow-ups.
- Existing CLI/API/runtime code only if a reproduced root cause requires it.

## Verification

- Real Codex-backed matrix evidence exists for all planned profiles and skills.
- `README.md` snapshots show whether zero profile, artifact proposals and final
  accepted profile are distinct and coherent.
- Targeted tests or validation commands pass after any code or instruction
  tuning.
- `git diff --check` passes.
- `bun run crg:update` and `bun run crg:review` run if code files change.

## Annotations

- 2026-05-17 11:23: User authorized goal-mode end-to-end debugging using the
  locally logged-in Codex CLI.
- 2026-05-17 11:43: Matrix completed with 15 sessions and 30 real Codex turns.
- 2026-05-17 11:48: REST promotion closed the README loop for alpha and gamma;
  beta stayed blocked by its own risk review.

## Outcome

Implemented the first tuning pass required to make the HR README loop close:

- Fixed profile ledger git isolation for workspaces inside ignored parent
  repositories.
- Fixed CLI/runtime continuation metadata so multi-turn sessions preserve the
  selected capability output kind and review context.
- Added CLI workspace `--type` and Codex `--model` / `--reasoning` overrides to
  support typed HR debug runs and stable real Codex execution.
- Added an executor debug isolation flag for Codex `--ignore-user-config`.
- Tuned `profile-update-proposal` and Worker Web promotion so product review
  promotes an explicit accepted profile draft instead of the whole proposal.
- Captured remaining follow-up tasks in `BUG-129`, `TODO-043`, and `TODO-044`.

## Evidence

- Debug root:
  `/private/tmp/aiworker-hr-native-skill-debug-20260517-114309-matrix`
- Matrix status:
  `/private/tmp/aiworker-hr-native-skill-debug-20260517-114309-matrix/reports/session-status.tsv`
- Accepted README snapshots:
  `/private/tmp/aiworker-hr-native-skill-debug-20260517-114309-matrix/reports/profile-alpha-after.md`
  and
  `/private/tmp/aiworker-hr-native-skill-debug-20260517-114309-matrix/reports/profile-gamma-after-t3.md`
- Promotion responses:
  `/private/tmp/aiworker-hr-native-skill-debug-20260517-114309-matrix/json/promote-alpha-response.json`
  and
  `/private/tmp/aiworker-hr-native-skill-debug-20260517-114309-matrix/json/promote-gamma-t3-response.json`
