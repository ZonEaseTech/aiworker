# FEAT-035 Phase 3 — Worker UI MVP

- **status**: pending
- **priority**: P1
- **owner**: (未分配)
- **createdAt**: 2026-04-27 18:35

## 描述

PLAN-022 Phase 3 落地。在 FEAT-033 完成的双视角骨架之上，实现 worker 视角 MVP。worker UI 由每个 worker 自身的 apps/api 托管，所有数据通道仅经 worker REST + bearer-auth，永不调 gateway WS。本 phase 与 FEAT-034 可并行。

### 验收标准

1. `/admin/`（worker 入口）：worker 自管面板。顶部显示 `workerId`、`displayName`、引擎可用性、当前 config version；左侧 nav 跳到 config / secrets / test / cron / approvals / chat。
2. `/admin/config`：config viewer + edit 表单（`GET/PUT /api/worker/config`）。复用现有 `config-editor/` 组件。乐观锁基于 `If-Match` version。
3. `/admin/secrets`：secrets CRUD（`GET/PUT/DELETE /api/worker/secrets`）。复用 `secrets-panel.tsx`。明文 value 仅在用户输入时 in-memory，提交后立刻清。
4. `/admin/test`：brain / executor / channel test 触发器（`POST /api/worker/{brain,executor,channels}/test`）。复用 `test-panel.tsx`。结果以行级状态展示，error 全文可展开。
5. `/admin/cron`：cron CRUD（`GET/POST/PATCH/DELETE /api/worker/cron`）。
   - **前置**：worker apps/api 当前可能没暴露 cron REST（cron.* 主要走 gateway proto），如缺则在本 phase 加 worker 端 REST surface（复用 `packages/core` 的 cron 实现），不动 gateway 侧。
6. `/admin/approvals`：per-tool approval 队列（`GET /api/worker/approvals` + `POST /api/worker/approvals/grant`）。复用 server-side 现有 approval 实现。
7. `/admin/chat`：单 worker 聊天界面，发消息走 `POST /api/worker/orchestrator/chat`，订阅 `GET /api/worker/events`（SSE 或 WS）实时显示 streaming response。复用现有 orchestrator routes。
8. worker REST client（`src/worker/lib/api.ts`）：`fetch()` + `Authorization: Bearer <deviceToken>`。token 来源：
   - loopback：worker bearer-auth middleware 已放行 loopback，UI 不需要 token；
   - 公网（叠 basic-auth）：UI 启动时从 URL fragment `#token=...` 一次性塞 sessionStorage，立即清掉 location.hash；不写 localStorage 也不写 query string。
9. 不依赖任何 gateway WS client；ESLint 应能拦回退耦合。
10. worker bundle 在 worker 默认 9217 + dev mode 5173 都能跑通；loopback 访问免 token，公网访问触发 basic-auth 弹窗。

### 不做（留给后续 Phase）

- fleet 视角的 workers 列表、enrollment、audit（Phase 2）。
- cross-worker dashboard、跨 worker batch 操作（Phase 5）。
- i18n / dark mode（Phase 5）。

## 进行时描述

实现 worker 视角 MVP（config + secrets + test + cron + approvals + chat）

## 依赖

- **blocked by**: FEAT-033
- **blocks**: REFACTOR-009

## 笔记

- bearer-auth 路径：worker UI 装载时检查 `window.location.hash`，如有 `#token=...` 则提取 → sessionStorage → `history.replaceState(null, '', location.pathname + location.search)` 清掉 hash。后续所有 fetch 从 sessionStorage 取 token。
- 公网部署的 basic-auth 由 Caddy 反代承担（与 gateway 共用约定）；BUG-007 + BUG-019 的 fail-closed 模式确保 worker apps/api 在未叠 basic-auth 的非 loopback 部署直接 refuse to start。
- 复用 `apps/web/src/features/workers/components/`：`config-editor/`、`secrets-panel.tsx`、`test-panel.tsx`、`activity-panel.tsx`、`worker-shell.tsx` 搬迁到 `src/worker/features/`。
- chat 流式可以先用 SSE（worker apps/api 已有 `/api/worker/events`），WebSocket 如必要再加。
- `/admin/` 不显式带 workerId，因为 worker 自身就知道是谁（`/api/worker/info` 返回）。
- approval grant 的 ergonomics：界面要 prominent 提示新 pending approval，避免被 operator 错过。可借鉴 CLI `aiworker approvals` 的格式。
