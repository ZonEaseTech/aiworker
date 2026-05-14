# PLAN-264 Workspace route worker return action

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 20:45
- **relatedTask**: BUG-106

## 当前状态

- Workspace route 的 side rail context card 只在 session route 中渲染返回动作。
- Create-session workspace route 没有回到 worker page 的入口。

## 方案

1. 为 workspace copy 增加明确的 `backToWorker` 文案。
2. 在 workspace context card 中按路由状态切换动作：
   - session route: “返回工作区”
   - workspace route: “返回 worker”
3. 更新 WorkerStudio 测试覆盖 workspace route 返回 worker 的导航，同时保留 session
   route 不显示“返回 worker”的断言。

## 结果

- 未选中 session 的 workspace route 恢复“返回 worker”入口。
- session 详情态仍只提供“返回工作区”。
- 测试覆盖 workspace route 返回 worker page 行为。

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
