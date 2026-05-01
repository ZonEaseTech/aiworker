# AIWorker Architecture

## Monorepo Layout

```text
apps/
  api/          # Hono worker runtime (worker mode only)
  cli/          # aiworker (单二进制：worker-local + operator-remote + gateway 生命周期)
  gateway/      # WS 控制面：operator ↔ gateway ↔ node 三方协议枢纽
  web/          # React 19 双视角 SPA（fleet 走 gateway WS；worker 自管走 REST/SSE）
packages/
  shared/          # cross-layer types / constants / zod schemas
  gateway-proto/   # WS 协议纯类型 + zod：METHODS / EVENTS / Frame
  core/            # transport-agnostic worker runtime（@zonease/aiworker-core）
  storage-sqlite/  # fleet.db + worker.db schemas, drizzle configs, migrations
  fs-layout/       # user/project scope path resolver + worker/project layout bootstrap
```

- **`apps/api`** 只负责 worker 运行时（数据面）。`AIWORKER_MODE=worker` 仍保留以兼容运维脚本，但入口不再按模式分叉——`boot()` 一律构建 `createWorkerApp`。dashboard REST 已随 PLAN-013 整体下线。运行时业务（brain / executor / channels / orchestrator / cron / approvals / gateway-client / runtime / secrets / bootstrap / management 业务态）已物理抽离至 `packages/core`，apps/api 仅保留 Hono 路由 + middleware + bootstrap 装配（`@zonease/aiworker-api/bootstrap` 暴露给 `aiworker serve`），保持 transport 与业务的边界。
- **`apps/gateway`** 是新增的 WS 控制面，单入口 `Bun.serve(:9218)`，路径 `/ws` 承接 WebSocket 升级，`/health` 返回心跳。运行时持有 fleet.db（`registered_workers` + `audit_events`）并做 operator ↔ node 帧转发。见 `docs/gateway.md`。
- **`apps/cli`** 发布单枚 bin：`aiworker`。子命令树由 worker-local（dash-form）+ operator-remote（两词 form）+ gateway 生命周期 + `install systemd` 构成，共享 `cac` 解析器与 `@zonease/aiworker-core` 运行时复用（worker-local `aiworker serve` 额外从 `@zonease/aiworker-api/bootstrap` 取 Hono 入口）。状态文件按用法分流：worker-local 写 `worker.db`，operator-remote 写 `~/.aiworker/aiworker.json`。
- **`apps/web`** 产出两套物理独立 bundle：`dist/fleet/` 由 gateway 托管，fleet 视角只通过 gateway WS (`/ws`) 访问 fleet.db / worker 指针；`dist/worker/` 由每个 worker 自身托管，worker 视角只通过本机 `/api/worker/*` REST/SSE + bearer-auth 管理 worker.db / runtime。源码按 `src/fleet/`、`src/worker/`、`src/shared/` 分区，ESLint 与 CI 守住跨视角 import / transport 边界。
- **`packages/gateway-proto`** 是协议的纯类型 + 运行时校验层。不依赖任何网络框架，所有 METHODS / EVENTS / Frame schema 都在这里定义，CLI / web / gateway / worker 四侧共用。
- **`packages/core`** 是 transport-agnostic 的 worker runtime（PLAN-015 §S1 物理抽离）。封装 brain provider、executor provider、channel adapter、orchestrator、cron、approvals、gateway-client、secrets、bootstrap、management 业务态等所有运行时业务；公共面 `packages/core/src/index.ts` 同时被 `apps/api` 路由、`apps/cli` 与 gateway node 接入复用。**不**依赖 `hono` / `@hono/*` / `@scalar/*`——边界由 ESLint `no-restricted-imports` 守，CI 拦下任何回退到 transport 层耦合的尝试。
- **`packages/storage-sqlite`** 是 fleet.db 与 worker.db 的唯一 schema 源。通过 subpath `./fleet` 与 `./worker` 保持数据域边界；`defaultFleetMigrationsFolder` / `defaultWorkerMigrationsFolder` 通过 `import.meta.url` 解析，避免调用方硬编码 `./drizzle/...`。
- **`packages/fs-layout`** 管理 user scope 的 `~/.aiworker/workers/<id>/` 与 project scope 的 `<project>/.aiworker/` 目录布局。gateway 与 worker 都复用它解析 `AGENT.md` / `SOUL.md` / `USER.md` / `config.yaml` / `brain/` 等路径。

## 部署模型（PLAN-016）

部署形态降级为三档并列，docker 不再是默认：

| 形态 | 适用 | 入口 | docker | 公网 |
|------|------|------|--------|------|
| **裸跑** | 开发 / 单机 | `aiworker gateway start` / `aiworker serve` 前台 | 无 | 无 |
| **systemd** | Linux 服务器长跑 | `aiworker install systemd [--user\|--system]` 写 unit + `enable --now` | 无 | 可选叠加 |
| docker compose | 懒人快速试用 / per-worker 容器隔离 | `ops/compose/docker-compose.yml`（GHCR 镜像） | 有 | 必要时叠加 |

