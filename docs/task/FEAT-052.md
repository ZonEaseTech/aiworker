# FEAT-052 Define bring-your-own executor integration strategy

- **status**: pending
- **priority**: P2
- **owner**: unassigned
- **createdAt**: 2026-05-04 11:22
- **plans**: PLAN-093, PLAN-094, PLAN-095

## 描述

定义 bring-your-own executor strategy：AIWorker 用薄 adapter 调用外部成熟
agent runtime，最小 contract 是 health/readiness、run、stream normalized
events、cancel、resume/native binding 和基础错误分类。Hermes、OpenClaw 等
不需要被扭成 project-only；它们可以按自身 profile/workspace/user config
模型运行。

## ActiveForm

建立 executor adapter 的最小契约和候选外部 runtime 接入顺序，避免 AIWorker
重复造轮子或承担外部 executor 生态维护成本。

## 依赖

- **blocked by**: FEAT-049
- **blocks**: Hermes/OpenClaw adapter spikes
- **relates to**: FEAT-011, FEAT-012, FEAT-016, FEAT-047

## 验收标准

1. thin adapter contract 明确，且不包含通用 isolation 或完整 capability projection 平台。
2. Hermes 接入以 cwd/profile 兼容的 thin CLI adapter spike 验证。
3. OpenClaw 接入尊重 configured runtime / agent workspace 模型，不强行 project-only。
4. docs 明确 ambient executor 安全模型：AIWorker 隔离 brain/worker/fleet，不隔离 operator 的 host executor environment。

## 阶段计划

1. `PLAN-093`：thin adapter contract。
2. `PLAN-094`：Hermes thin adapter spike。
3. `PLAN-095`：OpenClaw configured runtime spec。

## 笔记

- 2026-05-04 11:22：该任务排在 executor surface 收口之后，避免先接入新 engine 又扩大旧抽象。
