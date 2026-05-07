# PLAN-155 Brain Skill admission materializer

- **status**: completed
- **createdAt**: 2026-05-07 11:12
- **approvedAt**: 2026-05-07 11:12
- **completedAt**: 2026-05-07 11:19
- **relatedTask**: REFACTOR-022

## Current State

1. Built-in Soul schema packs declare `brain-skill-add` as a valid proposal
   type.
2. Project Brain skill authoring and runtime loading are already file-first
   through `.aiworker/skills/<id>/SKILL.md`.
3. `BrainAdmissionService.apply()` only materializes `memory-add`; other kinds
   become unsupported/failed on commit.
4. This leaves Brain self-iteration memory-first rather than skill-capable.

## Proposal

1. Add a structured `brainAdmissionSkillAddPayloadSchema` with `skillId`,
   `body`, and optional `overwrite`.
2. Expand `MATERIALIZED_PROPOSAL_KINDS` to include `brain-skill-add`.
3. Implement a separate skill materializer path that validates SKILL.md
   frontmatter, requires declared id to match `skillId`, scans body for
   secrets, and writes to `skills/<skillId>/SKILL.md`.
4. Keep no-overwrite as the default to protect operator-edited files.
5. Leave `policy-update` unsupported until a separate policy-specific plan can
   define JSON merge/validation semantics.

## Risks

1. Bad generated SKILL.md could poison runtime context. Mitigation: validate
   required frontmatter and id match before write.
2. Overwriting operator edits. Mitigation: no overwrite unless payload opts in.
3. Secret leakage through generated instructions. Mitigation: reuse existing
   secret scan policy before writing.

## Scope

- `packages/shared/src/brain/admission.ts`
- `packages/shared/src/brain/admission.test.ts`
- `packages/core/src/worker/brain/admission/service.ts`
- `packages/core/src/worker/brain/admission/service.test.ts`
- `apps/cli/src/commands/worker/brain-admission.test.ts` if CLI behavior
  expectations need updating
- architecture/status/changelog/PMA docs

## Non-Scope

- `policy-update` materializer.
- Executor-native skill/plugin/MCP install.
- Autonomous approval.
- Fleet/gateway/Web UI changes.

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

## Progress

- 2026-05-07 11:12: Investigation completed and implementation started under
  the user-approved production-readiness direction.
- 2026-05-07 11:19: Implemented and validated. Brain self-iteration can now
  propose durable file-first Brain Skills through admission; policy mutation is
  intentionally still a separate governed materializer problem.
