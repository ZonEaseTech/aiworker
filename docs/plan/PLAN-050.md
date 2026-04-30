# PLAN-050 Project-scope engine cwd preservation

- **status**: completed
- **createdAt**: 2026-04-30 18:08
- **approvedAt**: 2026-04-30 18:08
- **relatedTask**: BUG-041

## Context

Project-scope AIWorker has two roots with different responsibilities:

1. `<project>/` is the semantic project root for source files and engine-native
   project configuration such as `AGENTS.md`, `CLAUDE.md`, `.agents/`, and `.claude/`.
2. `<project>/.aiworker/` is AIWorker's project brain/control root.
3. `<project>/.aiworker/local/` is private worker state.

Before this plan, the runtime passed a private per-conversation directory under
`.aiworker/local/data-root/workspaces/` as the engine `cwd`, so project-native
engine context was not visible by default.

## Proposal

1. Extend `WorkspaceManager` with an optional shared project root mode.
2. In project scope, use shared project root mode only when no explicit
   git-origin or executor workspaceRoot override is configured.
3. Inject `.aiworker` persona and memory files into the orchestrator system prompt.
4. Keep explicit/user scope and explicit isolation settings on the existing
   per-conversation workspace path.
5. Add focused tests for the manager, prompt injection, and orchestrator path
   passed to Claude Code.

## Risks

- Shared project root means concurrent project-scope conversations can edit the
  same working tree. This matches the user's stated project-level semantics, but
  operators who need isolation should configure git-origin/workspaceRoot.
- Existing tests assume every conversation creates a directory under
  `WORKER_DATA_ROOT`; only project scope should change.

## Scope

Expected changes:

- `packages/core/src/worker/executor/workspace.ts`
- `packages/core/src/worker/orchestrator/service.ts`
- `packages/core/src/worker/runtime.ts`
- focused tests under `packages/core/src/worker/**`
- PMA task/plan/changelog records

## Alternatives

1. Default to git worktrees from the project root. Rejected for this fix because
   untracked `.agents/` and `.claude/` would still be absent unless another
   projection/sync feature is implemented.
2. Copy or symlink external agent files into per-conversation workspaces. Deferred
   to PLAN-041 adapter projection work because it has conflict and drift semantics.

## Annotations

- 2026-04-30 18:08：用户明确要求解决 engine 运行目录问题，本计划直接进入 implementing。
- 2026-04-30 18:26：实现完成。`WorkspaceManager` 新增 shared project root 模式；
  runtime 在 project scope 且没有显式隔离配置时启用该模式；orchestrator 注入
  `.aiworker` persona / memory docs；Claude Code orchestrator 回归测试确认 spawn cwd
  为 project root。

## Verification

- Passed: `bun test packages/core/src/worker/orchestrator/service.history.test.ts packages/core/src/worker/orchestrator/service.claude-code.test.ts packages/core/src/worker/executor/workspace.test.ts packages/core/src/worker/runtime.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-core' typecheck`
- Passed: `bun run typecheck`
- Passed: `bun run lint`
- Passed: `git diff --check`
