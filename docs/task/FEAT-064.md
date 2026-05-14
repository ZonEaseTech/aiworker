# FEAT-064 HR and QA external Soul App reference extraction

- **status**: completed
- **priority**: P0
- **owner**: codex
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
- FEAT-060 已有 HR/QA manifest fixtures，FEAT-062/063 已有 SDK、standalone/mounted
  runtime 和 broker boundary；FEAT-064 可以先以 workspace package 形式建立
  `@zonease/aiworker-hr` / `@zonease/aiworker-qa` reference apps，再由后续发布阶段决定
  是否拆仓。

## 备注

本功能是架构实证，不是 UI 阶段计划；交付必须同时证明 standalone 与 Host mounted。

## 完成记录

- 2026-05-13 00:32: 新增 `@zonease/aiworker-hr` 和
  `@zonease/aiworker-qa` workspace reference app packages。
- HR package 提供 People/Profile Workbench 边界说明、HR manifest-backed app
  definition、runtime/artifact/review/connector/ui protocol handlers，以及
  standalone / Host-mounted smoke tests。
- QA package 提供 release/test-suite 领域边界、release gate / regression matrix
  app definition、protocol handlers，以及 standalone / Host-mounted smoke tests。
- 两个 reference apps 都只依赖 Soul App SDK 和 shared protocol/fixture，不 import
  Host API、CLI、Worker Web 私有模块、raw DB、engine adapter、connector token 或 vault。

## 验证

- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
