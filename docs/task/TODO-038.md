# TODO-038 Harness — brain-skill-add admission roundtrip evidence

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-07 11:21
- **claimedAt**: 2026-05-07 11:21
- **completedAt**: 2026-05-07 11:34
- **plan**: PLAN-156
- **sourceObjective**: Extend the repeatable governance harness so production
  evidence covers approved `brain-skill-add` proposals, not only memory
  materialization.
- **relatesTo**: REFACTOR-022, PLAN-155, QA-011, QA-012,
  scripts/governance-kernel-harness.ts

## Context

REFACTOR-022 implemented the governed `brain-skill-add` materializer and unit /
CLI coverage. The remaining production-readiness gap is black-box evidence:
the governance harness still proves `memory-add` roundtrips, reject, and
secret-scan-block paths, but does not verify that a real initialized worker can
approve/apply a Brain Skill proposal and materialize a valid `SKILL.md`.

## Scope

- Add a deterministic `brain-skill-add` fixture to
  `scripts/governance-kernel-harness.ts`.
- Propose, approve, and apply the skill fixture through `aiworker brain
  admission`.
- Verify the canonical `.aiworker/skills/<skillId>/SKILL.md` file exists and
  contains the expected frontmatter/body.
- Verify proposal DB status and decision rows move through
  `approved → applied`.
- Record source-local compact run evidence in a QA task.

## Out of Scope

- No new Brain materializer semantics.
- No `policy-update` materializer.
- No executor-native skill/plugin installation.
- No gateway/fleet/Web UI changes.

## Acceptance Criteria

1. Compact governance harness reports passing `brain-skill-add` roundtrip
   checks for both default compact pairs when executors are available.
2. The checks are backed by command logs, worker.db queries, and filesystem
   assertions.
3. Existing memory-add, reject, secret-scan-block, REST, continuity, and
   decision-truthfulness checks continue to pass.
4. PMA docs, governance status, and changelog describe the new evidence.

## Notes

- 2026-05-07 11:21: Task opened after REFACTOR-022 completed the materializer;
  this slice upgrades proof depth from focused tests to black-box harness
  evidence.
- 2026-05-07 11:34: Completed. Compact source-local governance harness now
  verifies `brain-skill-add` propose / approve / apply, canonical SKILL.md
  materialization, DB transitions, and post-apply `aiworker doctor` acceptance.

## Validation

- 2026-05-07 11:22: `bun scripts/governance-kernel-harness.ts --help`
  passed.
- 2026-05-07 11:22: `bun run check` passed.
- 2026-05-07 11:23: `git diff --check` passed.
- 2026-05-07 11:34:
  `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts --mode worker-source-local --matrix compact --debug-root /Users/ben/projects/aiworker/tmp/governance-brain-skill-20260507-1123 --port-base 19830 --timeout-ms 240000`
  passed with 80 PASS / 0 FAIL / 0 SKIPPED; see QA-018.
- 2026-05-07 11:35: `bun run test` passed.
- 2026-05-07 11:35: `bun run build` passed.
- 2026-05-07 11:36: `git diff --check` passed.
