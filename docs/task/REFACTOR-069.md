# REFACTOR-069 HR Role Search Cockpit workbench

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-12 10:26
- **claimedAt**: 2026-05-12 10:34
- **completedAt**: 2026-05-12 12:23
- **plan**: PLAN-276
- **relatesTo**: REFACTOR-068, PLAN-275, apps/web, apps/api, packages/shared, packages/component, packages/core

## 背景

HR Soul 当前已经有候选人筛选、面试 brief、role rubric、hiring risk 等能力雏形，
但产品形态仍接近通用 worker studio。它能说明 HR prompt 和 artifact 类型，却还没有
呈现出 HR 领域自己的王牌工作台。

HR 的高频工作不是单轮聊天，也不是孤立生成一个 candidate screen。真实招聘流程围绕
一个 role search 连续推进：岗位 intake、rubric、候选人 pipeline、证据抽取、面试
kit、scorecard、debrief、候选人横向比较、roundup memo 和最终 review。Agent 最大
价值在于减少上下文搬运、整理证据、发现缺失信号和生成可审查 artifact，而不是自动做
录用或拒绝决定。

## 目标

以 HR 作为首个 Soul 专业工作台改造切入点，其他 Soul 保留当前实现。

核心目标是把 HR worker 从通用 session studio 迭代为 **Role Search Cockpit**：

```text
Role rubric + candidate evidence + interview notes
-> evidence matrix + interview kit + scorecard summary + roundup packet
-> human review -> reusable HR lessons
```

## 设计原则

1. `Role Search` 是 HR 主 workspace，不是 chat session。
2. 左侧呈现 pipeline / candidate list / stage health；中心呈现当前业务对象
   candidate dossier 或 evidence matrix；右侧呈现 Agent task tray 和 artifact patch。
3. `Evidence Matrix` 是 HR 的王牌视图，类比 Open Design 的整组生成结果。
4. `Roundup Packet` 是核心交付 artifact，用于 hiring team review，而不是自动决策。
5. Agent 输出必须是可审查 artifact patch；人类显式 apply/edit/reject 后才进入 artifact。
6. Candidate data 默认敏感；durable lesson 只能来自 review 后、去标识化、带 provenance
   的 memory candidate。

## 非目标

- 不改造 PM、QA、DevOps 的当前 Web 体验。
- 不接入真实 ATS/HRIS 作为首个必须条件；先支持 file-first local evidence packet。
- 不自动排序候选人，不生成未经确认的 offer/rejection，不做薪酬承诺。
- 不推断 protected-class attributes，不做视频情绪/性格黑箱评分。
- 不把 HR workbench 写成不可复用的硬编码孤岛；它应基于 REFACTOR-068 的 workbench
  descriptor 和共享组件能力。

## 验收标准

- HR worker route 进入 Role Search Cockpit；PM/QA/DevOps 仍进入当前通用 worker
  implementation。
- HR workspace 支持至少三种对象层级：role search、candidate dossier、hiring pool /
  evidence matrix。
- HR 能产出并预览至少五类 artifact：role rubric、candidate screen、interview kit、
  evidence matrix、roundup packet。
- Agent task tray 至少覆盖：extract evidence、match to rubric、draft interview kit、
  find missing signals、generate roundup packet、check risky wording。
- Agent 输出以 patch / proposal 形式进入 artifact review，不直接覆盖人类确认结果。
- Review panel 能标记 artifact quality、privacy/compliance status 和 memory candidates。
- Local file-first evidence packet 可用；真实 ATS/HRIS connector 仅作为后续扩展点。
- 浏览器验证覆盖 HR cockpit 的 desktop/mobile 主路径，并确认其他 Soul fallback 未回归。

## 备注

本任务是首个专业 Soul workbench 的产品化验证。成功标准不是 UI 更复杂，而是 HR 用户在
一个 role search 中能更快完成证据整理、面试准备、roundup 复盘和 review/lesson 闭环。

## 完成记录

- Implemented the HR Role Search Cockpit with pipeline rail, rubric/evidence
  surface, Evidence Matrix, Roundup Packet summary, and Agent Task Tray.
- Added HR artifact coverage for evidence matrix and roundup packet templates.
- Task tray actions now select the intended HR artifact target and prefill a
  source-backed patch/proposal prompt; generated output still uses the existing
  session stream and review path.
- Playwright validation covered desktop, mobile, HR workspace route, HR session
  route handoff, and PM generic fallback. A mobile header overflow and a desktop
  task-tray composer visibility issue were found and fixed during validation.
