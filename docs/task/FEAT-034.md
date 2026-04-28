# FEAT-034 Phase 2 — Fleet UI MVP

- **status**: completed
- **priority**: P1
- **owner**: BKD/oq32jpkm (worktree)
- **createdAt**: 2026-04-27 18:35
- **startedAt**: 2026-04-27 19:35
- **completedAt**: 2026-04-28 06:55

## 描述

PLAN-022 Phase 2 落地。在 FEAT-033 完成的双视角骨架之上，实现 fleet 视角 MVP。所有数据通道仅经 gateway WS（`/ws`），永不调 worker REST。

### 验收标准

1. `/admin/`（fleet 入口）：workers 列表，按 `online/offline` 颜色区分，行级显示 `displayName`、`workerId`、`lastSeenAt`、`baseUrl`，复用搬迁后的 `workers-list` 组件。
2. `/admin/workers/launch`：launch wizard（`workers.launch`），输入 `displayName` + 可选 `forceId`，成功后落到列表，把 deviceToken 一次性展示给 operator（与 CLI `aiworker pair show-token` 同口径，不存浏览器）。
3. `/admin/workers/pair`：pair wizard（`workers.pair`），输入 `workerBaseUrl` + `bootstrapToken` + `displayName`，成功后落到列表。
4. workers 列表行级动作：`workers.remove`（确认对话）、`token.rotate`（确认 + 新 token 一次性展示）、`workers.stop`（不删除 fleet row）。
5. `/admin/enroll`：pending OTP 队列（`enroll.list` 30s polling，并订阅 `enrollment.pending` event 实时刷新），行级 approve/reject（`enroll.approve` / `enroll.reject`）。approve 后展示新 worker 的 deviceToken。
6. `/admin/audit`：fleet.db `audit_events` 浏览，分页（默认 50 条），按 type/eventTime/workerId 过滤。
   - **前置**：gateway proto 缺 `audit.list({ limit, before, type?, workerId? })`，本 phase 内子 task 完成 proto + gateway server-side 实现 + 单测覆盖。
7. `/admin/presence`：dashboard 卡片，`system.presence` 30s polling 显示 online workers 总数、最后心跳分布、今日新增 enrollment 数。
8. fleet 视角的 `gateway-client.ts`（在 `src/fleet/lib/`）独立，复用现有 `lib/gateway-client.ts` 的 reconnect/event-bus 实现，但要确认 multi-subscriber 在多个 React 组件订阅同一 channel 时不互相干扰（先写 unit test）。
9. 不依赖任何 worker REST client；ESLint 应能拦回退耦合。
10. fleet bundle 在 gateway 默认 9218 + dev mode 5173 都能跑通。

### 不做（留给后续 Phase）

- 单 worker 的 config / secrets / cron / approval / chat 自管 UI（Phase 3 worker 视角）。
- 跨 worker 的 cron 总览、approval 总览、batch 操作（Phase 5）。
- i18n / dark mode（Phase 5）。

## 进行时描述

实现 fleet 视角 MVP（workers 列表 + enrollment + audit + presence）

## 依赖

- **blocked by**: FEAT-033
- **blocks**: REFACTOR-009

## 笔记

- 所有 fleet 操作都是 `operator-to-gateway` routing；如果某个动作走 `operator-to-node`（如 `workers.stop` / `workers.info`），UI 应在 worker offline 时优雅降级（disabled + tooltip 说明）。
- `audit.list` proto 扩展时同步把 audit event type enum 加到 `packages/gateway-proto/src/events.ts`，避免硬编码 magic string。
- `tokens.rotate` 与 `workers.launch` / `enroll.approve` 返回的 deviceToken 都是一次性可见的明文，UI 必须用 `<Dialog>` 强制 operator 显式 copy + 关闭，关闭后立刻从 React state 清掉，不要存 sessionStorage。
- 复用现有 `apps/web/src/features/workers/components/`：`workers-list.tsx`、`register-wizard.tsx` (→ pair wizard)、`create-wizard.tsx` (→ launch wizard) 搬迁到 `src/fleet/features/workers/`。删除 `secrets-panel`、`test-panel`、`config-editor`、`worker-shell`（这些是 worker 视角，Phase 3 用）。
- 单 worker 的 config 入口仍保留在 fleet UI，但只做「跳转到该 worker 的 `/admin/`」按钮（拼接 `worker.baseUrl + /admin/`），不在 fleet UI 内嵌 worker 自管面板。这是 fleet/worker 独立性的关键边界。

### BKD handoff report

- 接手原因：Claude Code 在验证末段命中用量上限，worktree 尚有未提交改动；Codex 接手完成 lint 修复、自审、文档收口与提交前验证。
- 已实现：fleet-only `gateway-client` API 包装；workers list / pair / launch / remove / token.rotate / stop；`/admin/enroll` pending OTP 列表 + `enrollment.pending` 实时刷新；`/admin/audit` + `audit.list` proto/server/persistence/tests；`/admin/presence`。
- 自审结果：发现并修复 1 个 P1，`audit.list` action prefix 使用 SQL `LIKE` 时 `%` / `_` 未转义会误匹配；已改为 `LIKE ... ESCAPE '\\'` 并补 `%` / `_` 字面量测试。
- 验证：`bun run typecheck`、`bun run test`、`bun run --filter '@zonease/aiworker-web' build`、`bun run lint` 全部通过；额外重跑 `@zonease/aiworker-gateway` test/typecheck 覆盖 audit 修复。
