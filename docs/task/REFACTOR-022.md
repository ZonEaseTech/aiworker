# REFACTOR-022 Brain Skill admission materializer

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-07 11:12
- **claimedAt**: 2026-05-07 11:12
- **completedAt**: 2026-05-07 11:19
- **plan**: PLAN-155
- **sourceObjective**: Move Brain self-iteration beyond memory-only by safely
  materializing approved `brain-skill-add` proposals into file-first Project
  Brain skills.
- **relatesTo**: REFACTOR-018, REFACTOR-020, REFACTOR-021, PLAN-151,
  PLAN-153, PLAN-154, docs/architecture.md, docs/governance-node-status.md

## Context

Project Brain skills are now file-first `SKILL.md` assets and runtime can load
selected skill bodies. However, Brain admission still materializes only
`memory-add`; approved `brain-skill-add` proposals remain unsupported. That
blocks the self-iteration loop from producing maintainable OD-style Brain
skill files through the governed admission path.

## Scope

- Add a `brainAdmissionSkillAddPayloadSchema`.
- Include `brain-skill-add` in materialized proposal kinds.
- Implement dry-run and commit materialization to
  `.aiworker/skills/<skillId>/SKILL.md`.
- Require valid SKILL.md frontmatter and id match before writing.
- Reuse existing secret body policy (`block` / `redact` / `raw`).
- Default to no overwrite; allow explicit overwrite via payload.
- Update tests, architecture/status docs, and PMA/changelog.

## Out of Scope

- No automatic policy-update materializer.
- No executor-native skill/plugin installation.
- No LLM autonomous approval.
- No gateway/fleet/Web UI changes.

## Acceptance Criteria

1. Approved `brain-skill-add` dry-run reports the target skill path and diff
   without writing filesystem state.
2. Approved `brain-skill-add` commit writes a valid `SKILL.md`, flips proposal
   to `applied`, and records an applied decision.
3. Invalid frontmatter, id mismatch, existing target without overwrite, or
   secret-bearing body under default policy do not write filesystem state.
4. `policy-update` remains unsupported and truthfully reported.
5. Focused shared/core tests and production gates pass.

## Notes

- 2026-05-07 11:12: Task opened after runtime context loading was completed;
  self-iteration materialization is the next production-readiness gap.
- 2026-05-07 11:19: Completed. Approved `brain-skill-add` proposals now
  materialize governed file-first Brain Skills under
  `.aiworker/skills/<skillId>/SKILL.md`, with SKILL.md frontmatter/id
  validation, no-overwrite-by-default behavior, and secret body policy reuse.

## Validation

- 2026-05-07 11:15:
  `bun run --filter '@zonease/aiworker-shared' test src/brain/admission.test.ts`
  passed.
- 2026-05-07 11:15:
  `bun run --filter '@zonease/aiworker-core' test src/worker/brain/admission/service.test.ts`
  passed.
- 2026-05-07 11:15:
  `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/brain-admission.test.ts`
  passed.
- 2026-05-07 11:16: `bun run check` passed.
- 2026-05-07 11:18: `bun run test` passed.
- 2026-05-07 11:19: `bun run build` passed.
- 2026-05-07 11:19: `git diff --check` passed.