公网 HTTPS（Cloudflare orange-cloud + Caddy `:80 → 127.0.0.1:9218` + GHCR + `scripts/deploy.ts` aissh 流程）单独拆到 [`deployment-public-https.md`](./deployment-public-https.md)，仅当需要把 channel webhook 暴露公网时才叠加；详见 [`deployment.md`](./deployment.md)。

## 双视角 Web UI（PLAN-022）

`apps/web` 是一个源码工程、两个部署面：

```text
apps/web/src/fleet/*          apps/web/src/worker/*
        │                             │
        ▼                             ▼
dist/fleet/                    dist/worker/
gateway :9218 /admin/          worker :9217 /admin/
        │                             │
        ▼                             ▼
gateway WS /ws                 worker REST/SSE /api/worker/*
fleet.db + node routing        worker.db + local runtime
```

- **Fleet UI** 是 operator console：列 workers、presence、enrollment、audit，并通过 gateway WS 协议发起 fleet 控制操作。它不直接 fetch worker 的 `/api/worker/*`，也不读取 worker.db。
- **Worker UI** 是单 worker 自管面：config、secrets、test、cron、approvals、chat 均直连宿主 worker 的 `/api/worker/*`。公网叠 basic-auth 时，UI 只从 `#token=...` 取一次 bearer 写入 `sessionStorage` 并立即清除 URL fragment；loopback 访问由 worker bearer-auth middleware 放行。
- **Shared** 只放 UI primitives、query client、theme、通用 fetch helper等无业务归属的基础设施。`src/shared/**` 不反向依赖任一视角的 `features/`、`routes/`、`lib/` 或 API 包装层。
- **守门**：ESLint 禁止 fleet/worker 互相 import、禁止 worker 引入 gateway proto、禁止 fleet 直接 fetch worker REST；CI 额外跑 web lint / test / dual-bundle build / bundle size report / shared import cycle scan。

## Filesystem source of truth (PLAN-012)

每个 worker 持有一颗独立子树（根为 `AIWORKER_HOME`，默认 `~/.aiworker`）：

```text
~/.aiworker/
  aiworker.json                # operator 本地状态（gatewayUrl / deviceId / deviceToken / defaultWorkerId，0600）
  aiworker-gateway.pid         # 本机 aiworker gateway daemon pid（若启动）
  aiworker-gateway.log         # 本机 aiworker gateway daemon 日志
  workers/<workerId>/
    AGENT.md                   # persona / role doc
    SOUL.md                    # voice + style guide
    USER.md                    # user profile the agent maintains
    config.yaml                # redacted worker config 镜像（advisory，DB 仍为权威）
    brain/
      MEMORY.md                # human-readable memory index
      memories/*.md
      skills/<n>/SKILL.md
    worker.db                  # SQLite identity + FTS + runtime state
    workspaces/                # per-conversation ephemeral workspaces
```

project scope 下，团队共享上下文落在 `<project>/.aiworker/`：

```text
<project>/.aiworker/
  AGENT.md
  SOUL.md
  USER.md
  MEMORY.md
  ROLLUP.md
  policy.json
  toolsets.json
  capability-packs.json
  skills/
  memories/
  mcp.json                     # brain/runtime MCP descriptor, not engine config
  executor-capabilities.json   # executor-native projection manifest
  local/                       # gitignored: worker.db / .env / workspaces
```

- **Skills / memories** 读写统一过 `FilesystemBrainProvider`（PLAN-012 将旧 `HermesProvider` 改名并把 HTTP 依赖全部拆掉）；filesystem 是权威，SQLite 只负责 identity 与可索引状态。
- **Capability 边界**：`.aiworker/mcp.json`、`skills/`、`toolsets.json`、`capability-packs.json` 属于 brain/runtime project capability 或 observe-only descriptor；`.aiworker/executor-capabilities.json` 属于 executor-native projection。Codex / Claude Code 等 engine 的 MCP config 只能通过 `aiworker executor mcp add/sync/doctor` 和 engine 官方 CLI/config 投影。
- **`config.yaml`** 是 `worker_config.configJson` 的 advisory 镜像——`PUT /api/worker/config` 与 `aiworker config-set`（worker-local）/ `aiworker config set`（operator-remote）落库成功后都会调 `mirrorConfigToYaml`，DB 仍为 source-of-truth（乐观锁 `If-Match` 依赖 DB version）。
- **`AGENT.md` / `SOUL.md` / `USER.md`** user scope 首次启动由 `ensureWorkerHome(workerId)` 幂等种出；project scope 由 `aiworker init` 根据 Soul preset 种出非 stub 模板，并保持 no-overwrite。

## Overview

AIWorker 是一个**自托管 Agent Runtime**，由两类 provider 组合而成：

- **Brain provider** — 知识 / 记忆 / 技能目录。当前：`FilesystemBrainProvider`（纯 filesystem）。
- **Executor provider** — OpenAI 兼容 chat completions + tool calling。当前：`OpenAICompatibleExecutor` 作为 baseline，外加多引擎注册表（claude-code / codex / gemini-cli / qwen-code / cursor-agent / ACP / MCP）。

**Orchestrator** 驱动 agent loop（submit prompt → stream completions → execute tools → persist transcript → emit `WorkerEventBus` 事件）。网络层（WS gateway / HTTP worker）与 orchestrator 解耦：

