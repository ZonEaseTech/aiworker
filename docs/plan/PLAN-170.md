# PLAN-170 Native executor skill projection lifecycle

- **status**: completed
- **createdAt**: 2026-05-08 18:10
- **approvedAt**: 2026-05-08 18:10
- **completedAt**: 2026-05-08 18:27
- **relatedTask**: REFACTOR-025

## Current State

Native executor skill placement is now the intended Project Brain boundary:
AIWorker should write skill files where Codex and Claude Code load project
skills natively, while `.aiworker/` remains governance, memory, state, and
evidence.

The implementation after PLAN-169 still has a production gap. It seeds files to
native directories, but it does not preserve enough state to answer:

- Which native files are AIWorker-managed versus user-owned?
- Which built-in skill version/hash produced this file?
- Is a file missing, stale, drifted, deprecated, or orphaned?
- Can an operator preview the reconciliation before applying it?

Without that lifecycle, developers may keep adding ad hoc copy behavior around
native skills. That would recreate the heavy Brain layer in a different shape.

## Proposal

Implement native skill projection as a thin managed-copy lifecycle:

1. Use stable managed slugs:
   - `kernel.brain-admission` -> `aiworker-kernel-brain-admission`
   - `developer.codebase-orientation` ->
     `aiworker-developer-codebase-orientation`
2. Record projection evidence in
   `.aiworker/native-skill-projections.json`.
3. Add a planner that compares desired Project Brain skill packs, manifest
   records, and executor-native files.
4. Support dry-run and apply modes:
   - create missing managed files;
   - update files only when their current hash still matches the last applied
     hash;
   - mark drift when operator edits are detected;
   - deprecate managed files no longer desired by removing them from native
     `SKILL.md` discovery while keeping evidence;
   - report orphaned `aiworker-*` native files that are outside the manifest.
5. Surface the same lifecycle summary through doctor and Brain CLI commands.
6. Keep unsupported engines on explicit fallback behavior; do not add another
   runtime skill selector.

## Risks

- Drift detection must be conservative. A managed file that differs from the
  last applied hash must not be overwritten automatically.
- Manifest writes must stay project-local and readable; do not hide lifecycle
  state in worker DB only.
- Admission-generated skills need metadata even though they are not built-in
  packs.
- Docs must be clear that `aiworker-*` is the managed namespace. Other native
  skills belong to the executor/user.

## Scope

- `packages/fs-layout`: managed slug/path helpers, manifest read/write helpers,
  and init seed support.
- `apps/cli`: native projection sync planner, `brain skills sync-native`,
  doctor/status reporting, tests.
- `packages/core`: admission materialization target path and manifest update.
- `docs/architecture.md`, `docs/cli.md`, README files, governance status, and
  changelog.

## Verification

- Focused fs-layout tests for slug/path/manifest behavior.
- Focused CLI init tests for managed slug and manifest creation.
- Focused CLI brain/doctor tests for lifecycle reporting.
- Focused core admission tests for managed native target paths.
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`

## Progress

- 2026-05-08 18:10: Plan opened and approved from the active goal. Next step is
  implementing shared projection helpers before rewiring CLI and admission.
- 2026-05-08 18:27: Implementation completed. The projection lifecycle now has
  managed slugs, manifest evidence, sync dry-run/apply, drift protection,
  deprecation/removal/orphan reporting, and doctor/brain CLI visibility.

## Result

Completed. Native executor skill projection is now a managed-copy lifecycle
instead of a one-shot seed:

- AIWorker-owned native skill dirs use `aiworker-*` slugs.
- `.aiworker/native-skill-projections.json` records source hash/version,
  target path, last applied hash, status, and tombstones.
- `aiworker brain skills sync-native` previews or applies reconciliation.
- Clean managed files update automatically; drifted operator edits are reported
  and preserved.
- Admission-generated skills remain managed projections and are not
  accidentally deprecated just because they are not built-in Soul seeds.
- Doctor, `brain status`, and `brain skills` expose lifecycle health.

Validation passed:

- `bun run --filter '@zonease/aiworker-fs-layout' test src/index.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/native-skill-projections.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/worker/brain/admission/service.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/init.integration.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/doctor.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/capabilities/validation.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
