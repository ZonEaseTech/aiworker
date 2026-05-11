# PLAN-257 Select 展开态样式统一

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 17:49
- **relatedTask**: BUG-099

## 当前状态

- `StudioSelect` 的 trigger 和 listbox 各自绘制完整边框，展开时形成两套轮廓。
- 展开态 trigger 从 pill radius 临时切成另一组圆角，视觉上断裂。
- listbox 的 `z-index` 偏低，creation dialog 的 `overflow: hidden` 会裁切展开内容。
- option active 和 hover 样式没有和 trigger 的盒模型形成统一节奏。

## 方案

1. 保留折叠态 pill trigger。
2. 打开时把 trigger 顶部圆角和 listbox 底部圆角组合成一个连续 surface。
3. 提升 open select/listbox 层级，creation dialog 允许 select 浮层可见。
4. 将 option active/hover 的 border radius 收敛到组件 token。
5. 增加 WorkerStudio 测试覆盖 select open/close 语义。

## 结果

- `StudioSelect` 展开态现在使用连续的 trigger + listbox surface。
- Option hover 和 active 状态统一使用 token 化圆角节奏。
- Creation dialog 允许 select listbox 渲染到 dialog body 外侧，不再裁切下拉层。
- WorkerStudio 测试覆盖 select open/close 语义。

## 验证

- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run check`
- Passed: `git diff --check`
- Passed: Browser verification on `http://127.0.0.1:9217/`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`; CRG reported 0 affected flows and 0 test gaps.
