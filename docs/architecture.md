# AIWorker Architecture

## Monorepo Layout

```text
apps/
  api/          # Hono worker runtime (worker mode only)
  cli/          # aiw (worker) + aim (operator) CLIs
  gateway/      # WS 控制面：operator ↔ gateway ↔ node 三方协议枢纽
  web/          # React 19 SPA（operator console；通过 WS 连 gateway）
packages/
  shared/          # cross-layer types / constants / zod schemas
  gateway-proto/   # WS 协议纯类型 + zod：METHODS / EVENTS / Frame
  core/            # transport-agnostic worker runtime（@aiworker/core）
  storage-sqlite/  # fleet.db + worker.db schemas, drizzle configs, migrations
  fs-layout/       # ~/.aiworker/ path resolver + ensureWorkerHome bootstrap
```

- **`apps/api`** 只负责 worker 运行时（数据面）。`AIWORKER_MODE=worker` 仍保留以兼容运维脚本，但入口不再按模式分叉——`boot()` 一律构建 `createWorkerApp`。dashboard REST 已随 PLAN-013 整体下线。运行时业务（brain / executor / channels / orchestrator / cron / approvals / gateway-client / runtime / secrets / bootstrap / management 业务态）已物理抽离至 `packages/core`，apps/api 仅保留 Hono 路由 + middleware + bootstrap 装配（`@aiworker/api/bootstrap` 暴露给 `aiw serve`），保持 transport 与业务的边界。
- **`apps/gateway`** 是新增的 WS 控制面，单入口 `Bun.serve(:3000)`，路径 `/ws` 承接 WebSocket 升级，`/health` 返回心跳。运行时持有 fleet.db（`registered_workers` + `audit_events`）并做 operator ↔ node 帧转发。见 `docs/gateway.md`。
- **`apps/cli`** 同时发布两枚 bin：`aiw`（worker-side，原 PLAN-011/012 的子命令 + 新增 `aiw serve --gateway`）和 `aim`（operator-side，WS 协议客户端）。两者共享 `cac` 解析器与 `@aiworker/core` 运行时复用（`aiw serve` 额外从 `@aiworker/api/bootstrap` 取 Hono 入口），但状态文件各自独立（worker.db vs `~/.aiworker/aim.json`）。
- **`apps/web`** 不再消费任何 REST。`lib/api.ts` 已替换为统一 WS 客户端，浏览器直连 gateway（Caddy 反代 `:80 → :3000`，loopback 自动放行）。
- **`packages/gateway-proto`** 是协议的纯类型 + 运行时校验层。不依赖任何网络框架，所有 METHODS / EVENTS / Frame schema 都在这里定义，aim / web / gateway / worker 四侧共用。
- **`packages/core`** 是 transport-agnostic 的 worker runtime（PLAN-015 §S1 物理抽离）。封装 brain provider、executor provider、channel adapter、orchestrator、cron、approvals、gateway-client、secrets、bootstrap、management 业务态等所有运行时业务；公共面 `packages/core/src/index.ts` 同时被 `apps/api` 路由、`apps/cli` 与 gateway node 接入复用。**不**依赖 `hono` / `@hono/*` / `@scalar/*`——边界由 ESLint `no-restricted-imports` 守，CI 拦下任何回退到 transport 层耦合的尝试。
- **`packages/storage-sqlite`** 是 fleet.db 与 worker.db 的唯一 schema 源。通过 subpath `./fleet` 与 `./worker` 保持数据域边界；`defaultFleetMigrationsFolder` / `defaultWorkerMigrationsFolder` 通过 `import.meta.url` 解析，避免调用方硬编码 `./drizzle/...`。
- **`packages/fs-layout`** 管理每 worker 的 `~/.aiworker/workers/<id>/` 目录布局。gateway 与 worker 都复用它解析 `AGENT.md` / `SOUL.md` / `USER.md` / `config.yaml` / `brain/` 等路径。

## 部署模型（PLAN-016）

部署形态降级为三档并列，docker 不再是默认：

| 形态 | 适用 | 入口 | docker | 公网 |
|------|------|------|--------|------|
| **裸跑** | 开发 / 单机 | `aim gateway start` / `aiw serve` 前台 | 无 | 无 |
| **systemd** | Linux 服务器长跑 | `aim install systemd [--user\|--system]` 写 unit + `enable --now` | 无 | 可选叠加 |
| docker compose | 懒人快速试用 / per-worker 容器隔离 | `ops/compose/docker-compose.yml`（GHCR 镜像） | 有 | 必要时叠加 |