- Gateway 只负责帧转发与 fleet 级控制方法（`workers.*`、`token.rotate`、`system.presence`）。
- Worker 持有 orchestrator；node 模式通过 `@zonease/aiworker-core` 的 `startGatewayNode` 主动拨一条 WS 连接上报 `WorkerEventBus` 事件、处理 gateway 转发过来的 `chat.send` / `config.get` / `config.put` / `token.rotate` / `logs.tail` 请求。

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                Operator surface                              │
│  ┌─────────────────────┐   ┌──────────────────────────────┐  │
│  │ aiworker CLI (cac)  │   │ web SPA (React 19)           │  │
│  └─────────────────────┘   └──────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────┘
                               │ WS  ws://host:9218/ws  (role=operator)
                               │ bearer=INTERNAL_SHARED_SECRET
                               │ (loopback 放行空 token)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   Gateway (apps/gateway)                     │
│   - Bun.serve :9218, /ws 承接升级, /health 返回 JSON 心跳    │
│   - 握手校验：loopback 或 bearer==INTERNAL_SHARED_SECRET     │
│   - 三件内存 registry：NodeRegistry / OperatorRegistry /      │
│     ForwardTable（in-flight request ↔ operator 回程）         │
│   - 局部方法（operator-to-gateway）：                         │
│       workers.list / workers.pair / workers.launch /         │
│       workers.remove / token.rotate / system.presence        │
│   - 转发方法（operator-to-node）：                            │
│       workers.info / chat.send / config.get / config.put /   │
│       workers.stop / logs.tail                                │
│   - fleet.db（Drizzle + SQLite）：registered_workers + audit │
│   - AES-256-GCM：apiTokenEnc 加解密（master key hex 64）     │
│   - 可选 FleetSupervisor：AIWORKER_GATEWAY_CAN_LAUNCH=true    │
│     时持 docker.sock 拉起 worker 容器                         │
└──────────────────────────────┬───────────────────────────────┘
                               │ WS  同一 :9218/ws 入口 (role=node)
                               │ bearer=deviceToken（pair 时发放）
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   Worker (apps/api worker mode)              │
│   - `aiworker serve [--gateway ws://...]`：HTTP :9217 + 可选 │
│     gateway WS 客户端                                         │
│   - bootstrap：mintWorkerId + mintApiToken（一次性 stdout），│
│     `worker_identity` / `worker_config` singleton（pk='default')│
│   - orchestrator + WorkerEventBus（hot path）                │
│   - Brain + Executor provider（PLAN-012）                    │
│   - `startGatewayNode`：订阅 bus → emit event；              │
│     dispatcher 处理入站 request 并回 response                 │
└──────────────────────────────────────────────────────────────┘
```

## Deploy topology

```
Cloudflare (orange-cloud, TLS 终止)
        │   https://gateway.example.test
        │   回源 http :80
        ▼
Caddy :80 (纯反代)  ──►  127.0.0.1:9218  =  aiworker-gateway 容器
                                             │
                                             │ WS /ws
                                             ├─◄ operator：aiworker CLI + web
                                             │
                                             ├─► node：aiworker-worker-* 容器
                                             │     （同镜像，command: bun run dist/index.js）
                                             │     可选 `--gateway ws://gateway:9218/ws`（aiworker serve）
                                             │
                                             ├─ fleet.db（volume aiworker_fleet）
                                             └─ （可选）docker.sock:ro + WORKER_DATA_ROOT
                                                 → FleetSupervisor：workers.launch
```

- **gateway 容器** 是控制面入口。PLAN-013 之前是 `aiworker-dashboard`（Hono + 静态 web），现在换成 `aiworker-gateway`（Bun.serve WS）。
- 浏览器与 aiworker CLI 都走同一个 `/ws` 路径；path `/health` 纯 JSON，供 loopback / caddy / 部署脚本 `curl -sf http://127.0.0.1:9218/health` 做 readiness check。
- Worker 容器独立管理数据；`aiworker serve --gateway ws://gateway:9218/ws` 注册为 node，也可仅跑 HTTP（跨 gateway 拨号的独立部署）。

## 角色与鉴权

| 角色 | 客户端 | 进程/用户 | 鉴权 |
|------|--------|-----------|------|
| operator | aiworker CLI（operator-remote 子命令）、web SPA | 本机 / 远程运维 | loopback 自动放行；远程必须在 `/ws` 上以 `connect.auth.token` 携带 `INTERNAL_SHARED_SECRET`。`/enroll-ws` 拒绝 operator 角色（`wrong_path:otp_must_use_enroll_ws`）。 |
| node | worker 进程（`aiworker serve --gateway`） | worker 容器 | loopback 放行；远程 reconnect 走 `/ws` + deviceToken（`INTERNAL_SHARED_SECRET` 作 shared secret）；首次入网走 self-enroll（`/ws` + join token）或 OTP-attended（`/enroll-ws` + `enroll.mode='otp'`，无 token）。 |
| node-pending | OTP 提交后未审批的 worker | worker 容器 | path 锁定 `/enroll-ws`；ws 已升级但不进 NodeRegistry，等待 operator `aiworker enroll approve <otp>` 触发 `enrollment.approved` 事件后才升级为 node。 |

