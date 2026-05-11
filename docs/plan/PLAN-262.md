# PLAN-262 Settings engine icon assets

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 20:23
- **relatedTask**: BUG-104

## 当前状态

- `EngineCard` 对已安装 engine 使用通用 `Sparkles` icon。
- 未安装 engine 使用空灰色块。
- 用户需要每个 engine 使用自己的专属 icon。

## 方案

1. 从 LobeHub Icons 拉取 OpenAI、Claude、Cursor、Gemini、OpenCode、Qwen、Hermes Agent SVG。
2. 将 SVG 保存到 `apps/web/public/engine-icons/`，构建时作为静态资产发布。
3. 在 settings model 中建立 engine id 到 icon path 的映射。
4. `EngineCard` 使用本地图标 mask 渲染 icon，并对未安装 engine 做弱化处理。
5. 更新 WorkerStudio 测试覆盖 icon 映射和 Codex 渲染路径。

## 结果

- 新增 `apps/web/public/engine-icons/` 本地 SVG 资产，覆盖 OpenAI、Claude、Cursor、
  Gemini、OpenCode、Qwen、Hermes Agent。
- Settings model 提供 engine id 到本地 icon path 的集中映射。
- `EngineCard` 使用本地 SVG mask 渲染专属 icon，未安装 engine 保留弱化样式。
- WorkerStudio 测试覆盖 Codex icon 渲染路径和全部本地 engine icon 映射。

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
