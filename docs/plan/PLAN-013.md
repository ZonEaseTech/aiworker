# PLAN-013 aim CLI + WS gateway (full replacement of dashboard REST)

- **status**: completed
- **createdAt**: 2026-04-24 15:45
- **completedAt**: 2026-04-24 22:30
- **relatedTask**: REFACTOR-003
- **blockedBy**: PLAN-012
- **commits**: daf7ba9, b56abf8, 32d59b0, 8ecd76a, 2021767, dc2d277, 3d9637f, f759744

## Summary

Replace the dashboard's HTTP REST surface (`apps/api/src/dashboard/**`) with a typed WebSocket gateway, modelled on OpenClaw's `operator/node` protocol. Introduce `aim` CLI as the operator-side entry, alongside the existing `aiw`. Web UI refetters to WS. Pre-production: break all REST endpoints, no compat shim.

## Sketch

- New app `apps/gateway/` — the WS server. Runs as `aim gateway start` (or `aiworker-gateway` binary once compiled). Binds `127.0.0.1:3000` by default, accepts remote connections with token pairing.
- New `aim` binary in `apps/cli/`:
  - `aim pair <worker-url>` — one-shot WS handshake; prints + stores token pair.
  - `aim workers list / info / start / stop`
  - `aim chat <worker-id> "message"` — ingest via WS `chat.send`.
  - `aim config get|set <worker-id>`
  - `aim logs <worker-id> --follow`
  - `aim gateway start|status|stop`
- Workers connect to the gateway as `role: node` (replaces "register worker" paste-token flow). Gateway maintains a registry in `fleet.db` (workerId + baseUrl + pairing token + last_seen).
- Typed protocol in `packages/gateway-proto` — JSON Schema emitted for both TS and runtime validation.
- **Delete** `apps/api/src/dashboard/**`, `apps/api/src/modes/dashboard.ts`, `apps/api/src/config/dashboard.ts` (merged into gateway config), all `/api/workers/*` REST routes.
- Web UI (`apps/web`): replace `src/lib/api.ts` fetch layer with a typed WS client. Existing pages stay; swap data source.

## Out of scope (handled elsewhere)

- Channel envelope normalisation → PLAN-014.
- Per-tool approvals → PLAN-014.
- `packages/core` extraction → PLAN-015.

## Key risks (draft)

- R1 — WS reconnect / backoff ergonomics; ensure operators never silently lose updates.
- R2 — Browser WS auth (cookie vs Authorization header via query param); pick one.
- R3 — The `MANAGER_CAN_LAUNCH` docker supervisor flow (FEAT-023) currently runs in `dashboard/supervisor/`. PLAN-013 must port it to a `aim gateway launch <worker-id>` method.

## Outcomes

落地分 6 个 subtask，全部合入 main 分支：

- **S1（commit daf7ba9）** — 新增协议包 `@aiworker/gateway-proto`：`METHODS`（12）+ `EVENTS`（8）+ `Frame`（connect / request / response / event）的 zod schema + TS 类型。`operator-to-node` vs `operator-to-gateway` routing 字段在 method 定义上直接声明，gateway / aim / worker / web 四侧共享同一个 source of truth。
- **S2（commit b56abf8）** — 新 app `apps/gateway`：`Bun.serve(:3000, websocket)` 单入口；三件内存 registry（`NodeRegistry` / `OperatorRegistry` / `ForwardTable`）；鉴权 loopback + `INTERNAL_SHARED_SECRET`；`/health` 心跳；fleet.db 由 gateway 持有。
- **S3 / supervisor 搬家（commit 2021767）** — `apps/api/src/dashboard/supervisor/**` 整树迁到 `apps/gateway/src/supervisor/`；`workers.pair` / `workers.launch` / `token.rotate` 作为 `operator-to-gateway` handler 实现；`AIWORKER_GATEWAY_CAN_LAUNCH` 替换旧 `MANAGER_CAN_LAUNCH`。
- **S3 / aim CLI（commit 32d59b0）** — 新 bin `aim`：`gateway` / `pair` / `workers` / `chat` / `config` / `token` / `logs` 全套子命令；状态 `~/.aiworker/aim.json`（0600）；cac 两词子命令 argv 预处理。
- **S4（commit 8ecd76a）** — worker `gateway-client` node 模式：`aiw serve --gateway ws://...` 在 HTTP server 之外并行跑 WS 连接；dispatcher（入站 request）+ subscriber（出站 event）都走 `getRuntime()` 懒取，兼容 hot-reload；SIGTERM 两路径优雅关闭。
- **S5（commits dc2d277, 3d9637f, f759744）** — web 数据层切到 WS；`apps/api/src/dashboard/**` 整段删除；ops 层 Dockerfile + docker-compose.yml + .env.example 重写为 gateway 入口。
- **S6（本 commit）** — 文档 + changelog + deployment runbook 同步到 PLAN-013 终态。

保留不变量（验证过）：fleet.db / worker.db 物理隔离；AES-256-GCM 封 apiToken；bearer `timingSafeEqualStrings`；`worker_identity` / `worker_config` singleton `pk='default'`；`reloadRuntime` 串行化；evolution observer 离 hot path。

测试基线：`apps/api` 346（删 dashboard 相关 104 条）、`apps/gateway` 52（含 pair / launch / token.rotate 单测）、`apps/web` 24 + 13 skipped（REST fixture 待重写）；`bun run check` 全仓绿。

Follow-ups（不在本 plan 范围）：

- `scripts/deploy.ts` 的 `verify` 仍 grep `"status":"ok"`，需要切到 gateway 的 `"ok":true` 字段。
- PLAN-004 时代 dashboard 容器 serve 的 `/app/web` 静态资源仍留在镜像里（回退用）；后续版本可下线。
- web 上的 13 个 `.skip` 测试要基于 WS mock 重写。
