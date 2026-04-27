# FEAT-031 Worker 项目级落位 + 上下文连贯 + skill/MCP per-worker + 自我迭代闭环（epic）

- **status**: pending
- **priority**: P1
- **owner**: (未分配)
- **createdAt**: 2026-04-27 18:00

## 描述

将 worker runtime 从「单 host 单 worker、user 级 `~/.aiworker/`」演进为「项目级 `<project>/.aiworker/`、上下文跨会话连贯、skill/MCP per-worker 灵活配置、agent 自演化」的形态。借鉴 OpenClaw 的 dmScope/compaction/progressive disclosure 与 Hermes Agent 的三态记忆 + 自蒸馏闭环，关键产物物理隔离落到项目目录，engine（claude-code/codex/cursor）保持 user 级共享。

承载方案：PLAN-021（master），后续按 phase 拆出 PLAN-022~026 + 配套 task。

最终效果：

1. 同一 host 上不同 cwd 启动 worker 自动获得独立 `<project>/.aiworker/`，业务数据物理隔离。
2. 单 worker 跨会话上下文连贯（chat / task / 跨 channel 同人共享主 session），不再「降智」。
3. 每个 worker 可独立配置 skill 与 MCP server allowlist，能力上限由 operator 精确控制。
4. worker 在长期使用中可半自动 distill skill / memory / rollup，并接受 operator approve 后写盘生效。

## 进行时描述

规划 worker 项目级落位 + 自演化闭环 epic

## 依赖

- **blocked by**: (无；与 FEAT-002 sandbox 解耦，sandbox 是 Phase E 的 nice-to-have)
- **blocks**: 后续 PLAN-022~026 子方案与配套 task

## 笔记

- 调研锚点：OpenClaw（session/skill/MCP/dreaming）+ Hermes Agent（三态记忆 + 自演化）。
- 复用现有：`evolution_observations` / `skill_drafts` / `skill_bindings`（FEAT-006）、`conversations.summary` 字段、FilesystemBrainProvider、`fs-layout` 包。
- 关键不变量：fleet/worker 数据域边界、bearer-auth、SecretsVault ref 机制、claude-code `--dangerously-skip-permissions`、provider 三大接口契约。
