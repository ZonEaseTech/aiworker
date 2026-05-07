# PLAN-157 发布 aiworker CLI 0.10.0

- **status**: completed
- **createdAt**: 2026-05-07 12:37
- **approvedAt**: 2026-05-07 12:37
- **completedAt**: 2026-05-07 12:52
- **relatedTask**: REL-024

## Current State

1. `main` contains release commit `f2aa5ee`; annotated tag `v0.10.0` is
   pushed.
2. Latest published CLI is `@zonease/aiworker-cli@0.10.0`.
3. Local release gates passed before tagging, including full typecheck, lint,
   test, build, CLI smoke, fleet smoke, dist version checks, and publish
   dry-run pack stage.
4. Published package validation passed through QA-019:
   `80 PASS / 0 FAIL / 0 SKIPPED`.

## Proposal

1. Release `0.10.0` because the file-first Brain runtime, Brain Skill
   admission materializer, Soul skill seeding, and Web redesign are
   user-visible behavior changes under `0.x`.
2. Follow the existing tag-triggered release workflow:
   local gates → release bump commit → annotated tag → push main/tag →
   monitor GitHub Actions → verify npm/GitHub Release.
3. After publish, run `cli-release-local --version 0.10.0 --matrix compact`
   to verify the package path.
4. If compact published validation passes, file the next QA slice for source
   full matrix or remote fleet upgrade validation.

## Risks

1. GitHub release workflow may fail if `NPM_TOKEN` is missing or expired.
2. Published compact harness invokes external executors and can fail due to
   local auth/runtime environment rather than package behavior.
3. `0.10.0` introduces new file-first Brain assets; release validation must
   inspect both package version and runtime behavior, not only npm metadata.

## Scope

- `apps/cli/package.json`
- `README.md`
- `docs/task/REL-024.md`
- `docs/plan/PLAN-157.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`
- Release commit, tag, push, workflow verification, published-package QA.

## Non-Scope

- Feature changes.
- Workflow YAML changes.
- Remote fleet upgrade until package validation passes.
- Policy materializer implementation.

## Validation

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- CLI run smoke.
- CLI fleet smoke.
- Dist version checks.
- `git diff --check`
- `cd apps/cli/dist && bun publish --dry-run --access public`
- GitHub Actions release workflow.
- npm latest and explicit package version smoke.
- GitHub Release asset verification.
- Published-package compact governance harness.

## Progress

- 2026-05-07 12:37: Investigation and proposal completed. Implementation
  begins under the user-approved production-readiness release direction.
- 2026-05-07 12:39: Local release gates passed. Ready for release bump commit,
  annotated tag, push, and workflow verification.
- 2026-05-07 12:43: Release commit `f2aa5ee`, `main`, and annotated tag
  `v0.10.0` pushed. GitHub Actions release run `25476431319` completed
  successfully.
- 2026-05-07 12:52: npm latest, explicit `bunx` package version smoke,
  GitHub Release asset verification, and published-package compact governance
  harness all passed. QA-019 records the 80 PASS / 0 FAIL / 0 SKIPPED evidence.
