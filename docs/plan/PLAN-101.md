# PLAN-101 Brain admission MVP for scope assets

- **status**: completed
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: 2026-05-04 16:10
- **completedAt**: 2026-05-04 16:50
- **relatedTask**: FEAT-054

## 现状

Architecture 已经规定 generated memory / brain skill / policy proposal 写入
filesystem 前必须经过 operator approval，但尚未落 worker.db schema、CLI/API
approval surface，也没有把 artifact / Soul proposal 纳入统一 admission 模型。

## 方案

落地 Brain admission MVP：

1. 新增 `brain_admission_proposals` 与 `brain_admission_decisions` worker.db 表。
2. Proposal 必须包含 `kind`、`target`、`summary`、`evidence`、`risk`、
   `confidence`、`rollback`、`payload`、`status`。
3. CLI 提供 `aiworker brain admission list/show/approve/reject`。
4. Approval materializer 第一版只支持低风险、明确目标的 filesystem brain patch 或
   artifact registry status update。
5. 高风险 proposal 默认 pending；reject / approve 都写 audit 决策记录。

## 范围

- worker.db migration。
- shared schemas。
- core admission service。
- CLI approval commands。
- focused tests。

## 非范围

- 不做 Worker Admin UI（由 PLAN-103 收口）。
- 不做自动审批。
- 不把 admission proposal 全文复制到 fleet.db。
- 不复用 executor capability / MCP / plugin 通路。

## 风险

1. Admission 太重会损害轻量 UX；MVP 只拦 generated durable changes，不拦只读 inspection。
2. Materializer 写 filesystem brain 有破坏性风险；必须保留 rollback / dry-run / diff preview。
3. 高风险 HR/finance proposal 涉及敏感材料；CLI 输出需要避免直接打印原文。

## 验证

- migration tests。
- admission service unit tests。
- CLI command tests for list/show/approve/reject。
- secret-like output redaction tests。
- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`

## 进度

- 2026-05-04 16:10：用户批准 admission MVP（worker.db 双表 + 状态机 + memory-add 自动 materialize + 默认 redact）。
- 2026-05-04 16:50：实现完成。
  - shared `packages/shared/src/brain/admission.ts`：`BrainAdmissionProposal` zod schema（id / scopeId / soulId / kind / target / summary / evidence[] / risk / confidence / rollback / payload / status / createdAt / updatedAt）+ `BrainAdmissionDecision` schema + `brainAdmissionProposalInputSchema`（默认 risk='high'）+ `brainAdmissionMemoryAddPayloadSchema`（body / topic / indexEntry）+ `redactSecretLikeValues`（递归把 token / apiKey / password / secret / bearer / auth / credential 字段值替换成 `<redacted>`，summary / rollback / target 不动）+ `redactBrainAdmissionProposal` + `MATERIALIZED_PROPOSAL_KINDS=['memory-add']` 列表。
  - storage 加 `brain_admission_proposals` + `brain_admission_decisions` 两表，前者带 `(status, kind)` / `scope_id` / `created_at` 三索引，后者带 `proposal_id` (FK + index) / `decided_at` 索引；`bun run db:generate:worker` 生成 `0006_fair_jetstream.sql`。
  - core `packages/core/src/worker/brain/admission/service.ts`：`BrainAdmissionService` 实现 `propose / get / requireById / list / count / approve / reject / apply / listDecisions`，状态机严格守 `pending → approved | rejected → applied | failed`，`apply` MVP 仅对 `memory-add` 落 filesystem，其他 kind 返回 `unsupported` 不改状态；`list` / `get` 默认 `redactSensitive=true`；`apply` 默认 dry-run，`commit: true` 才写文件 + 更新状态 + 写决策行；写 IO 失败时 status → failed + 决策行带 `failureReason`。
  - CLI 新增 `aiworker brain admission list/show/approve/reject/apply`（root + worker namespace 双注册）：`--decided-by` 必填（用于 audit），`approve` / `reject` 写决策原因；`apply` 默认 dry-run，`--commit` 真正落 MEMORY.md / memories/<topic>.md；`--show-sensitive` 才显示 secret-like 字段。`apply` 通过 `resolveBrainHome(ctx.workerId)` 决定写入路径，project scope 落 `<project>/.aiworker/`，user scope 落 `<home>/workers/<id>/brain/`。`apps/cli/src/aiworker.test.ts` + `help.ts` 同步注册元数据。
  - 测试：shared `admission.test.ts` 16 个 case；storage `EXPLAIN QUERY PLAN` 命中四索引；core `service.test.ts` 15 个 case 覆盖 propose / risk default / approve+reject 状态机 / 重复 id / list+count 过滤 / dry-run / commit / topic+index entry / unsupported kind / 失败 payload；CLI `brain-admission.test.ts` 12 个 case（默认 redact / unlock / 过滤 / 状态机 / dry-run / commit / unsupported / id 必填）。
  - 边界遵守：admission 全文不写 fleet.db；不复用 executor MCP / engine plugin 通路；redaction 默认开；MVP 只 materialize `memory-add`。
  - 验证：`bun run --filter '@zonease/aiworker-shared' test` 110 pass、`bun run --filter '@zonease/aiworker-storage-sqlite' test` 19 pass、`bun run --filter '@zonease/aiworker-core' test` 546 pass、`bun run --filter '@zonease/aiworker-cli' test` 153 pass、`bun run typecheck` 全 workspace 通过、`bun run lint` 通过。