- Connect 帧必须是每条连接的第一帧（`connectFrameSchema`）；其后按 `role` 分流 request/response/event。
- bearer 比较一律 `timingSafeEqualStrings`（gateway 与 worker 两侧各自复制一份，见下文"加密与认证"）。
- gateway 所有握手 accept/reject 都写 `audit_events`，action 分别为 `gateway.connect.accepted` / `gateway.connect.rejected`。

## 数据域不变量（保留自 PLAN-004）

- `fleet.db` **仅**存 `registered_workers`（指针：baseUrl / displayName / 加密 bearer token / lastSeenAt）与 `audit_events`。**绝不允许**存 worker 的 config、secrets、conversations、messages 或任何业务数据。
- `worker.db` 由 worker 容器自持，包含 `worker_identity`（singleton pk='default'）、`worker_config`（singleton）、`worker_secrets`、`conversations`、`messages`、`agent_tasks`、`execution_logs`、`skill_bindings`、`skill_drafts`、`evolution_observations`。
- gateway 永不向 worker 的业务路径直连；一切经 WS 转发（`operator-to-node` routing）。fleet web 前端只通过 operator 身份连 gateway，再由 gateway 转发到 node；worker web 前端是 worker 自托管的本地自管面，只访问同源 `/api/worker/*`。
- drizzle-kit 分开生成：`drizzle.fleet.config.ts` / `drizzle.worker.config.ts`，迁移目录不得混用。

## 身份与配置自举

- Worker 首次启动在容器内 `mintWorkerId + mintApiToken`（`worker/bootstrap/identity.ts`），token 明文只打印一次（`[worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_...`），密文写入 `worker_identity` 后不再重新打印。
- worker 进 fleet 的四条路径（`registered_workers.addedBy` 对应四态）：
  1. **手动 pair**（`aiworker pair --url ws://... --worker-url http://... --bootstrap-token wtk_...`）：操作员从 worker stdout 抓 bootstrap 日志行 → gateway 调 worker `/info` 校验 → 加密存 fleet.db → 返回 deviceToken 写回 `~/.aiworker/aiworker.json`。**inbound** 方向：gateway 必须能 HTTP 回拨 worker `/info`，因此 worker 在 NAT/防火墙后会失败。`addedBy='manual'`。
  2. **自动 launch**（`aiworker fleet launch --display-name foo`）：需 `AIWORKER_GATEWAY_CAN_LAUNCH=true`；gateway supervisor 拉 worker 容器、scrape stdout、自动 pair。仅限 docker 形态、与 gateway 同主机。`addedBy='launch-local'`。
  3. **自助 enroll**（PLAN-018 / FEAT-024）：worker 容器 env 同时设 `AIWORKER_GATEWAY_URL` + `AIWORKER_JOIN_TOKEN`，`aiworker serve` bootstrap 完成后用 outbound WS 主动拨 gateway `/ws`，并把 enroll 块（`mode='join-token'` + `joinToken` + 自身 mint 的 `apiToken` + 可选 `displayName`）塞进 `connect` 帧第一帧；gateway 验 `joinToken` 后直接 upsert fleet.db 行。**outbound-only**，worker 不需要任何 inbound 端口暴露——是 NAT 后部署、批量 docker / k8s 节点、residential network 上 worker 的标准路径。`addedBy='self-enroll'`。
  4. **OTP-attended enroll**（PLAN-019 / FEAT-026）：worker 只设 `AIWORKER_GATEWAY_URL`（无 `AIWORKER_JOIN_TOKEN`）或显式 `AIWORKER_ENROLL_MODE=otp`，`aiworker serve` bootstrap 后用 outbound WS 拨 gateway `/enroll-ws`（不同于 self-enroll 的 `/ws`），connect 帧 `enroll.mode='otp'` 带自身 `apiToken` + 可选 `displayName`，**不**带 join token；gateway 在 `apps/gateway/src/registry/pending.ts::PendingEnrollmentRegistry` 内存队列里挂起，回推 `enrollment.otp` 事件给 worker，worker 把 8 字符 OTP（`XXXX-YYYY`，去歧义 30 字符 alphabet）打到 stdout 等待人审。operator 在 `/ws` 通道上 `aiworker enroll list / approve <otp> / reject <otp>` 决定去留，approve 时才 `upsertEnrolledWorker(addedBy='otp')` 落 fleet.db 并通过原 ws 推 `enrollment.approved` 事件回 worker。`addedBy='otp'`。**Worker 部署方完全不需要持有任何 fleet 凭证**——`/enroll-ws` 端 Caddy 不挂 basicauth，OTP submit 在 operator approve 前不会落库。
