# PLAN-328 Soul workspace agent instructions projection

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-15 14:30
- **relatedTask**: FEAT-087

## Decision

Make workspace-root `AGENTS.md` plus `CLAUDE.md = @AGENTS.md` a generic Soul
workspace bootstrap/update invariant. Codex reads `AGENTS.md`; Claude Code reads
`CLAUDE.md` and can import `AGENTS.md`, so one maintained instruction file can
serve both engines.

## Investigation

- `LocalWorkerRuntime.prepareWorkspaceLayout(...)` already runs during
  workspace creation and repair, making it the right Host-owned place for
  generic workspace guidance.
- `bootstrapProfileWorkspace(...)` owns the profile workspace root files and
  `.gitignore` rules.
- Native skills are already projected separately into `.agents/skills` and
  `.claude/skills`.
- The active executor contract remains thin: engines own their tool loop, while
  AIWorker prepares cwd/context and observes artifacts/reviews.

## Implementation Slices

1. Add failing runtime coverage for `AGENTS.md`, `CLAUDE.md`, refresh behavior,
   and profile `.gitignore`.
2. Add generic workspace instruction rendering in the profile workspace
   bootstrap path.
3. Add action/skill binding guidance to generated `AGENTS.md`.
4. Run focused core runtime verification and diff checks.
5. Close PMA task/plan and changelog.

## Verification Plan

- `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Failure Handling

- If a workspace has a user-authored `AGENTS.md`, stop and revisit ownership
  semantics instead of silently overwriting it.
- If Claude import semantics need engine-specific additions later, keep
  `CLAUDE.md` as the shim and add the extra contract to `AGENTS.md`.

## ActiveForm

- 2026-05-15 14:30: Implementing approved minimal scope.
- 2026-05-15 14:42: Completed with runtime tests, package typecheck/test,
  root lint, diff check, and code-review-graph review.
- 2026-05-15 14:55: Reopened before commit for action/skill binding guidance.
- 2026-05-15 15:01: Completed action/skill binding refinement.
- 2026-05-16: Superseded at implementation level by PLAN-329. The final
  maintained source for workspace instructions is the Soul App
  `engine-assets/workspace` template.
