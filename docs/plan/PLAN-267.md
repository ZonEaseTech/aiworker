# PLAN-267 Add actions plus icon button convergence

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-12 01:44
- **relatedTask**: BUG-109

## 当前状态

- Worker home 的 add actions 使用 `rail-mini-action` plus + label。
- Workspace rail 的“新建会话 / 新建工作区”也使用 `rail-mini-action`。
- 用户要求回归统一的 plus icon button。

## 方案

1. 将 Worker list、workspace list、workspace sessions、other workspaces 四类 add action
   全部切回 `IconButton`。
2. 保留 `aria-label` 和 `title`，移除可见 label。
3. 删除不再使用的 `.rail-mini-action` 样式。
4. 更新 WorkerStudio 测试覆盖 add actions 都使用 `icon-button`。

## 结果

- 所有 add actions 使用统一的 plus icon button。
- “返回 worker / 返回工作区”等非 add 文本动作仍保留 text button。
- `rail-mini-action` 样式已移除，避免后续继续分叉。

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
