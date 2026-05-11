# PLAN-260 移除工作区返回 worker 入口

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 18:13
- **relatedTask**: BUG-102

## 当前状态

- `workspace-context-card` 在 workspace/session 上下文中无条件渲染“返回 worker”。
- session 上下文已经有“返回工作区”，两个返回动作同时出现会制造层级噪声。
- `backToWorkerHome` 只服务该按钮，可以随按钮一起删除。

## 方案

1. 删除 workspace rail 顶部的“返回 worker”按钮。
2. 删除 `backToWorkerHome` i18n 类型与各语言文案。
3. 补充 WorkerStudio 测试，断言 workspace/session route 不再出现该按钮，session route 仍保留“返回工作区”。

## 结果

- Workspace rail 顶部的“返回 worker”按钮已移除。
- Session route 保留“返回工作区”按钮。
- `backToWorkerHome` i18n 类型与各语言文案已删除。
- WorkerStudio 测试已覆盖 workspace/session route 不显示 Back to worker，以及 session route 仍显示 Back to workspace。

## 验证

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/`: workspace/session routes no longer
  show “返回 worker”, while the session route still shows “返回工作区”.
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`
- Passed: code-review-graph `get_minimal_context` / `detect_changes` / `get_affected_flows`
  reported medium risk and 0 affected flows. It still reports `WorkerStudio` as a graph-level
  test gap, while the changed rail navigation behavior is covered by focused Vitest assertions
  and browser verification.
