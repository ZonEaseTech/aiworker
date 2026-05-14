# PLAN-200 Worker review promotion surface

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 18:44
- **approvedAt**: 2026-05-09 18:44
- **completedAt**: 2026-05-09 18:58
- **relatedTask**: REFACTOR-034

## Current State

现有能力分布：

- `BrainCaseService` 从 Brain Journal 投影 review decision、outcome、evidence、risk、
  lessons。
- `BrainInboxService.proposeFromTask()` 从 lesson candidates 创建 pending
  `BrainAdmissionProposal`。
- API 目前挂在 `/api/worker/cases`。
- CLI 目前挂在 `case ...` 与 `lessons propose ...`。
- Web 的 CasesPanel 可以 rerun，也能调用 lesson proposal。

问题不是能力缺失，而是产品入口仍是治理术语。S6 需要建立 operator 默认使用的
review/promote 语言层。

## Proposal

1. Add product-facing review API
   - 新增 `apps/api/src/worker/reviews/routes.ts`，复用 `BrainCaseService` 和
     `BrainInboxService`。
   - response 使用 `{ reviews }`、`{ review }`、`{ promotion }` 等 product-facing key。
   - `lessons/promote` 只创建 pending proposals，不 apply。

2. Add CLI review commands
   - 在 `apps/cli/src/commands/worker/case.ts` 增加 review wrapper functions。
   - 注册 root/canonical `review list/show/rerun/promote`。
   - root help 把 review 放到默认 workbench 回路，旧 case/lessons 保留但降级。

3. Update worker web language
   - `CasesPanel` 标题改为 Reviews。
   - 按钮文案改为 Promote lessons。
   - API client 新增 `promoteReviewLessons()`，hook 改用新 route。
   - Workbench panel 的 “Case review” 改为 “Run review”。

4. Keep safety boundary
   - promotion 结果仍是 pending admission proposals。
   - approval/apply 仍由现有 admission state machine 管控。

## Risks

- **Dual surface drift**: S6 新增 review surface 同时保留 case surface；S7 必须清理默认文案和重复入口。
- **False persistence wording**: promotion 不能暗示 durable memory 已写入，只能说明 pending proposals。
- **Web copy regression**: 主路径应隐藏 Brain/Gate 术语，但 admin/debug route 可继续保留。
- **OpenAPI drift**: 新 `/reviews` paths 需要同步 doc registry。

## Verification

- `bun run --filter '@zonease/aiworker-core' test -- src/worker/brain/cases/service.test.ts src/worker/brain/inbox/service.test.ts`
- `bun run --filter '@zonease/aiworker-api' test -- src/worker/reviews/routes.test.ts src/modes/worker.openapi.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test -- src/commands/worker/case.test.ts src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/features/cases/cases-panel.test.tsx src/worker/features/workbench/workbench-panel.test.tsx`
- relevant typecheck/build if changed package requires it
- `git diff --check`
- code-review-graph change review

## Progress

- 2026-05-09 18:44：完成现状调查；确认底层复盘/lesson/admission 能力已存在，本 slice
  聚焦 product-facing review/promote surface。
- 2026-05-09 18:58：完成 review API、CLI review commands 与 Web Reviews /
  Promote lessons 文案及调用收敛；promotion 仍只创建 pending proposals，不自动写入
  durable memory。
