# REFACTOR-020 Runtime Brain Skill body loading

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-07 10:52
- **claimedAt**: 2026-05-07 10:52
- **completedAt**: 2026-05-07 11:04
- **plan**: PLAN-153
- **sourceObjective**: Move Brain skills from metadata-only prompt hints to
  real runtime context by loading selected `SKILL.md` bodies when the
  orchestrator requires skill context, without turning AIWorker into an
  executor-native skill/plugin platform.
- **relatesTo**: REFACTOR-018, REFACTOR-019, PLAN-151, PLAN-152,
  docs/architecture.md, docs/governance-node-status.md

## Context

REFACTOR-019 confirmed that the current Project Brain direction is mostly
implemented, but `load_skill` remains a truthfulness gap: runtime lists brain
skill names/descriptions and emits capability decisions, while the executor
does not receive the selected `SKILL.md` body.

For production readiness, Brain skills must become executable context in the
AIWorker sense: not executor-native plugins, but canonical Project Brain
instructions loaded into the turn context under budget and provenance limits.

## Scope

- Add an optional `BrainProvider.loadSkill(id)` contract.
- Implement filesystem skill body loading from scanned `SKILL.md` entrypoints.
- Delegate `loadSkill` through `MultiBrainProvider`.
- Update orchestrator context assembly so selected skills are loaded when
  `skill_load` is required and injected into the system prompt.
- Make capability decision events report loaded skill ids/count/errors.
- Add focused tests for filesystem loading and orchestrator prompt injection.
- Update architecture/governance docs to remove the metadata-only residual
  once implemented.

## Out of Scope

- No executor-native skill/plugin/MCP installation.
- No model tool-calling implementation for `load_skill`.
- No admission materializer expansion for `brain-skill-add` or
  `policy-update`.
- No gateway/fleet changes.
- No Web UI work.

## Acceptance Criteria

1. A filesystem Brain skill can be loaded by stable skill id and returns body
   content with frontmatter stripped.
2. When intent requires `skill_load`, the orchestrator injects selected skill
   bodies into the system prompt before calling the executor.
3. Capability decision events truthfully expose loaded skill ids/count and any
   load errors.
4. Existing answer turns without `skill_load` keep the current lightweight
   skill summary behavior.
5. Focused core/shared tests and `git diff --check` pass.

## Notes

- 2026-05-07 10:52: Task opened after REFACTOR-019 identified skill body
  loading as the first production-readiness gap.
- 2026-05-07 11:04: Completed. Runtime now loads selected Brain Skill bodies
  from filesystem/Multi providers, appends bounded `SKILL.md` bodies to the
  executor system prompt when `load_skill` is selected, and emits loaded skill
  ids/count/errors in capability decision telemetry. CLI doctor tests were
  updated to reflect that fresh `init --soul` projects now seed default brain
  skills and are no longer sparse.

## Validation

- 2026-05-07 10:56:
  `bun run --filter '@zonease/aiworker-core' test src/worker/brain/providers/filesystem src/worker/orchestrator/service.history.test.ts`
  passed.
- 2026-05-07 10:56:
  `bun run --filter '@zonease/aiworker-shared' test src/brain/skill-pack.test.ts src/brain/admission.test.ts`
  passed.
- 2026-05-07 10:57:
  `bun run --filter '@zonease/aiworker-core' typecheck` passed.
- 2026-05-07 10:57:
  `bun run --filter '@zonease/aiworker-shared' typecheck` passed.
- 2026-05-07 10:58: `bun run typecheck` passed.
- 2026-05-07 10:59: `bun run lint` passed.
- 2026-05-07 11:00:
  `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/doctor.test.ts`
  passed after updating the stale fresh-init assertion.
- 2026-05-07 11:04: `bun run test` passed.
- 2026-05-07 11:04: `bun run build` passed.
- 2026-05-07 11:04: `bun run check` passed.