- 四条路径在 `connect` 帧上的鉴权分支由 `apps/gateway/src/auth/token.ts::authorizeConnection` 集中判定，**path-aware authN matrix**（PLAN-019 §"Path-aware authN matrix"）：

  | 进入路径 | `/ws`（Caddy basicauth） | `/enroll-ws`（无 basicauth） |
  |---|---|---|
  | operator connect | ✓ loopback / sharedSecret | ✗ `wrong_path:otp_must_use_enroll_ws` close 4400 |
  | node connect（join-token enroll，PLAN-018） | ✓ self-enroll 分支验 join token | ✗ `wrong_path:expected_enroll_otp` close 4400 |
  | node connect（OTP enroll，PLAN-019） | ✗ `wrong_path:otp_must_use_enroll_ws` close 4400 | ✓ submit → 入 pending 队列等 operator |
  | node reconnect（已配对，deviceToken / sharedSecret） | ✓ shared-secret | ✗ `wrong_path:expected_enroll_otp` close 4400 |

  失败口径统一写 `gateway.connect.rejected` audit。token 失败 close 4401（`auth:join_token_disabled` / `auth:join_token_mismatch` / `auth:quota_exceeded` / `auth:master_key_missing`），路径失败 close 4400（`wrong_path:*`）。OTP 路径还会写额外的 audit action：`gateway.enrollment.requested`（submit 即写，OTP 仅落 sha256 前 8 hex）/ `gateway.enrollment.approved` / `gateway.enrollment.rejected` / `gateway.enrollment.expired`（TTL 到由 `setTimeout` 触发，默认 `AIWORKER_ENROLL_OTP_TTL_SEC=300`）/ `gateway.enrollment.abandoned`（worker 在 approve 前掉线）。`gateway.worker.enrolled` 仍仅在 fleet 行 created / updated 时写，避免 reconnect 风暴。
- OTP 路径下 `node-pending` 是中间态：ws 已升级但 `ws.data.role='node-pending'`，**不**进 NodeRegistry，**不**广播 worker.online。任何非 close 帧都会被忽略；只有 operator approve 触发 `enrollment.approved` 事件 + 后续连接升级才会真正成为 node。pending 队列是纯内存（`PendingEnrollmentRegistry`），gateway 重启即丢；UX 上 worker 自动重连重新拿一个新 OTP，fleet.db 真实持久化只在 approve 时发生。
- 自助 enroll 适用 worker 在 NAT/防火墙后只能出站、批量部署需要 zero-touch、operator 无法逐个手贴 bootstrap token 的场景；OTP-attended enroll 适用 worker 部署方是客户 / 朋友 / CI runner 等不该持有 fleet 凭证的人——operator 用 8 字符 OTP 一次确认即放行，对标 GitHub Device Flow / `gh auth login`；高安全场景（每 worker 显式审批 + 显式 token 注入）保留手动 pair 作为更窄入口。
- `worker_identity` / `worker_config` 都是 singleton，`pk` 固定为字符串 `'default'`；不要在应用层添加多租户假设。
- `config.put` / `PUT /api/worker/config` 使用 `ifMatch: <version>` 乐观锁；新版本配置持久化后通过 `reloadRuntime(nextConfig, newVersion)` 原子替换 `state.runtime`。`reloadRuntime` 内部用 in-process promise chain 强制串行化（禁止并发），防止老版本晚到覆盖新版本。
- 配置中的 secret 以 ref 形式占位，落库时即被 redact；启动和 reload 通过 `enumerateSecretPaths` + `hydrateSecrets` 从 `SecretsVault` 注回明文。Secrets **永不**进 `worker_config.configJson`。

## Provider 扩展契约

- 新增 Brain 源 → 实现 `BrainProvider`，在 `worker/brain/factory.ts` 加 switch case，类型挂 `packages/shared/src/fleet/config.ts`。
- 新增 Executor 类型 → 实现 `ExecutorProvider`，在 `worker/executor/factory.ts` 加 switch case。
- 新增 Channel → 实现 `ChannelAdapter`（`verify` / `toEnvelopes` / `send`），在 `worker/channels/registry.ts` 的 `adapters` 映射里注册，并扩展 `ChannelCredentials` 判别联合。
- **不要在 `orchestrator/service.ts` 里新增 provider-specific 分支**；orchestrator 只依赖三大接口。

## Hot-reload 写法

- 路由层一律通过 `() => state.runtime` 闭包懒取 runtime（见 `buildChannelRoutes` / `buildOrchestratorRoutes` / `buildEventRoutes` / `buildManagementRoutes` 以及 gateway node 模式的 `getRuntime()` 注入）。不要缓存 `state.runtime` 实例到中间件或 handler 闭包里。
- `reloadRuntime` 是 runtime swap 的唯一串行化点：后一次 reload 的 hydrate/build/swap 必须等待前一次 swap、`onRuntimeReloaded` hook 和旧 runtime `dispose()` 全部完成；reload 失败不能 poison 后续重试。
- 老 runtime 的 `dispose()` 必须解绑 evolution observer / proposer loop / 任何长连接资源。gateway 的 node subscriber 也是 `getBus()` 懒取，reload 后自动追新 bus。

## Executor engines (PLAN-007 / FEAT-011 → FEAT-016)

`ExecutorProvider` 注册表按 `EngineKind` 分派，每个引擎在 `packages/core/src/worker/executor/engines/*` 下：

