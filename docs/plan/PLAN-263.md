# PLAN-263 Visible muted engine icons

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 20:34
- **relatedTask**: BUG-105

## 当前状态

- 未安装 engine 的 DOM 中已经有 icon mask。
- `.agent-icon-muted` 的 foreground/background 都使用灰色，导致图形不可见。

## 方案

1. 保留未安装 card 的 disabled 状态和 card-level opacity。
2. 将 muted icon tile 背景改为 panel 色，前景改为正文色，让禁用透明度负责弱化。
3. 在 WorkerStudio 设置测试中加入未安装 Cursor engine，断言仍渲染对应 icon shape。

## 结果

- 未安装 engine 的专属 icon 在 muted tile 中保持可见。
- 已安装 engine 的 active / ready 样式不变。
- 测试覆盖未安装 Cursor icon 渲染路径。

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
- Passed: code-review-graph MCP review: low risk, 0 affected flows, 0 test gaps.
