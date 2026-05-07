# PLAN-153 Runtime Brain Skill body loading

- **status**: completed
- **createdAt**: 2026-05-07 10:52
- **approvedAt**: 2026-05-07 10:52
- **completedAt**: 2026-05-07 11:04
- **relatedTask**: REFACTOR-020

## Current State

1. Project Brain skills are now file-first packs under
   `.aiworker/skills/<id>/SKILL.md`.
2. `FilesystemBrainProvider.listSkills()` returns stable ids and summaries,
   but not the full skill body.
3. `CapabilityRegistry` advertises `load_skill`, yet the orchestrator has no
   implementation that loads selected skill bodies into the prompt.
4. `REFACTOR-019` documents this as the most important residual gap on the
   path to production readiness.

## Proposal

1. Extend the shared `BrainProvider` contract with optional `loadSkill(id)`.
   The result should include a summary plus frontmatter-stripped Markdown body.
2. Implement `loadSkill` in the filesystem provider by reusing the scanner so
   ids stay scan-derived and path traversal is not possible.
3. Implement `loadSkill` in `MultiBrainProvider` by trying sources in priority
   order and returning the first hit.
4. Add `ContextManager.loadSkillBodies()` and append a bounded
   `Loaded brain skill bodies` section to the system prompt when the
   capability plan selected `load_skill`.
5. Extend capability decision payloads with loaded skill ids/count/load errors
   so observability matches actual behavior.
6. Update docs and focused tests.

## Risks

1. Prompt bloat if many skills load at once. Mitigation: reuse selected skill
   limit and cap individual skill body size.
2. False production claim if load failures are swallowed. Mitigation: expose
   load errors in capability decisions and keep summaries visible.
3. Multi-source ambiguity. Mitigation: priority-order first hit, matching
   existing `MultiBrainProvider` read semantics.

## Scope

- `packages/shared/src/providers/brain.ts`
- `packages/core/src/worker/brain/providers/filesystem/*`
- `packages/core/src/worker/brain/providers/multi.ts`
- `packages/core/src/worker/orchestrator/context-manager.ts`
- `packages/core/src/worker/orchestrator/service.ts`
- `packages/core/src/worker/orchestrator/decisions.ts`
- focused tests and architecture/status/changelog/PMA docs

## Non-Scope

- Executor-native skill/plugin/MCP projection.
- Admission materializer for `brain-skill-add`.
- Fleet/gateway/Web UI changes.

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
  passed.
- 2026-05-07 11:04: `bun run test` passed.
- 2026-05-07 11:04: `bun run build` passed.
- 2026-05-07 11:04: `bun run check` passed.

## Progress

- 2026-05-07 10:52: Investigation completed and implementation started under
  the user-approved production-readiness direction.
- 2026-05-07 11:04: Implemented and validated. `load_skill` is now an
  enforced runtime path when selected skills are loaded; `memory_search`
  remains the next observe-only capability to close.
