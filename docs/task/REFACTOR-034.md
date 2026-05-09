# REFACTOR-034 Add worker review promotion surface

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 18:44
- **claimedAt**: 2026-05-09 18:44
- **completedAt**: 2026-05-09 18:58
- **plan**: PLAN-200
- **relatesTo**: REFACTOR-026, PLAN-192, packages/core/src/worker/brain/cases/service.ts, packages/core/src/worker/brain/inbox/service.ts, apps/api/src/worker/cases/routes.ts, apps/cli/src/commands/worker/case.ts, apps/web/src/worker/features/cases/cases-panel.tsx

## 背景

S5 已经把 Worker Admin 第一屏改成 workbench，但 run 后复盘仍暴露为旧术语：

- Web 侧主 route 仍叫 Cases；
- API 只有 `/api/worker/cases/:taskId/lessons/propose`；
- CLI 默认命令是 `case` / `lessons propose`；
- 输出文案仍频繁出现 Brain Engine、Brain admission、Case File 等治理词。

底层能力已经存在：`BrainCaseService` 投影 review/evidence/lessons，
`BrainInboxService` 能把 lesson candidates 变成 pending admission proposals。S6
需要把它包装成 product-facing 的 review / promotion surface。

## 目标

1. 增加 worker review API：
   - `GET /api/worker/reviews`
   - `GET /api/worker/reviews/:taskId`
   - `POST /api/worker/reviews/:taskId/rerun`
   - `POST /api/worker/reviews/:taskId/lessons/promote`
2. CLI 增加 root/canonical review commands：
   - `aiworker review list/show/rerun/promote`
   - `aiworker worker review list/show/rerun/promote`
3. Web 默认文案从 Case/Propose lessons 改成 Review/Promote lessons，并使用新 promotion API。
4. 保留现有 case/brain 入口，作为 S7 cleanup 前的 secondary surface。
5. 不改变 admission apply/approve 的安全状态机；promotion 只创建 pending proposals。

## 非目标

- 不自动 approve/apply durable memory。
- 不删除旧 `/cases` API 或 `case` CLI。
- 不重写 Brain reviewer / quality gate 逻辑。
- 不把 lesson promotion 变成领域 workflow engine。

## 验收标准

- 新 review API 路由返回 review projection，并能从 lessons 创建 pending promotion proposals。
- CLI review commands 输出 product-facing `review` / `promotion` JSON。
- Worker Web 的 review 面板默认使用 “Promote lessons” 文案和新 API。
- focused core/API/CLI/web tests、typecheck、diff check、CRG 审查通过。

## 结果

- 新增 `/api/worker/reviews` product-facing API，覆盖 list/show/rerun/promote。
- 新增 root/canonical `review` CLI commands，输出 `review`、`reviews`、`run`、
  `promotion` 等默认 workbench 语言。
- Worker Web 的复盘入口改为 Reviews / Promote lessons，并调用新 promotion API。
- 旧 case/lessons surface 暂时保留为 secondary/debug 入口，等待 S7 cleanup 收敛。
