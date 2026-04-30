# FEAT-038 Worker 决策管线：意图识别、能力选择与质量门禁

- **status**: in_progress
- **priority**: P1
- **owner**: Codex
- **createdAt**: 2026-04-29 17:04
- **plan**: PLAN-039

## 描述

在 FEAT-031 的 worker 项目级 epic 和 FEAT-037 的会话控制面之上，补齐 worker 决策层：把“是否连续会话”“用户意图是什么”“本轮该启用哪些 skill/MCP/tool”“最终回复是否达标”固化为可观测、可回放、可自我迭代的运行管线。

目标不是复制 `ttpos-bot` 的业务规则，也不是 faithful clone Hermes Agent。择优方向是：以 Hermes Agent 的 agent loop、context/memory/skill/tool registry、progressive disclosure 作为 worker runtime 主参照；以 `ttpos-bot` 的结构化 reviewer、签名 gate、失败反思、周期 retrospect 作为治理补充；最终迁移为 AIWorker 的 engine-agnostic worker runtime 能力。

## 验收标准

1. Worker 在每个 inbound turn 开始前产生结构化 intent decision，覆盖连续会话、新 topic、任务型请求、问答型请求、工具/资料需求和风险等级。
2. Skill/MCP/tool 选择进入独立 capability planning 阶段，选择结果可解释、可观测，并受 worker/channel allowlist 与 toolPolicy 约束。
3. 最终回复经过可配置 quality gate；初期支持 observe / warn / retry / block 模式，默认 observe，避免无意中改变现有行为。
4. intent / capability / quality decision 事件进入 worker 事件流，并由 evolution observer 持久化，后续可用于权重调整和自我迭代。
5. 失败反思只产出 pending memory / skill / policy proposal，不直接写入高风险配置；写盘或启用必须经过 operator/user approval。
6. 不破坏 FEAT-037 已有 session_entries、compaction、memory flush、engine binding 与 sessions status 行为。
7. 不把 MCP 继续作为“另一种 chat executor”扩展；MCP 应作为能力源并入 orchestrator tool/capability registry。

## 依赖

- **blocked by**: 用户批准 PLAN-039
- **relates to**: FEAT-031, PLAN-021, FEAT-037, PLAN-028, FEAT-006, FEAT-039, PLAN-041
- **blocks**: Worker 自我迭代闭环、per-worker MCP/Skill 智能选择、回答质量稳定性

## 笔记

- 2026-04-29 17:04：已只读调研当前 `aiworker` worker runtime 与 `/home/ben/projects/ttpos-bot`。当前 `aiworker` 的会话连续性已有 FEAT-037 基础，但意图识别仍主要是 `classifyContinuation`，能力选择仍是 system prompt 注入前 10 个 brain skill，MCP 仍是 executor provider 而不是 tool registry，最终回复没有独立 quality gate。
- 2026-04-29 17:14：复调研 Hermes Agent 官方仓库与文档后，PLAN-039 调整为 Hermes runtime primitives 优先、AIWorker session control plane 复用、`ttpos-bot` governance 次要参考。推进顺序改为先固化 Context Manager 与决策事件骨架，再接 CapabilityRegistry、Intent/Risk classifier、QualityGate 和 Self-evolution proposer。
- 2026-04-29 17:50：初始化、防覆盖、Soul 模板、自定义、外部 agent adapter、云端 Soul 更新和自我迭代收录门禁拆到 FEAT-039 / PLAN-041；本任务继续专注 runtime 决策管线。
- 2026-04-30 18:40：用户批准接管开发；本轮实施 PLAN-039 S1，范围限定为 Context Manager / Run Context Composer 抽出、observe-only 决策事件骨架和 evolution observation 持久化，不启用真实分类、能力强制选择或质量拦截。
- 2026-04-30 19:05：PLAN-039 S1 完成。已抽出 ContextManager / RunContextComposer，新增 observe-only intent/capability/quality 事件并接入 evolution observer；FEAT-038 继续保持 in_progress，S2 Capability Registry 待复审后继续。
- 2026-04-30 19:25：PLAN-039 S2 完成。CapabilityRegistry 已 observe-only 聚合 skill、builtin、MCP、toolset descriptor，并驱动 capability decision；执行路径和 tool exposure 不变。
- 2026-04-30 19:45：PLAN-039 S3 完成。IntentClassifier 已输出结构化 intent/risk/context/profile/sessionAction，支持 heuristic 默认和可选 LLM strict-JSON evaluator；分类结果只影响 observation/capability record。
