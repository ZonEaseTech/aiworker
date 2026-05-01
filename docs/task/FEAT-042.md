# FEAT-042 Orchestrator 控制执行器与任务执行器解耦

- **status**: pending
- **priority**: P1
- **owner**: unassigned
- **createdAt**: 2026-04-30 20:05
- **plan**: PLAN-051

## 当前保留原因 / Current Scope

本后续功能仍有效，并且符合当前边界：Orchestrator control-plane executor 与 task/data-plane executor 应可分离。当前代码中 intent LLM classifier、quality gate evaluator、repair、compaction summary、memory flush 仍复用 `this.deps.executor`。

实现时必须保持默认兼容：未配置 control executor 时继续复用主 executor；显式 control executor 不继承会造成文件/命令副作用的 task tools。

## 描述

FEAT-038 / PLAN-039 的 MVP 行为是可接受的：Orchestrator 的可选 LLM intent classifier、quality gate、repair 和 compaction suppressed run 默认复用当前 worker 的主 `executor`。这样能让决策管线先闭环，也避免引入第二套 runner 配置。

但长期看，Orchestrator 是上游 brain/control plane，worker executor 是下游 task/data plane。二者复用同一个 engine 会带来隐性耦合：控制判断受下游 engine 能力、认证、成本、工具副作用和 workspace 行为影响。后续需要允许独立配置 control-plane executor，同时保留默认复用主 executor 的兼容路径。

## 验收标准

1. Worker config 支持可选的 `orchestrator.decisionPipeline.executor` 或等价 control executor 配置；未配置时继续复用 `config.executor`。
2. Intent classifier、quality gate evaluator、quality repair、compaction / memory flush 等 suppressed control calls 都通过统一 control executor resolver。
3. Control executor 默认不暴露 task tools，不继承会导致真实文件/命令副作用的工具能力；如必须传 workspace，只传只读/低风险上下文。
4. Control executor 的 model、timeout、temperature 和 fallback 策略可与主 executor 分开配置。
5. 配置 schema、secret hydration、redaction、worker info / diagnostics 和 tests 同步覆盖 control executor。
6. 现有 FEAT-038 行为不回归：未配置 control executor 的 worker 仍能按 MVP 行为运行。

## 依赖

- **blocked by**: 后续排期
- **relates to**: FEAT-038, PLAN-039, FEAT-039, PLAN-041, FEAT-037, PLAN-028
- **blocks**: 高质量低成本决策模型、控制面副作用隔离、多 engine worker 决策稳定性

## 笔记

- 2026-04-30：明确接受 FEAT-038 当前 MVP 行为：Orchestrator 的 LLM 分类/评审/修复暂时复用 worker 主 executor。
- 2026-04-30：记录后续方向：把 Orchestrator control-plane LLM runner 从 task executor 中解耦，默认 fallback 仍复用主 executor，避免破坏现有配置。
