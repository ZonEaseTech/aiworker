# FEAT-049 Simplify executor surface around bring-your-own runtimes

- **status**: in-progress
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-04 11:22
- **claimedAt**: 2026-05-04 12:00
- **plans**: PLAN-085, PLAN-086, PLAN-087

## 描述

收口 executor surface：AIWorker 不维护通用 executor isolation，也不把
engine-native MCP / skill / plugin / policy lifecycle 做成自己的重型平台。
现有 `.aiworker/executor-capabilities.json` 语义降级为 project overlay /
bootstrap hint；`executor doctor` 只报告外部 runtime 的可用性、ambient
能力提示与 overlay 静态问题。

## ActiveForm

把 executor 从“AIWorker 管理的 project-scoped capability runtime”改成
“bring-your-own external agent runtime with thin adapter”。

## 依赖

- **blocked by**: FEAT-048
- **blocks**: FEAT-052
- **relates to**: FEAT-044, FEAT-047, BUG-050, BUG-051

## 验收标准

1. executor overlay 文档与 CLI 输出不再承诺 project-only 或 hermetic behavior。
2. doctor/readiness 输出能明确 ambient user/host capabilities may be loaded。
3. executor commands 保留低成本 select、health、run、stream、cancel、resume 相关能力，避免继续扩张通用 projection lifecycle。
4. 既有 Codex / Claude Code projection 不被立刻删除，但语义改为 best-effort bootstrap helper。

## 阶段计划

1. `PLAN-085`：executor capability manifest 语义降级为 overlay/hints。
2. `PLAN-086`：executor doctor/readiness 改成 ambient runtime 语义。
3. `PLAN-087`：CLI/help 文案移除 project-only / isolation 暗示。

## 笔记

- 2026-05-04 11:22：该任务是后续实现收口，不在 PLAN-083/084 的文档落地中改代码。
- 2026-05-04 12:00：完成 PLAN-085。manifest 语义在 shared schema、CLI 输出文案、fs-layout 注释三处全部降级为 project executor overlay / hint；issue code、命令名、文件名、导出名都保持向后兼容。
- 2026-05-04 12:10：完成 PLAN-086。`executor doctor` 与 `aiworker up` doctor stage 渲染统一为四档 readiness：binary likely ready（缺失 WARN 不 FAIL）、ambient runtime INFO、project overlay 静态检查、blocking policy（仅 invalid descriptor / 明文 secret / projection 错误 FAIL）；新增 INFO 行说明 engine login/auth 不归 AIWorker 探测。