- `http` — OpenAI 兼容 chat completions（FEAT-011 baseline，服务 HTTP / DeepSeek / SiliconFlow / OpenRouter 变体）
- `mcp` — Model Context Protocol streamable-http 工具源
- `cli` — 通用一次性 CLI stub（debug / sandbox）
- `claude-code` — `claude` CLI stream-json + control protocol（FEAT-012）
- `acp` — Agent Client Protocol / JSON-RPC over stdio，携带 Gemini + Qwen 适配器（FEAT-013）
- `codex` — `@openai/codex app-server` JSON-RPC over stdio，`approval_policy: 'never'`（FEAT-016）
- `cursor` — `cursor-agent -p --output-format=stream-json`，仅走 PATH 安装，无 npm fallback（FEAT-016）

## PLAN-014：envelope / approvals / fallback / cron

PLAN-014 在 PLAN-013 协议骨架之上落了四个独立但相关的特性。下面分别描述其语义边界与必须保持的不变量。

### F1 — Envelope 路由维度

`Envelope` 字段升级（`packages/shared/src/fleet/channel.ts`）：

- 新增 **必填** `accountId: string`——每 channel 的"凭据身份"维度，与 `chatId`（会话）、`channel`（协议）共同构成路由三元组 `(channel, accountId, peer)`。同 channel 多 bot / 多账号在不进 fleet.db 的前提下也能正确分流。
- 新增可选 `richMetadata`：

  | 字段 | 含义 |
  |---|---|
  | `isEdit?: boolean` | 来源 platform 把这条标记为编辑 |
  | `isDelete?: boolean` | 来源 platform 撤回 / 删除 |
  | `replyTo?: { authorId: string; text: string }` | 引用回复（telegram / whatsapp / web） |
  | `quote?: string` | 文本引用块（lark / line） |
  | `reactions?: Array<{ emoji: string; count: number }>` | reaction 聚合 |

- `messages` 表新增 `rich_metadata` 列（`text/json`，可选）；写入路径 `packages/core/src/worker/orchestrator/service.ts::persistUserMessage` 把 envelope 的 `richMetadata` 一并落盘。Migration `0001_secret_dagger.sql`（only `ALTER ADD`，不破坏存量行）。

5 个 channel adapter（`packages/core/src/worker/channels/adapters/{telegram,whatsapp,lark,line,web}.ts`）`toEnvelopes` 各自派生 `accountId`：

| channel | accountId 来源 |
|---|---|
| telegram | `credentials.botUsername`（缺失时 `sha256(botToken)` 前 8 字节 hex） |
| whatsapp | `phoneNumberId` |
| lark | `appId` |
| line | `sha256(channelAccessToken)` 前 8 字节 hex |
| web | `binding.id ?? 'default'` |

#### `sys:` 保留前缀（系统派发）

非 channel adapter 的派发路径（不存在外部凭据身份）使用 **保留前缀 `sys:` 命名空间**，与用户配置的 web `binding.id` 隔离：

| 前缀 | 触发源 |
|---|---|
| `sys:task` | `submitTask`（dashboard 路径删除后保留为内部任务派发） |
| `sys:gateway` | gateway dispatcher 转发的 `chat.send` |
| `sys:cli` | `aiworker run --message`（一次性 CLI ingest） |
| `sys:cron` | F4 cron 触发的合成 envelope（默认值，可被 `--account-id` 覆盖） |

> Channel adapter 不允许直接产出 `sys:*` 前缀的 accountId；adapter test 必须断言这一点（5 个 adapter 均覆盖）。

### F2 — Per-tool approvals

工具调用前的策略 gate 由 `WorkerConfig.toolPolicy`（`packages/shared/src/fleet/config.ts`）声明：

```ts
toolPolicy?: {
  default: 'auto' | 'ask' | 'deny'
  rules: Array<{ pattern: string; action: 'auto' | 'ask' | 'deny' }>
}
```

`pattern` 是 tool name 的 glob；orchestrator 在 `runTool` 路径用 `evaluateToolPolicy` 决定走向：

| 决策 | 行为 |
|---|---|
| `auto` | 直接执行，等同未配 toolPolicy 时的现状 |
| `ask` | 通过 `WorkerEventBus` 上行 `approval.requested`（gateway 透传到 operator）；orchestrator 在 `ApprovalStore` 挂起 promise，**60s 超时按 deny 处理** |
| `deny` | 短路返回合成助手消息 `"tool {name} blocked by policy"`，**不进 executor** |

不变量：

- **缺省安全**：`toolPolicy` 缺失时 `evaluateToolPolicy` 一律返回 `auto`，旧 config 行为不变。
- **Hot-reload 安全**：`runtime.dispose()` 必须调 `approvals.dispose()`，把全部挂起 promise 以 `decision='deny'` resolve（不能 reject——orchestrator 用 await 拿决策，reject 会破坏 transcript）。
- **Gate 顺序**：policy gate 在 envelope schema 校验之后、executor 实际派发之前；`auto/deny` 立刻短路，不经 bus。

链路：

```
worker orchestrator (ask)
    │ approval.requested  (bus event)
    ▼
worker gateway-client subscriber  ──►  gateway  ──►  operator (aiworker / web)
                                                        │ approval.grant
                                                        ▼
worker gateway-client dispatcher  ◄──  gateway  ◄──  approval.grant
    │ ApprovalStore.resolve(decision)
    ▼
worker orchestrator (resume)
```

