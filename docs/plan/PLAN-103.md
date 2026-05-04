# PLAN-103 Worker/Fleet Brain surface closeout

- **status**: completed
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: 2026-05-04 17:45
- **completedAt**: 2026-05-04 19:00
- **relatedTask**: FEAT-054

## 现状

Worker Admin 已有 brain test card，Fleet topology 已明确 gateway 不复制 brain /
conversation / secret 内容。但 Soul modules、scope manifest、artifact registry 与
admission MVP 落地后，需要一个后置收口，确保这些能力在 UI/API/docs 中可见，
同时不破坏 worker 数据面和 fleet 控制面的边界。

## 方案

做 Worker/Fleet Brain surface 收口：

1. Worker Admin 展示 scope manifest、Soul module、artifact summary、pending
   admissions、brain health、retention warnings 和 brief preview 入口。
2. Worker REST 暴露只读 brain summary 与 admission review endpoints。
3. Fleet UI 只显示 worker 级 brain health / pending count / last checked，不复制
   proposal 全文、artifact 内容或 canonical brain。
4. docs/architecture / README / docs/cli 收口整条路线，明确前置准备和后置边界。
5. 运行全量或接近全量 gate，作为 FEAT-054 的 epic 收口。

## 范围

- Worker Admin Brain surface。
- Worker REST read-only summary / admission endpoints（如 PLAN-101 已提供底层 service）。
- Fleet summary display。
- docs closeout。
- focused + full verification。

## 非范围

- 不做跨 worker brain sync。
- 不在 fleet.db 存 brain/admission/artifact 正文。
- 不做 organization-level policy marketplace。

## 风险

1. UI 容易诱导 gateway 复制 worker brain 内容；API 和前端边界必须按 worker-local / fleet-summary 分层。
2. Admission review UI 涉及敏感摘要；默认只展示 summary / risk / target，原文按需展开。
3. closeout 可能跨度较大；若 PLAN-097..102 任一未完成，本 plan 应保持 draft。

## 验证

- Worker API focused tests。
- Worker/Fleet UI component tests。
- web dual-bundle build。
- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`

## 进度

- 2026-05-04 17:45：用户批准 epic 收口方案（A1 完整 UI + B 写端点强制 bearer-auth 与 dry-run 默认 + C fleet 严格只持 pointer）。
- 2026-05-04 19:00：实现完成。
  - shared 扩 `WorkerInfo.brainSummary`：scope manifest 状态 + artifact `byStatus` + admission `byStatus` + `lastUpdatedAt`，全部聚合，无 payload / artifact ref。
  - core 新增 `packages/core/src/worker/brain/summary.ts:buildBrainSummary`，从 worker.db 直接 group-by 计数；`buildInfo` 注入 `brainSummary`。
  - apps/api 新增 `apps/api/src/worker/brain/routes.ts`：`GET /summary`、`GET /admission` + `:id`、`POST /admission/:id/{approve,reject,apply}`、`GET /artifacts` + `:id`。bearer-auth 由顶层 `/api/worker/*` 中间件统一守门；写端点 `apply` 默认 dry-run（body `commit:false`）；`?showSensitive=true` 才解锁 redact。挂在 `/api/worker/brain` 路由 prefix。12 个 case route test 覆盖 summary / list redaction / show 404 / approve/reject / apply dry-run+commit / artifacts redact / 409 invalid transition / 项目 scope manifest 解析。
  - apps/web Worker Admin 新增 `/brain` 视图（`features/brain/brain-panel.tsx` + `routes/brain.tsx`）：scope manifest 摘要卡 + admission 审批列表（approve / reject / apply / apply --commit 四个按钮，要求填 `--decided-by`）+ redacted artifact 列表。Nav 增加 Brain 入口。`api.ts` + `lib/hooks.ts` 加 `getBrainSummary` / `listAdmissions` / `getAdmission` / `approveAdmission` / `rejectAdmission` / `applyAdmission` / `listArtifacts` 客户端与 TanStack Query hooks。
  - apps/web Fleet UI worker detail 加 "Brain (PLAN-103)" 卡片：明确 fleet 控制面不持 admission / artifact state，仅深链跳转 `/w/<workerId>/#/brain`。维持 fleet UI 不消费 worker brain 数据的边界。
  - docs/architecture.md：Brain admission roadmap 段加完成标记 + Approval surface 改为 PLAN-101/103 已实现描述 + MVP materializer 范围说明；Worker/Fleet aggregation surface 段更新 `/api/worker/info` 的 `brainSummary` 字段说明 + 加 “Brain 数据面隔离（PLAN-103）” 子段。docs/cli.md `aiworker init` 后步骤补 brain artifacts / admission / brief 三组命令示例。
  - 测试：api 12 case；web vitest 全 16 file 59 test 通过；shared / fs-layout / storage / core / cli / gateway-proto / gateway / web / api 共 9 个 workspace 测试全绿。
  - 边界遵守：fleet.db 没有新增表 / 列 / 行；fleet UI 不读取 worker brain 数据；admission write endpoints `apply` 默认 dry-run；redact 默认开；MVP materializer 仅 `memory-add`。
  - 验证：`bun run check` ✅、`bun run test` 9/9 workspace 全绿（shared 120 / fs-layout 20 / gateway-proto 19 / storage 19 / gateway 148 / core 554 / web 59 / api 83 / cli 159 = 1181 tests）、`bun run build` ✅、`git diff --check` ✅。
