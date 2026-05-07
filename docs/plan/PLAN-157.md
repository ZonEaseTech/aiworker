# PLAN-157 发布 aiworker CLI 0.10.0

- **status**: in_progress
- **createdAt**: 2026-05-07 12:37
- **approvedAt**: 2026-05-07 12:37
- **relatedTask**: REL-024

## Current State

1. `main` is clean and synchronized with `origin/main`.
2. Latest published CLI is `@zonease/aiworker-cli@0.9.7`.
3. Current source has passed `bun run check`, `bun run test`, `bun run build`,
   `git diff --check`, and source-local compact governance harness
   `80 PASS / 0 FAIL / 0 SKIPPED`.
4. Latest source has not yet been validated from a published package.

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