operator 控制面：

- `aiworker approvals list [--worker <id>]` / `aiworker approvals grant <workerId> <taskId> <toolCallId> [--deny]`（`@zonease/aiworker-gateway-proto` 新增 `approval.list` / `approval.grant` 方法 + `APPROVAL_REQUESTED` 事件）。
- `aiworker approvals-list` / `aiworker approvals-grant <taskId> <toolCallId> [--deny]`（worker-local dash-form；不经 gateway，直接调 worker 本地 `GET /api/worker/approvals` 与 `POST /api/worker/approvals/:taskId/:toolCallId/grant`，方便 dev 与运维 fallback）。

### F3 — Provider fallback chain

`ExecutorConfig` 新增可选嵌套字段：

```ts
fallbacks?: Array<{
  executor: ExecutorConfig
  onErrorKinds: Array<'rate-limit' | 'timeout' | 'auth' | 'network' | 'server-5xx' | 'unknown'>
  maxRetries?: number  // 默认 1
}>
```

`packages/core/src/worker/executor/factory.ts::buildExecutor` 检测到 `fallbacks` 非空时递归构造 `FallbackExecutor` 包装链；wrapper 与 `ExecutorProvider` 一一对应（**不要在 orchestrator 加 provider-specific 分支**）。

`inferErrorKind` 分类规则（优先级从高到低）：

| Kind | 触发条件 |
|---|---|
| `rate-limit` | HTTP 429 / claude-code "rate limited" / "rate-limit" 字样 |
| `timeout` | HTTP 408 / `AbortError` / engine stall（fetch 失败叠加 abort 时优先归此） |
| `auth` | HTTP 401/403 / "invalid api key"（401+5xx 文本冲突时优先 auth） |
| `network` | `ECONNREFUSED` / `ETIMEDOUT` / DNS / fetch network err |
| `server-5xx` | HTTP 500-599 |
| `unknown` | 其他 |

不变量：

- **不重放已下发流**：流式 chat 已 yield 第一个事件后，原 executor 抛错直接冒泡——避免半截 transcript 与 fallback 双流叠加。
- **递归嵌套**：fallback 自身仍可携带 `fallbacks?`，递归构造（factory 不限层数；通常 2-3 层够用）。
- **缺省零开销**：旧 config 不带 `fallbacks` 时 factory 返回原 executor 实例，不引入 wrapper。

### F4 — Cron 调度

新表 `cron_jobs`（`packages/storage-sqlite/src/worker/schema.ts`，migration `0002_jazzy_moondragon.sql`）：

| 列 | 说明 |
|---|---|
| `id` | uuid pk |
| `expression` | 5-field cron 表达式 |
| `prompt` | fire 时合成的 `Envelope.text` |
| `channel` | channel 枚举 |
| `chatId` | fire 时使用的 chatId |
| `accountId` | F1 后必填，默认 `sys:cron` |
| `enabled` | bool default true |
| `lastRunAt` / `nextRunAt` | iso 时间戳 |
| `createdAt` / `updatedAt` | iso |

`packages/core/src/worker/cron/service.ts::CronService`：

- 60s `setInterval` tick；每次 tick 内**串行**遍历 jobs，对到期的 job 先用 `cron-parser ^5.5.0` 算下一个 `nextRunAt` → 写库 → 合成 `sys:cron` envelope 喂 `orchestrator.ingest`。"先算 next → 写库 → ingest" 顺序确保即使 ingest 抛错也不会重复触发同一时刻。
- `runtime.build()` 时 `start()`，`runtime.dispose()` 时 `stop()`；**不进 orchestrator hot path**——tick 在自有 setInterval 跑，与 orchestrator 解耦。
- 已知 race（P2，未修）：`reloadRuntime` 期间老 runtime 的 `setInterval` 还未 clearInterval 时新 runtime 已 start，理论上存在双重 tick 极短窗口（~毫秒级）；fire 顺序保证不会双触发同一 job，但可能让 `lastRunAt` 早 1s 写。

operator 控制面：

- `aiworker schedule list <workerId>` / `aiworker schedule add <workerId> --expression --prompt --channel --chat-id [--account-id sys:cron] [--disabled]` / `aiworker schedule remove <workerId> <jobId>`（gateway 新增 `cron.list` / `cron.add` / `cron.remove` / `cron.update` 方法）。
- `aiworker schedule-list` / `aiworker schedule-add` / `aiworker schedule-remove`（worker-local dash-form；直接走 in-process `CronService` CRUD，不经 HTTP，与 `aiworker config-show` 模式一致）。

## Module Layer

| Module | Responsibility |
|--------|---------------|
| `skills` | Skill catalogue / diff / conflict 记录（`skill_conflicts.brain_hash` / `executor_hash`） |
| `memory` | Brain provider 的读/写包装 |
| `execution` | 执行日志只读查询（写入发生在 orchestrator 工具路径） |
| `config` | 统一的 worker config 读/写（DB + yaml mirror） |
| `health` | 汇总 `services.brain` + `services.executor` |
| `events` | 进程内事件总线 + `/api/events/stream` SSE 端点（worker HTTP 留存）+ gateway node subscriber |
| `orchestrator` | Task lifecycle + tool loop（含 PLAN-014 F2 policy gate） |
| `cron` | `CronService` 60s tick + CRUD（PLAN-014 F4） |

