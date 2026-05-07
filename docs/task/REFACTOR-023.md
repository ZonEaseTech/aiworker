# REFACTOR-023 Simplify Project Brain filesystem layout

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-07 23:57
- **claimedAt**: 2026-05-07 23:57
- **completedAt**: 2026-05-08 00:16
- **plan**: PLAN-164
- **sourceObjective**: Reduce project-scope `.aiworker/` bootstrap surface
  while preserving runtime, validation, and executor boundary behavior.
- **relatesTo**: REFACTOR-016, REFACTOR-018, REFACTOR-020, REFACTOR-021,
  REFACTOR-022, docs/architecture.md, docs/cli.md

## Context

Project Brain is now file-first and skill-oriented, but project init still
materializes early split files: `AGENT.md`, `toolsets.json`,
`capability-packs.json`, and brain/runtime `mcp.json`. These files duplicate
the editable Soul surface or scatter one Brain capability manifest across
multiple JSON files. This makes `.aiworker/` look heavier than the intended
Open Design-inspired authoring model.

## Scope

- Collapse project-scope identity to `SOUL.md`, `USER.md`, `MEMORY.md`, and
  `ROLLUP.md`; stop seeding project `AGENT.md`.
- Collapse project-scope Brain capability drafts into
  `brain-capabilities.json`.
- Keep `policy.json`, `scope.json`, `executor-capabilities.json`, `skills/`,
  `memories/`, and `local/` as separate boundaries.
- Update runtime readers, doctor/up validation, CLI scope/status output,
  architecture/CLI docs, and focused tests.

## Out of Scope

- No executor overlay redesign.
- No fleet/gateway changes.
- No legacy migration or alias layer for old pre-1.0 project files.
- No user-scope layout cleanup beyond keeping existing behavior compiling.

## Acceptance Criteria

1. `aiworker init --soul <preset>` creates
   `.aiworker/brain-capabilities.json` and no project `AGENT.md`,
   `toolsets.json`, `capability-packs.json`, or brain/runtime `mcp.json`.
2. Orchestrator capability registry reads default toolsets and MCP descriptors
   from `brain-capabilities.json`.
3. Brain brief and system prompt composition no longer require project
   `AGENT.md`.
4. `aiworker doctor`, `aiworker up`, `aiworker scope`, `aiworker brain status`,
   and docs describe the new layout consistently.
5. Focused fs-layout, shared capability, CLI validation/init/doctor, and core
   capability/brief tests pass, plus repo quality gates where practical.

## Notes

- 2026-05-07 23:57: Task opened and claimed after impact scan found linked
  consumers in fs-layout, init, doctor/up validation, context manager, brief
  compiler, scope/status commands, and tests.
- 2026-05-08 00:16: Completed the coordinated layout simplification. Project
  scope now seeds `SOUL.md` plus `brain-capabilities.json`, while executor
  overlay remains isolated in `executor-capabilities.json`.

## Validation

- `bun run --filter '@zonease/aiworker-shared' test src/capabilities.test.ts src/soul/pack.test.ts src/soul/module.test.ts src/soul/presets.test.ts src/brain/brief.test.ts`
- `bun run --filter '@zonease/aiworker-fs-layout' test src/index.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/worker/orchestrator/capabilities.test.ts src/worker/brain/brief/compiler.test.ts src/worker/orchestrator/service.history.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/capabilities/validation.test.ts src/commands/worker/doctor.test.ts src/commands/worker/init.integration.test.ts src/commands/worker/executor.test.ts src/commands/worker/up.test.ts src/commands/worker/up.integration.test.ts src/commands/worker/brain-brief.test.ts src/soul/presets.test.ts`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
