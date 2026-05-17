# PLAN-346 HR native skill closure follow-up regression debug

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-17 13:13
- **approvedAt**: 2026-05-17 13:13
- **completedAt**: 2026-05-17
- **relatedTask**: QA-036

## Context

`PLAN-345` closed three concrete follow-ups from the first real Codex campaign:

- failed-turn artifact recovery,
- first-class HR native skill artifact kinds,
- capability prompt/review materialization for external engines.

Those changes passed focused automated tests, but they need another real
end-to-end campaign because the previous failure modes appeared only when real
Codex sessions, projected workspaces, product prompt assets, artifact files,
review records, and `README.md` promotion were exercised together.

## Proposal

1. Create an isolated debug root under `/private/tmp` with `AIWORKER_HOME` and
   `WORKER_DB_PATH` scoped to that root while preserving real `HOME`.
2. Use the source checkout CLI so the latest unreleased changes are under test.
3. Install and enable the local HR Soul App manifest, create a fresh HR worker,
   and create at least three workspaces:
   - a profile workspace for profile update proposal and promotion,
   - a candidate workspace for interview brief and hiring risk,
   - a role-search workspace for evidence matrix.
4. Run real Codex-backed sessions with at least two turns on multiple
   workspaces. Capture JSON, artifacts, session context files, and README
   snapshots.
5. Start the daemon only when needed for REST profile promotion or API-level
   inspection.
6. Exercise deterministic failed-turn recovery if no natural real Codex failure
   appears during the campaign.
7. If new issues are found, follow systematic debugging: reproduce, identify
   root cause, then either fix with tests or record as PMA follow-up.
8. Close with a sanitized report, PMA/changelog updates, validation commands,
   code-review-graph when code changes, and a commit.

## Scope

- Real debug evidence under `/private/tmp`.
- PMA task/plan/changelog updates.
- Code or app asset changes only for reproduced root-cause fixes.

## Risks

- Real Codex can be slow or nondeterministic. Capture raw outputs and use
  bounded turns.
- Human-profile promotion must not happen just because an artifact exists.
  Promotion requires a coherent `aiworker-profile-readme` draft and review
  verdict.
- Failed-turn recovery must keep failed status visible even when artifacts are
  recoverable.

## Verification

- Real session matrix evidence exists under the debug root.
- Generated artifact kinds match the selected first-class capability output
  kinds.
- Session context includes materialized app-authored prompt/review content.
- At least one README promotion is verified or explicitly blocked by review
  evidence.
- Focused automated gates pass for any changed code.

## Outcome

Completed the follow-up real Codex regression campaign under
`/private/tmp/aiworker-hr-regression-20260517-131444`.

- Fixed `BUG-130` by routing first-turn `session start` metadata through
  HostRuntime capability enrichment.
- Fixed `TODO-045` by clarifying embedded capability asset source refs for
  external engines.
- Fixed `BUG-131` by tightening HR profile proposal prompt/skill/review text so
  promotable README drafts represent accepted post-approval state.
- Created real Codex artifacts for `evidence-matrix`, `interview-brief`,
  `hiring-risk`, and `profile-update-proposal`.
- Verified multi-turn continuation in role-search, candidate, and profile
  workspaces.
- Promoted corrected profile proposal artifact
  `95e7aaeb-35a9-43cb-a411-3ea4459072b6` into the accepted profile README via
  product runtime promotion.
- Verified deterministic failed-turn recovery: a fake Codex command wrote an
  artifact and exited non-zero; AIWorker recovered the artifact and review while
  preserving failed session/turn/invocation status.

## Evidence

- Debug report:
  `/private/tmp/aiworker-hr-regression-20260517-131444/reports/qa-036-summary.md`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts src/worker/executor.test.ts src/host/runtime.test.ts src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run lint`
