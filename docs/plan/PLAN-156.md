# PLAN-156 Harness brain-skill-add admission roundtrip evidence

- **status**: completed
- **createdAt**: 2026-05-07 11:21
- **approvedAt**: 2026-05-07 11:21
- **completedAt**: 2026-05-07 11:34
- **relatedTask**: TODO-038

## Current State

1. The governance harness already validates `memory-add` positive roundtrip,
   reject path, secret-scan-block path, conversation continuity, decision
   truthfulness, REST auth, and serve restart behavior.
2. `brain-skill-add` now has focused shared/core/CLI tests, but no black-box
   harness coverage.
3. `docs/governance-node-status.md` can truthfully say the materializer exists,
   but production evidence still depends on focused tests rather than the
   recurring harness.

## Proposal

1. Add a `brain-skill-add` fixture writer that emits payload JSON with
   `skillId` and full valid `SKILL.md` source.
2. Reuse the same admission CLI path as memory roundtrip:
   `propose → approve → apply --commit`.
3. Add checks for apply outcome, canonical file content, and DB transitions.
4. Run compact `worker-source-local` governance harness and record the
   resulting evidence under QA.
5. Update architecture/status/changelog/PMA to include the new recurring proof.

## Risks

1. Harness duration grows. Mitigation: add only one deterministic skill
   roundtrip per pair and keep compact matrix as the routine default.
2. ID/path drift. Mitigation: assert exact `skillId`, target path, frontmatter,
   and body marker.
3. Scope confusion with executor skills. Mitigation: all labels use
   `brain-skill-add` and `.aiworker/skills/.../SKILL.md`; no executor-native
   skill/plugin install is performed.

## Scope

- `scripts/governance-kernel-harness.ts`
- `docs/task/TODO-038.md`
- QA evidence task
- `docs/governance-node-status.md`
- `docs/changelog.md`
- PMA indexes

## Non-Scope

- Policy materialization.
- Executor capability projection.
- Fleet/gateway/Web UI.
- Published CLI run unless explicitly requested as a release validation slice.

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

## Progress

- 2026-05-07 11:21: Investigation completed. Implementation starts under the
  approved lightweight Brain production-readiness direction.
- 2026-05-07 11:34: Implemented and validated. The recurring source harness now
  proves both memory-add and brain-skill-add positive admission roundtrips.
