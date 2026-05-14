# PLAN-266 Worker home add action convergence

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-12 01:33
- **relatedTask**: BUG-108

## 当前状态

- Workspace rail 中“新建会话 / 新建工作区”使用 `rail-mini-action`。
- Worker home 中 Worker 列表和工作区列表的 add 动作仍使用 icon-only `IconButton`。

## 方案

1. 将 Worker 列表创建入口改为 `rail-mini-action`，显示 plus + `createWorker`。
2. 将工作区列表创建入口改为 `rail-mini-action`，显示 plus + `newWorkspace`。
3. 保留 refresh/settings 等 chrome action 的 `IconButton`。
4. 更新 WorkerStudio 测试，区分 create action 与 chrome icon-only action。

## 结果

- Worker home 的 add actions 与 workspace rail 的“新建会话 / 新建工作区”视觉语言一致。
- Chrome action 仍保持 icon-only。
- 测试覆盖 create worker/create workspace 按钮 class。

## 验证

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`
- Passed: code-review-graph MCP review: low risk, 0 affected flows.
