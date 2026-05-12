# FEAT-064 HR and QA external Soul App reference extraction

- **status**: pending
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-12 21:00
- **plan**: PLAN-288
- **relatesTo**: FEAT-060, FEAT-061, FEAT-062, FEAT-063, apps/web, apps/api, packages/shared, packages/component

## 背景

AIWorker 需要用真实 vertical apps 验证 Soul App 架构，而不是只完成抽象协议。HR 已经有
较成熟的专业工作台，是第一个外部化候选。QA 是一阶段目标中和 HR 并列的第二个垂直
应用，应作为不同领域形态的对照：HR 偏人和 lifecycle，QA 偏 release、test matrix、
defect evidence 和 release gate。

## 目标

把 HR 和 QA 建成首批 reference Soul Apps，证明它们既能独立部署，也能挂载进 Host。

具体目标：

1. 将现有 HR workbench 迁移为 `aiworker-hr` reference app。
2. 建立 `aiworker-qa` reference app，覆盖 release gate/test matrix/defect evidence。
3. 两个 app 都使用同一个 `soul-app/v1` manifest 和 SDK。
4. 两个 app 都能 standalone 运行，也能 Host mounted。
5. Host core 不出现 HR/QA 专属分支。

## 非目标

- 不一次性外部化 PM/DevOps/finance/legal/ops。
- 不实现真实 ATS/CI/Jira/GitHub connector 写操作；第一版可使用 broker mock 或 read-only evidence。
- 不让 HR/QA app 自行维护 engine runtime。

## 验收标准

- HR app 保留 People/Profile Workbench 的主体验，独立于 Host 内部 renderer registry。
- QA app 有完整 release workspace、test matrix、defect evidence、release gate artifact 和 review surface。
- Standalone HR/QA 能完成 workspace/session/artifact/review smoke。
- Host mounted HR/QA 能通过 app registry 启用并出现在 Worker/Soul 入口。
- 禁用 HR/QA app 后 Host 仍可运行其他 generic Soul fallback。
- 文档给出 HR/QA app repository/package 边界和维护方式。

## 调查结论

- HR workbench 已经从通用 Worker Studio 中抽出模块结构，是外部化的最佳起点。
- QA 尚未拥有同等专业工作台，适合作为验证协议是否真的跨领域的第二个 reference app。

## 备注

本功能是架构实证，不是 UI 阶段计划；交付必须同时证明 standalone 与 Host mounted。
