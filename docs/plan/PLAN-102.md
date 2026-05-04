# PLAN-102 Brain brief compiler and projection boundary

- **status**: draft
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: (pending)
- **relatedTask**: FEAT-054

## 现状

`ContextManager` 当前把 `AGENT.md`、`SOUL.md`、`USER.md`、`MEMORY.md`、
`ROLLUP.md` 和前 N 个 brain skill 直接拼进 system prompt。这能启动 Project Brain，
但无法根据 task、scope、Soul、artifact、risk 和 token budget 编译最小相关上下文。

## 方案

实现 task-specific Brain brief compiler：

1. 新增 `BrainBriefRequest` / `BrainBrief` 类型，输入 task、scope、Soul、
   artifact refs、risk、executor、token budget。
2. 编译器从 scope manifest、Soul module、artifact registry、memories、policies、
   admission/audit 摘要中选择相关内容。
3. CLI 提供 `aiworker brain brief --task ...` 预览，不默认启动 executor。
4. Orchestrator 后续可用 brief 替代粗粒度 persona 拼接，但第一阶段保持可选开关。
5. Projection boundary：AGENTS.md / CLAUDE.md / Copilot instructions / executor hints
   都是 projection，不是 canonical source of truth。

## 范围

- shared brief types。
- core compiler service。
- CLI preview。
- developer + HR fixture tests。
- docs examples。

## 非范围

- 不默认改写 executor-specific 文件。
- 不改变 executor adapter contract。
- 不做 semantic vector retrieval。

## 风险

1. Brief compiler 如果默认替换 system prompt，可能造成行为漂移；第一版先 preview / opt-in。
2. token budget 截断可能丢掉高风险 policy；policy 和 risk sections 要有保底优先级。
3. Projection 容易被误解为 source of truth；CLI 文案必须明确 canonical brain 在 AIWorker scope。

## 验证

- compiler unit tests。
- CLI preview snapshot tests。
- developer / HR fixture coverage。
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`
