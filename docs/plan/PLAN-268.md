# PLAN-268 Count text convergence

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-12 01:48
- **relatedTask**: BUG-110

## 当前状态

- `worker-studio.tsx` 在能力模板和工作区标题后渲染 `.count-pill`。
- `.count-pill` 在 `workspace.css` 中定义为 badge/tag 视觉。

## 方案

1. 将能力模板 count 合并到 `<strong>` 文本：`Title (N)`。
2. 将工作区 count 合并到 `<strong>` 文本：`Title (N)`。
3. 删除不再使用的 `.count-pill` 样式。
4. 更新 WorkerStudio 测试覆盖标题文本和 `.count-pill` 移除。

## 结果

- Count 不再是独立 tag，而是紧跟标题的普通文本。
- `count-pill` 样式已删除。
- 测试覆盖 count 文本格式。

## 验证

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `CI=1 bunx vitest run --testTimeout=15000 src/worker/__tests__/worker-studio.test.tsx --reporter=verbose`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/workers/hr-playwright-worker-1740-31ce9d16`
  returned `.count-pill` count `0`, `能力模板 (4)`, and `工作区 (1)`.
- Passed: `bun run crg:update`
- Passed: `bun run crg:review` (risk `0.40`, `0` affected flows, `WorkerStudio` covered by focused test)
- Passed: code-review-graph MCP `get_minimal_context`, `detect_changes`, and `get_affected_flows`
  for the changed Web files.
- Note: unscoped Web Vitest entered a no-output hang twice and was terminated; the focused
  WorkerStudio suite is the final test gate for this scoped UI change.
