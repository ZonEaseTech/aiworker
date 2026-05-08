# REFACTOR-024 Native executor skill placement for Project Brain skills

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-08 17:30
- **claimedAt**: 2026-05-08 17:30
- **completedAt**: 2026-05-08 17:53
- **plan**: PLAN-169
- **sourceObjective**: Move AIWorker default skill materialization toward
  executor-native project skill directories so supported engines load skills
  through their own native mechanisms instead of AIWorker reimplementing a
  prompt-skill runtime.
- **relatesTo**: REFACTOR-018, REFACTOR-020, REFACTOR-022, REFACTOR-023,
  docs/architecture.md, docs/cli.md

## Context

Project Brain skills currently seed into `.aiworker/skills/<id>/SKILL.md`.
The runtime scans that directory, lists skill summaries in the system prompt,
loads selected bodies through `skill_load`, and injects them into the task
executor context. That made the Brain layer heavier than the current
native-first strategy.

The intended product boundary is now:

- Executor-native project skills belong in the executor's own project
  directory, such as `.agents/skills/` for Codex and `.claude/skills/` for
  Claude Code.
- `.aiworker/` remains the Project Brain governance and worker-state boundary:
  Soul, user profile, memory, rollup, policy, scope, admission, audit, local
  worker state, and executor overlay hints.
- AIWorker should not create a second skill selector or executor skill runtime
  when the selected executor can already discover and load project skills
  natively.

## Scope

- Change project init so default kernel and Soul skills are seeded to
  executor-native project skill directories for supported engines.
- Remove default `.aiworker/skills/` seeding from project-scope init.
- Rewire doctor/up validation, CLI output, README, CLI docs, and architecture
  docs so they describe native executor skills as the default path.
- Keep Brain admission governance for generated skill changes, but materialize
  approved `brain-skill-add` proposals to the configured native skill target
  when supported.
- Keep a fallback path for engines without native project skills, but make it
  explicit and secondary.

## Out of Scope

- No executor-native MCP/plugin redesign.
- No fleet/gateway behavior changes.
- No compatibility alias for pre-1.0 `.aiworker/skills` project layouts.
- No runtime skill selector or LLM selector.
- No migration of user-owned `.agents/skills` or `.claude/skills` files into
  Project Brain.

## Acceptance Criteria

1. `aiworker init --soul <preset>` no longer creates project
   `.aiworker/skills/` as the primary skill surface.
2. Codex-targeted init writes default AIWorker skills to `.agents/skills/*/SKILL.md`.
3. Claude Code-targeted init writes default AIWorker skills to
   `.claude/skills/*/SKILL.md`.
4. Existing executor-native skill files are never overwritten silently.
5. Orchestrator no longer loads `.aiworker/skills` into task prompts by default
   for supported native-skill engines.
6. Doctor/up validation reports native skill placement and flags conflicts or
   stale fallback use clearly.
7. Brain admission `brain-skill-add` apply writes to the correct native skill
   directory for the configured executor path, with rollback/audit evidence.
8. Current architecture, CLI docs, and README describe `.aiworker` as
   governance/memory/state, while executor project directories hold native
   execution skills.

## Notes

- 2026-05-08 17:30: Opened after tracing current seed/runtime/admission/doc
  coupling. Existing code still has broad `.aiworker/skills` assumptions in
  fs-layout, init, doctor validation, Brain provider scanning, orchestrator
  context injection, admission materializer, CLI docs, architecture docs, and
  tests.
- 2026-05-08 17:30: Claimed for long-task implementation. Because `init` does
  not currently choose the task executor before materialization, the first
  implementation will seed supported native project skill directories
  (`.agents/skills` and `.claude/skills`) with conservative no-overwrite
  guards instead of requiring a new init-time executor selection flow.
- 2026-05-08 17:53: Completed implementation. Project init now seeds native
  executor skill directories, supported native-skill engines no longer receive
  fallback `.aiworker/skills` prompt injection, admission apply writes
  project-scope skills to native targets, and doctor/brain/docs distinguish
  native executor skills from fallback Brain prompt skills.

## Validation

Completed validation:

1. `bun run --filter '@zonease/aiworker-fs-layout' test src/index.test.ts`
2. `bun run --filter '@zonease/aiworker-cli' test src/capabilities/validation.test.ts`
3. `bun run --filter '@zonease/aiworker-core' test src/worker/brain/admission/service.test.ts`
4. `bun run --filter '@zonease/aiworker-core' test src/worker/orchestrator/service.history.test.ts`
5. `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/init.integration.test.ts`
6. `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/doctor.test.ts`
7. `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/brain-admission.test.ts`
8. `bun run typecheck`
9. `bun run lint`
10. `bun run test`
11. `bun run build`
12. `git diff --check`
