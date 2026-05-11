# PLAN-265 Workspace rail width convergence

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-12 01:24
- **relatedTask**: BUG-107

## 当前状态

- `.entry-side` 默认左右 padding 为 18px。
- `.workspace-session-route .entry-side` 在桌面态覆盖为 16px。
- 因此 workspace route 内部 rail 元素宽度为 303px，session route 为 307px。

## 方案

1. 移除桌面态 `.workspace-session-route .entry-side` 横向 padding 覆盖。
2. 保留 `responsive.css` 中移动端对 session route 的压缩布局。
3. 用浏览器分别测量 workspace route 和 session route 的 rail 元素宽度。

## 结果

- Workspace route 与 session route 在桌面态复用同一 sidebar padding。
- 左侧 rail card、section head、session item 和 empty block 宽度统一。
- 移动端 session route 专属规则保持不变。

## 验证

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser width verification on `http://127.0.0.1:9217/`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`
- Passed: code-review-graph MCP review: low risk, 0 affected flows, 0 test gaps.
