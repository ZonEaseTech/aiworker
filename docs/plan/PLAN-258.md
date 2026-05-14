# PLAN-258 其他工作区筛除当前项

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 18:02
- **relatedTask**: BUG-100

## 当前状态

- Workspace route 侧栏使用 `soulWorkspaces.map(...)` 渲染“其他工作区”。
- 该列表未排除 `selectedWorkspace`。
- 当前 workspace 因此会出现在“其他工作区”区块，并且可能呈现 active 状态。

## 方案

1. 在 `selectedWorkspace` 解析后派生 `otherWorkspaces`。
2. “其他工作区”只渲染 `otherWorkspaces`。
3. 移除该区块里的 active 判断，因为当前项已被筛除。
4. 增加无其他 workspace 的空态文案。
5. 更新 WorkerStudio 测试覆盖当前项被筛除。

## 结果

- `otherWorkspaces` 从 `soulWorkspaces` 派生，并排除当前选中的 workspace。
- 侧栏“其他工作区”区块现在只渲染 `otherWorkspaces`。
- 该区块移除了 active 判断，因为当前 workspace 已不会出现在列表内。
- 当 worker 没有其他 workspace 时显示空态。
- WorkerStudio 测试覆盖当前 workspace 被排除，同时保留第二个 workspace 快捷入口。

## 验证

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`; CRG reported 0 affected flows.
