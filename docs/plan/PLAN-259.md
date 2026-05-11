# PLAN-259 工作区会话新建入口

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 18:09
- **relatedTask**: BUG-101

## 当前状态

- “工作区会话”头部右侧显示 `count-pill`。
- 这个区块已经有会话列表，单纯计数不是主要动作。
- 用户需要从 session detail 快速回到当前 workspace 的新建会话 composer。

## 方案

1. 添加 `newSession` i18n 文案。
2. 将“工作区会话”头部右侧替换为 `rail-mini-action`。
3. 点击动作导航到当前 workspace 路由，不带 session id。
4. 增加 WorkerStudio 测试覆盖从 session route 点击新建会话后进入 composer。

## 结果

- “工作区会话”头部右侧已从数量徽标改为“新建会话”动作。
- 点击该动作会导航到当前 workspace 路由，不携带 session id。
- 当前 workspace 的 create-session composer 会在未选中 session 时显示。
- 新增 WorkerStudio 测试覆盖从 session route 点击“New session”回到 workspace composer。

## 验证

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/`: from an existing session,
  “新建会话” navigates back to the current workspace and shows the create-session composer.
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`
- Passed: code-review-graph `get_minimal_context` / `detect_changes` / `get_affected_flows`
  reported medium risk and 0 affected flows. It still reports `WorkerStudio` as a graph-level
  test gap, while the changed route behavior is covered by the new Vitest case and browser
  verification.
