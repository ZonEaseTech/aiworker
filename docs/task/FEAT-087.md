# FEAT-087 Soul workspace agent instructions projection

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-15 14:30
- **plan**: PLAN-328
- **relatesTo**: packages/core, Soul App workspace bootstrap, Codex AGENTS.md, Claude CLAUDE.md

## Context

Soul App workspaces already bootstrap profile files and project app-owned native
skills into engine-native skill directories. They still lack workspace-root
agent instructions, so Codex and Claude Code do not receive the same durable
Soul workspace contract before a session starts.

## Goals

- Write or update `AGENTS.md` at every Soul App workspace root.
- Write or update `CLAUDE.md` as a one-line `@AGENTS.md` shim.
- Keep the guidance generic to Soul workspaces: accepted state, artifact output,
  review request, and policy-only promotion.
- Make action-started sessions behave as explicit Soul skill selection, while
  preserving a confirmation path when the user wants to switch.
- Keep generated instruction files out of profile revision commits.

## Non-Goals

- No HR-specific instruction hardcoding.
- No replacement for native skill projection.
- No engine-owned write permission for accepted profile state.

## Acceptance Criteria

- Workspace creation writes `AGENTS.md` and `CLAUDE.md`.
- Workspace repair/update refreshes stale generated instruction files.
- `CLAUDE.md` contains only `@AGENTS.md`.
- `AGENTS.md` states that action-started sessions must follow the selected
  skill and must not silently switch skills.
- `.gitignore` excludes `AGENTS.md` and `CLAUDE.md` from the profile ledger.
- Focused core runtime tests pass.

## Verification

- `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run lint`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-15 14:30: Claimed after user approval to land Soul workspace
  `AGENTS.md` and `CLAUDE.md` projection.
- 2026-05-15 14:42: Completed implementation and focused verification.
- 2026-05-15 14:55: Reopened same uncommitted slice to add explicit
  action/skill binding guidance.
- 2026-05-15 15:01: Completed action/skill binding refinement and focused
  runtime verification.
- 2026-05-16: Implementation absorbed by FEAT-088 before commit. Workspace
  instructions now live in Soul App `engine-assets/workspace` templates instead
  of a core Markdown renderer.
