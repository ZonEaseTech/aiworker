# REFACTOR-025 Native executor skill projection lifecycle

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-08 18:10
- **claimedAt**: 2026-05-08 18:10
- **completedAt**: 2026-05-08 18:27
- **plan**: PLAN-170
- **sourceObjective**: Make AIWorker-managed native executor skill projection
  production-grade: managed slugs, manifest state, dry-run/apply sync,
  update/deprecate/remove/drift/orphan reporting, and aligned diagnostics.
- **relatesTo**: REFACTOR-018, REFACTOR-022, REFACTOR-024,
  docs/architecture.md, docs/cli.md

## Context

REFACTOR-024 moved Project Brain skills out of `.aiworker/skills/` and into
executor-native project skill directories. That fixed the architectural
boundary, but the first implementation is still a one-time seed:

- projected skill directory names reuse internal Brain ids directly;
- there is no manifest proving which native files are AIWorker-managed;
- update, drift, deprecation, and orphan states are not first-class;
- doctor and `brain skills` can count files but cannot explain lifecycle
  health.

The next step is to make the native projection explicit enough for production
operators: AIWorker owns files with an `aiworker-*` managed prefix, records its
intent in Project Brain, and can reconcile the native executor directories
without becoming a skill runtime.

## Scope

- Add managed `aiworker-*` slugs for all AIWorker-projected native skills.
- Add `.aiworker/native-skill-projections.json` as the Project Brain manifest
  for source hash/version, target path, engine, status, and tombstone evidence.
- Add dry-run/apply sync behavior for create, update, missing, drift,
  deprecated, removed, and orphaned projection states.
- Rewire `init`, `brain-skill-add`, doctor, `brain status`, and `brain skills`
  to use and report the lifecycle.
- Update docs and focused tests so developers do not continue extending the
  older one-shot copy model.

## Out of Scope

- No gateway or fleet behavior changes.
- No executor-native MCP/plugin redesign.
- No AIWorker runtime skill selector.
- No legacy compatibility for unpublished pre-1.0 native skill paths without
  the `aiworker-*` prefix.
- No deletion of user-owned executor-native skills outside the managed prefix.

## Acceptance Criteria

1. Built-in Project Brain skill projections use stable `aiworker-*` directory
   names under `.agents/skills/` and `.claude/skills/`.
2. Project init writes a manifest at
   `.aiworker/native-skill-projections.json`.
3. A dry-run sync reports create/update/missing/drift/deprecate/remove/orphan
   operations without writing files.
4. An apply sync safely creates or updates managed files, records manifest
   state, and refuses to overwrite drifted user edits silently.
5. Deprecated managed skills are removed from executor-native discovery without
   erasing evidence.
6. Doctor and `brain skills` expose missing, outdated, drifted, deprecated,
   removed, and orphaned states.
7. Approved `brain-skill-add` proposals materialize to managed native skill
   paths and update projection metadata.
8. Tests and docs align with the new lifecycle model.

## Notes

- 2026-05-08 18:10: Claimed as the continuation of the native skill placement
  decision. The current code has the right direction but lacks lifecycle
  semantics, which would leave production operators with silent stale copies.
- 2026-05-08 18:27: Completed implementation. Native projections now use
  `aiworker-*` managed slugs, write `.aiworker/native-skill-projections.json`,
  support dry-run/apply sync, preserve admission-managed generated skills, and
  surface lifecycle status through doctor / brain status / brain skills.

## Validation

Completed validation:

1. `bun run --filter '@zonease/aiworker-fs-layout' test src/index.test.ts`
2. `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/native-skill-projections.test.ts`
3. `bun run --filter '@zonease/aiworker-core' test src/worker/brain/admission/service.test.ts`
4. `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/init.integration.test.ts`
5. `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/doctor.test.ts`
6. `bun run --filter '@zonease/aiworker-cli' test src/capabilities/validation.test.ts`
7. `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
8. `bun run typecheck`
9. `bun run lint`
10. `bun run test`
11. `bun run build`
12. `git diff --check`
