# PLAN-261 Settings 引擎操作按钮统一

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 20:12
- **relatedTask**: BUG-103

## 当前状态

- `ExecutionSettings` 中“测试”和“重新扫描”都使用 `Button variant="ghost" iconOnly`。
- `iconOnly` 会附加 `icon-btn`，但这两个按钮并不是纯图标按钮。
- “测试”没有图标，“重新扫描”有图标，视觉权重不一致。

## 方案

1. 移除这两个按钮的 `iconOnly`。
2. 增加 settings 专用小号 action button class，并使用现有 design token。
3. 为“测试”补充操作图标，使它和“重新扫描”同属 icon + label action。
4. 更新 WorkerStudio 测试，断言按钮使用统一 class 且不再使用 `icon-btn`。

## 结果

- “测试”和“重新扫描”已统一使用 `settings-action-button`。
- 两个按钮不再使用 `icon-btn`。
- “测试”补充 `Gauge` 图标，“重新扫描”继续使用 `RefreshCw` 图标。
- WorkerStudio 测试已覆盖统一 class、不再使用 `icon-btn`、以及原有 test/rescan API 行为。

## 验证

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/`: both “测试” and “重新扫描”
  use `settings-action-button` and no longer use `icon-btn`.
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`
- Passed: code-review-graph `get_minimal_context` / `detect_changes` / `get_affected_flows`
  reported low risk and 0 affected flows. It still reports `ExecutionSettings` as a graph-level
  test gap, while the changed button classes and original actions are covered by the WorkerStudio
  integration test and browser verification.
