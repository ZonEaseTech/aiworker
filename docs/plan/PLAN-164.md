# PLAN-164 Simplify Project Brain filesystem layout

- **status**: completed
- **createdAt**: 2026-05-07 23:57
- **approvedAt**: 2026-05-07 23:57
- **completedAt**: 2026-05-08 00:16
- **relatedTask**: REFACTOR-023

## Current State

Project-scope `.aiworker/` currently seeds both `SOUL.md` and `AGENT.md`, then
splits Brain capability declarations across `toolsets.json`,
`capability-packs.json`, and brain/runtime `mcp.json`. Runtime and CLI
consumers read those paths directly, so deleting one file in isolation would
break project detection, doctor, up validation, and capability planning.

## Proposal

Make one coordinated breaking pre-1.0 layout change:

1. Treat `SOUL.md` as the sole editable identity/persona document for
   project-scope workers.
2. Introduce `brain-capabilities.json` as the single machine-readable Brain
   capability manifest containing default toolsets, capability packs, and
   Brain MCP descriptors.
3. Rewire fs-layout, init preflight, capability validation, orchestrator
   capability registry, brain brief compiler, scope/status commands, tests,
   and docs to the new paths.
4. Keep `policy.json`, `scope.json`, `executor-capabilities.json`, `skills/`,
   `memories/`, and `local/` separate because they represent distinct
   governance, executor, file-skill, memory, or private runtime boundaries.

## Risks

- Existing local pre-1.0 projects with old files will need re-init or manual
  conversion; this is accepted before 1.0.0.
- Some historical docs and completed PMA files will still mention old files;
  current architecture/CLI docs must become the source of truth.
- Tests that asserted old bootstrap files need intentional updates rather than
  compatibility shims.

## Scope

- `packages/fs-layout`
- `packages/shared` capability schemas
- `packages/core` prompt/brief/capability readers
- `apps/cli` init, doctor, up, scope, brain status, soul help, validation
- Current docs: architecture, CLI, README/AGENTS boundary references as needed
- Focused tests for the changed surfaces

## Alternatives

- Keep old files and only document a preferred editing style. Rejected because
  the filesystem still teaches the wrong product boundary.
- Add compatibility lookup for both old and new files. Rejected because 1.0.0
  has not shipped and aliases would keep stale concepts alive.

## Verification

- Focused tests for shared capability schemas, fs-layout, CLI validation/init,
  doctor/up/scope, core capability registry, context/brief projection.
- `bun run typecheck`
- `bun run lint`
- `bun run test` or focused fallbacks if the full gate is blocked.

## Progress

- 2026-05-07 23:57: Plan opened as approved/implementing from the user's
  explicit direction to apply the simplification carefully across linked
  consumers.
- 2026-05-08 00:16: Implementation complete. Project Brain capability
  declarations now flow through `brain-capabilities.json`; project `AGENT.md`,
  `toolsets.json`, `capability-packs.json`, and Brain `mcp.json` are no longer
  seeded or read by current project-scope runtime paths.