公网 HTTPS（Cloudflare orange-cloud + Caddy `:80 → 127.0.0.1:3000` + GHCR + `scripts/deploy.ts` aissh 流程）单独拆到 [`deployment-public-https.md`](./deployment-public-https.md)，仅当需要把 channel webhook 暴露公网时才叠加；详见 [`deployment.md`](./deployment.md)。

## Filesystem source of truth (PLAN-012)

每个 worker 持有一颗独立子树（根为 `AIWORKER_HOME`，默认 `~/.aiworker`）：

```text
~/.aiworker/
  aim.json                     # operator 本地状态（gatewayUrl / deviceId / deviceToken / defaultWorkerId，0600）
  aim-gateway.pid              # 本机 aim gateway daemon pid（若启动）
  aim-gateway.log              # 本机 aim gateway daemon 日志
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

- **Skills / memories** 读写统一过 `FilesystemBrainProvider`（PLAN-012 将旧 `HermesProvider` 改名并把 HTTP 依赖全部拆掉）；filesystem 是权威，SQLite 只负责 identity 与可索引状态。
- **`config.yaml`** 是 `worker_config.configJson` 的 advisory 镜像——`PUT /api/worker/config` 与 `aiw config-set` / `aim config set` 落库成功后都会调 `mirrorConfigToYaml`，DB 仍为 source-of-truth（乐观锁 `If-Match` 依赖 DB version）。
- **`AGENT.md` / `SOUL.md` / `USER.md`** 首次启动种出 stub，由 `ensureWorkerHome(workerId)` 幂等保证；注入到 system prompt 的逻辑待 PLAN-014 在 envelope 改造里一并落。

## Overview

AIWorker 是一个**自托管 Agent Runtime**，由两类 provider 组合而成：

- **Brain provider** — 知识 / 记忆 / 技能目录。当前：`FilesystemBrainProvider`（纯 filesystem）。
- **Executor provider** — OpenAI 兼容 chat completions + tool calling。当前：`OpenAICompatibleExecutor` 作为 baseline，外加多引擎注册表（claude-code / codex / gemini-cli / qwen-code / cursor-agent / ACP / MCP）。

**Orchestrator** 驱动 agent loop（submit prompt → stream completions → execute tools → persist transcript → emit `WorkerEventBus` 事件）。网络层（WS gateway / HTTP worker）与 orchestrator 解耦：

- Gateway 只负责帧转发与 fleet 级控制方法（`workers.*`、`token.rotate`、`system.presence`）。
- Worker 持有 orchestrator；node 模式通过 `@aiworker/core` 的 `startGatewayNode` 主动拨一条 WS 连接上报 `WorkerEventBus` 事件、处理 gateway 转发过来的 `chat.send` / `config.get` / `config.put` / `token.rotate` / `logs.tail` 请求。

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                Operator surface                              │
│  ┌─────────────────────┐   ┌──────────────────────────────┐  │
│  │ aim CLI (cac-based) │   │ web SPA (React 19)           │  │
│  └─────────────────────┘   └──────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────┘
                               │ WS  ws://host:3000/ws  (role=operator)
                               │ bearer=INTERNAL_SHARED_SECRET
                               │ (loopback 放行空 token)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   Gateway (apps/gateway)                     │
│   - Bun.serve :3000, /ws 承接升级, /health 返回 JSON 心跳    │
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
                               │ WS  同一 :3000/ws 入口 (role=node)
                               │ bearer=deviceToken（pair 时发放）
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   Worker (apps/api worker mode)              │
│   - `aiw serve [--gateway ws://...]`：HTTP :3001 + 可选      │
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
Caddy :80 (纯反代)  ──►  127.0.0.1:3000  =  aiworker-gateway 容器
                                             │
                                             │ WS /ws
                                             ├─◄ operator：aim CLI + web
                                             │
                                             ├─► node：aiworker-worker-* 容器
                                             │     （同镜像，command: bun run dist/index.js）
                                             │     可选 `--gateway ws://gateway:3000/ws`
                                             │
                                             ├─ fleet.db（volume aiworker_fleet）
                                             └─ （可选）docker.sock:ro + WORKER_DATA_ROOT
                                                 → FleetSupervisor：workers.launch
```

- **gateway 容器** 是控制面入口。PLAN-013 之前是 `aiworker-dashboard`（Hono + 静态 web），现在换成 `aiworker-gateway`（Bun.serve WS）。
- 浏览器与 aim CLI 都走同一个 `/ws` 路径；path `/health` 纯 JSON，供 loopback / caddy / 部署脚本 `curl -sf http://127.0.0.1:3000/health` 做 readiness check。
- Worker 容器独立管理数据；`aiw serve --gateway ws://gateway:3000/ws` 注册为 node，也可仅跑 HTTP（跨 gateway 拨号的独立部署）。

## 角色与鉴权

| 角色 | 客户端 | 进程/用户 | 鉴权 |
|------|--------|-----------|------|
| operator | aim CLI、web SPA | 本机 / 远程运维 | loopback 自动放行；远程必须在 `connect` 帧 `auth.token` 携带 `INTERNAL_SHARED_SECRET` |
| node | worker 进程（`aiw serve --gateway`） | worker 容器 | loopback 放行；远程 node 必须携带 deviceToken（`INTERNAL_SHARED_SECRET` 作 shared secret） |

- Connect 帧必须是每条连接的第一帧（`connectFrameSchema`）；其后按 `role` 分流 request/response/event。
- bearer 比较一律 `timingSafeEqualStrings`（gateway 与 worker 两侧各自复制一份，见下文"加密与认证"）。
- gateway 所有握手 accept/reject 都写 `audit_events`，action 分别为 `gateway.connect.accepted` / `gateway.connect.rejected`。

## 数据域不变量（保留自 PLAN-004）

- `fleet.db` **仅**存 `registered_workers`（指针：baseUrl / displayName / 加密 bearer token / lastSeenAt）与 `audit_events`。**绝不允许**存 worker 的 config、secrets、conversations、messages 或任何业务数据。
- `worker.db` 由 worker 容器自持，包含 `worker_identity`（singleton pk='default'）、`worker_config`（singleton）、`worker_secrets`、`conversations`、`messages`、`agent_tasks`、`execution_logs`、`skill_bindings`、`skill_drafts`、`evolution_observations`。
- gateway 永不向 worker 的业务路径直连；一切经 WS 转发（`operator-to-node` routing）。web 前端只通过 operator 身份连 gateway，再由 gateway 转发到 node。
- drizzle-kit 分开生成：`drizzle.fleet.config.ts` / `drizzle.worker.config.ts`，迁移目录不得混用。

## 身份与配置自举

- Worker 首次启动在容器内 `mintWorkerId + mintApiToken`（`worker/bootstrap/identity.ts`），token 明文只打印一次（`[worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_...`），密文写入 `worker_identity` 后不再重新打印。
- 操作员把 worker 注册进 fleet 的唯一路径：
  1. `aim pair --url ws://... --worker-url http://... --bootstrap-token wtk_...`：手动 scrape bootstrap 日志行 → gateway 调 worker `/info` 校验 → 加密存 fleet.db → 返回 deviceToken 写回 `~/.aiworker/aim.json`。
  2. `aim workers launch --display-name foo`：需 `AIWORKER_GATEWAY_CAN_LAUNCH=true`；gateway supervisor 拉 worker 容器、scrape stdout、自动 pair。
- `worker_identity` / `worker_config` 都是 singleton，`pk` 固定为字符串 `'default'`；不要在应用层添加多租户假设。
- `config.put` / `PUT /api/worker/config` 使用 `ifMatch: <version>` 乐观锁；新版本配置持久化后通过 `reloadRuntime(nextConfig, newVersion)` 原子替换 `state.runtime`。**reload 必须串行化**（禁止并发），防止老版本晚到覆盖新版本。
- 配置中的 secret 以 ref 形式占位，落库时即被 redact；启动和 reload 通过 `enumerateSecretPaths` + `hydrateSecrets` 从 `SecretsVault` 注回明文。Secrets **永不**进 `worker_config.configJson`。

## Provider 扩展契约

- 新增 Brain 源 → 实现 `BrainProvider`，在 `worker/brain/factory.ts` 加 switch case，类型挂 `packages/shared/src/fleet/config.ts`。
- 新增 Executor 类型 → 实现 `ExecutorProvider`，在 `worker/executor/factory.ts` 加 switch case。
- 新增 Channel → 实现 `ChannelAdapter`（`verify` / `toEnvelopes` / `send`），在 `worker/channels/registry.ts` 的 `adapters` 映射里注册，并扩展 `ChannelCredentials` 判别联合。
- **不要在 `orchestrator/service.ts` 里新增 provider-specific 分支**；orchestrator 只依赖三大接口。

## Hot-reload 写法

- 路由层一律通过 `() => state.runtime` 闭包懒取 runtime（见 `buildChannelRoutes` / `buildOrchestratorRoutes` / `buildEventRoutes` / `buildManagementRoutes` 以及 gateway node 模式的 `getRuntime()` 注入）。不要缓存 `state.runtime` 实例到中间件或 handler 闭包里。
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
| `sys:cli` | `aiw run --message`（一次性 CLI ingest） |
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
worker gateway-client subscriber  ──►  gateway  ──►  operator (aim / web)
                                                        │ approval.grant
                                                        ▼
worker gateway-client dispatcher  ◄──  gateway  ◄──  approval.grant
    │ ApprovalStore.resolve(decision)
    ▼
worker orchestrator (resume)
```

operator 控制面：

- `aim approvals list [--worker <id>]` / `aim approvals grant <workerId> <taskId> <toolCallId> [--deny]`（`@aiworker/gateway-proto` 新增 `approval.list` / `approval.grant` 方法 + `APPROVAL_REQUESTED` 事件）。
- `aiw approvals-list` / `aiw approvals-grant <taskId> <toolCallId> [--deny]`（不经 gateway，直接调 worker 本地 `GET /api/worker/approvals` 与 `POST /api/worker/approvals/:taskId/:toolCallId/grant`，方便 dev 与运维 fallback）。

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

- `aim schedule list <workerId>` / `aim schedule add <workerId> --expression --prompt --channel --chat-id [--account-id sys:cron] [--disabled]` / `aim schedule remove <workerId> <jobId>`（gateway 新增 `cron.list` / `cron.add` / `cron.remove` / `cron.update` 方法）。
- `aiw schedule-list` / `aiw schedule-add` / `aiw schedule-remove`（直接走 in-process `CronService` CRUD，不经 HTTP，与 `aiw config-show` 模式一致）。

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

Worker 侧（`aiw serve` / worker 容器）：

- `AIWORKER_MASTER_KEY` — worker 自己的 secrets vault 主密钥（64 hex）。
- `AIWORKER_HOME` — 默认 `~/.aiworker`。
- `WORKER_DB_PATH` / `WORKER_MIGRATIONS_FOLDER`。
- `AIWORKER_FORCE_ID` / `AIWORKER_FORCE_TOKEN` — 测试/备份恢复用的一次性覆盖。

Gateway 侧（`apps/gateway/src/index.ts` / gateway 容器）：

- `AIWORKER_GATEWAY_PORT` / `AIWORKER_GATEWAY_HOST`（默认 `3000` / `127.0.0.1`；compose 里绑 `0.0.0.0`）。
- `AIWORKER_MASTER_KEY` — fleet.db `registered_workers.apiTokenEnc` 的 AES 主密钥。
- `INTERNAL_SHARED_SECRET` — 远程 operator 的 bearer；canLaunch=true 时作为新拉起 worker 容器的 env 注入。
- `AIWORKER_FLEET_DB_PATH` — 默认 `./data/fleet.db`；compose 里挂到 `aiworker_fleet` 卷。
- `AIWORKER_GATEWAY_CAN_LAUNCH`（默认 `false`）、`AIWORKER_MAX_WORKERS`、`AIWORKER_IMAGE`、`WORKER_DATA_ROOT`、`WORKER_MEMORY_LIMIT`、`WORKER_CPU_LIMIT`、`AIWORKER_NETWORK`、`AIWORKER_LAUNCH_BASE_URL_TEMPLATE`。

> PLAN-013 之前的一批 manager-polling / dashboard-only 变量已随 dashboard 下线；变更明细见 `docs/changelog.md` 的 PLAN-013 条目。

## Key Design Decisions

1. **Provider-shaped core**：orchestrator 只依赖 `BrainProvider` / `ExecutorProvider`；测试注入 scripted executor；生产在 `apps/api/src/providers/index.ts` / engines 注册表里切换。
2. **File-first for Brain**：memories / skills 落 markdown 文件（`FilesystemBrainProvider`）；`AIWORKER_HOME` 根下结构由 `@aiworker/fs-layout` 管。
3. **SQLite for runtime state**：agent tasks / conversations / transcripts / tool-call logs / skill conflicts。Drizzle 迁移在 `initDb` 时自动跑。
4. **WS-first control plane**：operator 与 node 走同一条 WS 入口、同一套协议包（`@aiworker/gateway-proto`），方法 routing 自带 `operator-to-node` vs `operator-to-gateway` 判别；REST 不再作为控制面语言。
5. **OpenAI-compatible, not OpenAI-only**：executor engines 可扩展到任何兼容 chat-completions / tool-use 方言的后端（OpenAI、Ollama、vLLM、LM Studio、Together、claude-code、codex、gemini-cli、qwen-code、cursor-agent 等）。