## 透传与 hop-by-hop 头（下线）

> PLAN-004 时代 dashboard 通过 HTTP `ALL /api/workers/:id/proxy/worker/*` 向 worker 透传 REST。PLAN-013 整体下线：operator 通过 gateway 的 WS 协议与 worker 交互，不再存在 HTTP 透传层。相关 hop-by-hop header 剥离逻辑已随 `apps/api/src/dashboard/**` 一并删除。

## 加密与认证

- Gateway 侧的 `apps/gateway/src/registry/crypto.ts` 与 worker 侧的 `packages/core/src/worker/secrets/vault.ts` **有意复制**，不要抽取为共享模块——两者 master key 不同（gateway 用 `AIWORKER_MASTER_KEY` 解 `registered_workers.apiTokenEnc`；worker 用自己的 master key 解 `worker_secrets`），耦合会破坏信任边界。
- Bearer token 对比一律 `timingSafeEqualStrings`（`worker/secrets/crypto.ts`）。
- 所有 channel webhook 入站必须验签：Telegram（`X-Telegram-Bot-Api-Secret-Token`）、WhatsApp（`X-Hub-Signature-256` HMAC）、Lark（`encrypt` AES + token）。
- `AIWORKER_MASTER_KEY` 丢失 = 所有已注册 worker 的存储 token 无法解密，必须重新 pair。Master key 必须纳入组织级 secret store，并有轮换/恢复预案。

## Hot path 与演化路径解耦（保留自 PLAN-006）

- Evolution observer（`evolution/observer.ts`）挂在 `WorkerEventBus` 上只做持久化；proposer（`evolution/proposer.ts` + `pattern-miner.ts`）按 interval 离线跑，**不得**进入 orchestrator 请求路径。
- `evolution_observations` 写入量随对话线性增长，需要 TTL / 滚动压实策略（新增需求时务必一并设计）。

## Environment

完整列表见 `apps/api/.env.example` 与 `ops/compose/.env.example`。常用变量：

Worker 侧（`aiworker serve` / worker 容器）：

- `AIWORKER_MASTER_KEY` — worker 自己的 secrets vault 主密钥（64 hex）。
- `AIWORKER_HOME` — 默认 `~/.aiworker`。
- `WORKER_DB_PATH` / `WORKER_MIGRATIONS_FOLDER`。
- `AIWORKER_FORCE_ID` / `AIWORKER_FORCE_TOKEN` — 测试/备份恢复用的一次性覆盖。

Gateway 侧（`apps/gateway/src/index.ts` / gateway 容器）：

- `AIWORKER_GATEWAY_PORT` / `AIWORKER_GATEWAY_HOST`（默认 `9218` / `127.0.0.1`；compose 里绑 `0.0.0.0`）。
- `AIWORKER_MASTER_KEY` — fleet.db `registered_workers.apiTokenEnc` 的 AES 主密钥。
- `INTERNAL_SHARED_SECRET` — 远程 operator 的 bearer；canLaunch=true 时作为新拉起 worker 容器的 env 注入。
- `AIWORKER_FLEET_DB_PATH` — 默认 `$AIWORKER_HOME/fleet.db`；compose 里挂到 `aiworker_fleet` 卷。
- `AIWORKER_GATEWAY_CAN_LAUNCH`（默认 `false`）、`AIWORKER_MAX_WORKERS`、`AIWORKER_IMAGE`、`WORKER_DATA_ROOT`、`WORKER_MEMORY_LIMIT`、`WORKER_CPU_LIMIT`、`AIWORKER_NETWORK`、`AIWORKER_LAUNCH_BASE_URL_TEMPLATE`。

> PLAN-013 之前的一批 manager-polling / dashboard-only 变量已随 dashboard 下线；变更明细见 `docs/changelog.md` 的 PLAN-013 条目。

## Key Design Decisions

1. **Provider-shaped core**：orchestrator 只依赖 `BrainProvider` / `ExecutorProvider`；测试注入 scripted executor；生产在 `apps/api/src/providers/index.ts` / engines 注册表里切换。
2. **File-first for Brain**：memories / skills 落 markdown 文件（`FilesystemBrainProvider`）；`AIWORKER_HOME` 根下结构由 `@zonease/aiworker-fs-layout` 管。
3. **SQLite for runtime state**：agent tasks / conversations / transcripts / tool-call logs / skill conflicts。Drizzle 迁移在 `initDb` 时自动跑。
4. **WS-first control plane**：operator 与 node 走同一条 WS 入口、同一套协议包（`@zonease/aiworker-gateway-proto`），方法 routing 自带 `operator-to-node` vs `operator-to-gateway` 判别；REST 不再作为控制面语言。
5. **OpenAI-compatible, not OpenAI-only**：executor engines 可扩展到任何兼容 chat-completions / tool-use 方言的后端（OpenAI、Ollama、vLLM、LM Studio、Together、claude-code、codex、gemini-cli、qwen-code、cursor-agent 等）。
