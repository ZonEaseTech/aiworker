# FEAT-053 Clarify Project scope as worker-bound business scope

- **status**: in_progress
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-04 13:13
- **claimedAt**: 2026-05-04 13:13
- **plans**: PLAN-096

## 描述

补充 Project Brain 的关键产品边界：AIWorker 中的 Project scope 是 worker 在
host/workspace 维度绑定的业务作用域，不等同于 software project、git repo 或
PMA 项目。developer Soul 可以把 scope 绑定到代码仓库；HR Soul 可以把 scope
绑定到岗位、候选人池、简历库、筛选/归档/备份/审核流程；legal、finance、ops
等 Soul 也应按各自业务对象和证据链建模。

## ActiveForm

把 Project Brain 从 developer-only / project-management 语义里解耦，明确 Soul
才定义领域对象、资料类型、审核流程、归档/备份/留存规则和审计语义。现有
Project Brain 产品定位保持不变，但文档必须避免把 Project scope 收窄为代码项目。

## 依赖

- **blocked by**: FEAT-048, FEAT-050
- **blocks**: future Soul-specific brain asset model, non-developer Soul workflows
- **relates to**: FEAT-039, FEAT-046, FEAT-051

## 验收标准

1. AGENTS.md 明确 Project scope 是 worker-bound business scope，不等同于 software project。
2. README 顶部定位和 Features 将 Project Brain 表达为每个业务作用域一份 brain 资产。
3. architecture docs 的 Product Positioning 与 topology 不再把 Project 节点写成 Project repo。
4. changelog 记录该补充决策，且不修改已完成的 FEAT-050 / PLAN-088 槽位。

## 阶段计划

1. `PLAN-096`：Project scope business-scope boundary docs。

## 笔记

- 2026-05-04 13:13：该任务专门承接本会话补充决策；不要回写已 completed 的 FEAT-050 / PLAN-088。
- 2026-05-04 13:13：文档改动已 staged 并通过 `git diff --cached --check`；等待本会话 review 后再标记 completed。
