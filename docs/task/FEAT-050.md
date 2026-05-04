# FEAT-050 Strengthen Project Brain product surface

- **status**: in-progress
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-04 11:22
- **claimedAt**: 2026-05-04 12:30
- **plans**: PLAN-088, PLAN-089, PLAN-090

## 描述

强化 AIWorker 的核心差异化：Project Brain。Project Brain 包含 Soul/persona、
USER、MEMORY、brain skills、project policy、runtime capability drafts、memory
admission 和可迁移 filesystem brain。Executor 可以是 ambient external
runtime，但 Project Brain 必须保持可检查、可迁移、可审计、可治理。

## ActiveForm

把用户第一次使用、brain 状态可见性、brain admission 和项目知识沉淀做成
产品主线，而不是围绕 executor capability lifecycle 继续扩张。

## 依赖

- **blocked by**: FEAT-048
- **blocks**: durable brain UX, future brain admission commands
- **relates to**: FEAT-039, FEAT-043, FEAT-046, TODO-008

## 验收标准

1. Project Brain 在 README / docs / CLI / Worker Admin 中是一等概念。
2. 用户能清楚看到当前 project brain 的 persona、skills、memories、write target 和 admission 状态。
3. generated memory / brain skill / policy proposal 的入库流程有明确 approval 边界。
4. Brain capability 与 executor-native capability 的命名、存储和同步边界保持清晰。

## 阶段计划

1. `PLAN-088`：Project Brain 核心资产模型与文档。
2. `PLAN-089`：brain status / doctor / onboarding UX 强化。
3. `PLAN-090`：brain admission / approval roadmap。

## 笔记

- 2026-05-04 11:22：该任务接续 FEAT-046；优先强化 AIWorker 自己拥有的 brain surface。
- 2026-05-04 12:35：完成 PLAN-088。`docs/architecture.md` 新增 “Project Brain asset model” 章节用表格枚举五类资产；`docs/cli.md` brain 段落顶部加同步表；README Features 把 Project Brain 行展开成五类资产摘要。不新增 mutating brain command，不实现 admission DB schema。
- 2026-05-04 12:50：完成 PLAN-089。`init` next-steps 重排（brain identity → brain status → doctor → executor）；`doctor` 输出加 Brain identity 段；`brain status` 输出加 `assets` 块（identity + skill/memory count + 空状态 hint）；Worker Admin Test 面板 header 强调 brain → executor → channel 顺序，组件位置已经是 brain-first 不需要重排。
- 2026-05-04 13:00：完成 PLAN-090。`docs/architecture.md` 增加 “Brain admission roadmap” 4 段路线（proposal 模型 / storage 选型 / approval surface / 唯一免审写入），明确不复用 executor capability 通路、命名隔离规则。本计划不落 DB migration、不实施 CLI/API/UI；后续 admission CLI/API/UI 单独走 PMA。
