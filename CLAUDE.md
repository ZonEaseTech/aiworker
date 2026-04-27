# AIWorker

自托管 Agent Runtime：由 Brain provider（知识/记忆）与 Executor provider（OpenAI 兼容 chat completions + tool calling）组合而成。

仓库采用 Bun workspaces 布局：`apps/api`（后端）+ `apps/web`（前端）+ `packages/shared`（跨层类型/常量）。后端同一个 entry 按 `AIWORKER_MODE` 分叉为 **dashboard（管理面板 / fleet 注册中心）** 与 **worker（单容器 Agent Runtime）** 两种形态。

## Agent Rules

- 所有输出（文档、代码注释、commit message、PR description）默认使用中文。
- 与用户交流使用中文。
- 对外可见内容中不提及 AI 助手、Agent 或协作模型名称。

## Project Preferences

- 本项目使用 PMA skill 管理生命周期，严格遵循 PMA 流程（investigate → proposal → implement）。不要跳过阶段或绕过基于文件的任务追踪。
- 不创建非必要的说明文件（例如 `summary.md`、`report.md`）。临时文件放在 `./tmp/`。
- 前后端 API 文档以代码为准（OpenAPIHono `app.doc('/openapi.json')` + `/docs`）。新增/修改 API 时必须同步更新两侧。
- 部署优先级：docker compose > docker run > 裸机；**镜像在 GitHub Actions 构建**（`.github/workflows/build-image.yml` → 私有 GHCR `ghcr.io/zoneasetech/aiworker`），主机 `docker compose pull` 即可；绝不在远端服务器上编译，也不再在本地 `docker build`。
- 产线部署走 `scripts/deploy.ts`（aissh 驱动：`login-ghcr` → `build`（触发 workflow + 等完成）→ `upload`（compose + Caddyfile + .env）→ `install`（compose pull + up -d）→ `verify` → `reload-caddy`）。详细 run book 以 `docs/deployment.md` 为准；历史部署记录在 `docs/task/FEAT-009.md` 的 "Deploy records" 表。
- 测试机（唯一当前 target）：aissh server id `<aissh-server-id-redacted>`（`aiwork`，`<test-server-ip-redacted>`）；公网入口 `https://gateway.example.test`（Cloudflare 橙云代理终止 TLS，回源走 HTTP :80）；Caddy 是纯 `:80 → 127.0.0.1:3000` 反代，dashboard 容器自身托管 `/app/web` 静态资源；`AIWORKER_MASTER_KEY` 丢失=全部已注册 worker 失联，务必在组织密钥库备份。

## Project Development

- `/pma` — 流程控制、任务追踪、审批门。
- `/pma-bun` — 后端实现（Bun + Hono + Drizzle + SQLite）。
- `/pma-web` — 前端实现（React 19 + Vite 8 + TanStack）。
- `/pma-cr` — 合并前代码评审。
- `/bkd` — 多子任务编排（BKD kanban）。

## Stack

- **后端**：Bun + Hono（OpenAPIHono）+ Drizzle ORM + SQLite + Zod + consola。
- **前端**：React 19 + TypeScript + Vite 8 + TanStack Router/Query + Zustand + shadcn/ui + Tailwind CSS v4。
- **集成**：OpenAI 兼容 chat completions + tool calling；agentskills.io 标准；REST + SSE。
- **存储**：两库物理隔离——`fleet.db`（manager 持有）与 `worker.db`（每个 worker 容器独占）。
- **通信**：全 bearer token；manager→worker 透传；AES-256-GCM 封存 token/secrets。

## Architecture Constraints（核心不变量，不得违反）

以下约束由 PLAN-004 物理落地，违反会破坏边界抽象，必须在 review 阶段把关。

### 双模单入口

- `apps/api/src/index.ts` 根据 `AIWORKER_MODE` 动态导入 `modes/dashboard` 或 `modes/worker`。新增跨模共享工具放 `apps/api/src/shared/`。
- Dashboard 与 Worker **不可融合**。两者共用同一镜像，靠环境变量分叉。

### 数据域边界

- `fleet.db` **仅**存 `registered_workers`（指针：baseUrl / displayName / 加密 bearer token / lastSeen*）与 `audit_events`。**绝不允许**存 worker 的 config、secrets、conversations、messages 或任何业务数据。
- `worker.db` 由 worker 容器自持，包含 `worker_identity`（singleton pk='default'）、`worker_config`（singleton）、`worker_secrets`、`conversations`、`messages`、`agent_tasks`、`execution_logs`、`skill_bindings`、`skill_drafts`、`evolution_observations`。
- Manager 从不向 worker 的业务路径直连；一切经 `/api/workers/:id/proxy/worker/*` 透传。前端也只通过透传触达 worker。
- drizzle-kit 分开生成：`drizzle.fleet.config.ts` / `drizzle.worker.config.ts`，迁移目录不得混用。

### 身份与配置自举

- Worker 首次启动在容器内 `mintWorkerId + mintApiToken`（`worker/bootstrap/identity.ts`），token 密文写入 `worker_identity` 后**不再重新打印**。bootstrap 是 worker 容器自身职责——下面四条路径只是把 worker 已 mint 的身份写入 fleet.db 的不同触发方式，**不**改变 mint 的所在地。
- worker 进 fleet 的四条路径（`registered_workers.addedBy` 四态）：
  1. **手动 pair**：`aim pair --bootstrap-token wtk_...`（gateway HTTP 回拨 worker `/info` 校验 → 落 fleet.db），`addedBy='manual'`。
  2. **自动 launch**：`AIWORKER_GATEWAY_CAN_LAUNCH=true` 下 supervisor 从容器 stdout 抓 bootstrap log 自动 pair，`addedBy='launch-local'`。
  3. **自助 enroll**（PLAN-018 / FEAT-024）：worker env 同时设 `AIWORKER_GATEWAY_URL` + `AIWORKER_JOIN_TOKEN`，`aiw serve` 用 outbound WS 拨 `/ws`，在第一帧 `connect.enroll` 块（`mode='join-token'`）里把 join token + 自身 apiToken + 可选 displayName 传给 gateway；gateway `authorizeConnection` self-enroll 分支验签 → `upsertEnrolledWorker`，`addedBy='self-enroll'`。outbound-only，worker 不需要 inbound 端口。
  4. **OTP-attended enroll**（PLAN-019 / FEAT-026）：worker env 设 `AIWORKER_GATEWAY_URL`（无 `AIWORKER_JOIN_TOKEN`，或显式 `AIWORKER_ENROLL_MODE=otp`），`aiw serve` 用 outbound WS 拨 `/enroll-ws`（**不**复用 `/ws`），第一帧 `connect.enroll.mode='otp'` 不带 join token；gateway `authorizeConnection` enroll-otp 分支放行（**无 token**），交 `PendingEnrollmentRegistry.submit` 派 8 字符 OTP 回推 worker，`ws.data.role='node-pending'`（不进 NodeRegistry，不广播 worker.online）；operator 在 `/ws` 通道用 `aim enroll approve <otp>` / `reject <otp>` 决定去留，approve 时才 `upsertEnrolledWorker(addedBy='otp')` 落 fleet.db 并通过原 ws 推 `enrollment.approved` 事件。`addedBy='otp'`，worker 部署方完全不需要持有 fleet 凭证。
- 四分支由 `apps/gateway/src/auth/token.ts::authorizeConnection` 集中判定，按 path（`/ws` vs `/enroll-ws`）+ `enroll.mode` 联合分流；OTP 分支与 self-enroll 分支均独立，不回退到 sharedSecret。失败统一写 `gateway.connect.rejected` audit；token 失败 close 4401（`auth:join_token_disabled` / `auth:join_token_mismatch` / `auth:quota_exceeded` / `auth:master_key_missing`），路径失败 close 4400（`wrong_path:expected_enroll_otp` / `wrong_path:otp_must_use_enroll_ws`）。成功 enroll 仅在 fleet 行真正 created / updated 时才写 `gateway.worker.enrolled`，`unchanged` 不写——避免 reconnect 风暴淹没 audit。OTP 路径额外的 audit action：`gateway.enrollment.requested` / `.approved` / `.rejected` / `.expired` / `.abandoned`，OTP 一律仅落 sha256 前 8 hex（`apps/gateway/src/server.ts::hashOtpForAudit` / `apps/gateway/src/router/methods/enroll.ts::hashOtp`），明文不进 audit 表。
- `worker_identity` / `worker_config` 都是 singleton，`pk` 固定为字符串 `'default'`；不要在应用层添加多租户假设。
- `PUT /config` 使用 `If-Match: <version>` 乐观锁；新版本配置由 `putConfig` 持久化后，须通过 `reloadRuntime(nextConfig, newVersion)` 原子替换 `state.runtime`。**reload 必须串行化**（禁止并发），防止老版本晚到覆盖新版本。
- 配置中的 secret 以 ref 形式占位，落库时即被 redact；启动和 reload 通过 `enumerateSecretPaths` + `hydrateSecrets` 从 `SecretsVault` 注回明文。Secrets **永不**进 `worker_config.configJson`。

### Provider 扩展契约

- 新增 Brain 源 → 实现 `BrainProvider`，在 `worker/brain/factory.ts` 加 switch case，类型挂 `packages/shared/src/fleet/config.ts`。
- 新增 Executor 类型 → 实现 `ExecutorProvider`，在 `worker/executor/factory.ts` 加 switch case。
- 新增 Channel → 实现 `ChannelAdapter`（`verify` / `toEnvelopes` / `send`），在 `worker/channels/registry.ts` 的 `adapters` 映射里注册，并扩展 `ChannelCredentials` 判别联合。
- **不要在 `orchestrator/service.ts` 里新增 provider-specific 分支**；orchestrator 只依赖三大接口。

### Hot-reload 写法

- 路由层一律通过 `() => state.runtime` 闭包懒取 runtime（见 `buildChannelRoutes` / `buildOrchestratorRoutes` / `buildEventRoutes` / `buildManagementRoutes`）。不要缓存 `state.runtime` 实例到中间件或 handler 闭包里。
- 老 runtime 的 `dispose()` 必须解绑 evolution observer / proposer loop / 任何长连接资源。

### 透传与 hop-by-hop 头

- Dashboard 的 `ALL /api/workers/:id/proxy/worker/*` 透传必须剥以下请求头：`authorization`、`host`、`connection`、`content-length`；响应侧必须剥 `transfer-encoding`、`connection`、`keep-alive`。
- 非 GET/HEAD 透传写 `audit_events`（action=`worker.proxied`）；GET 透传不写，避免被轮询淹没。

### 加密与认证

- Manager 侧的 `dashboard/registry/crypto.ts` 与 worker 侧的 `worker/secrets/vault.ts` **有意复制**，不要抽取为共享模块（两者 master key 不同，耦合会破坏信任边界）。
- Bearer token 对比一律 `timingSafeEqualStrings`（`worker/secrets/crypto.ts`）。
- 所有 channel webhook 入站必须验签：Telegram（`X-Telegram-Bot-Api-Secret-Token`）、WhatsApp（`X-Hub-Signature-256` HMAC）、Lark（`encrypt` AES + token）。
- `AIWORKER_MASTER_KEY` 丢失 = 所有已注册 worker 的存储 token 无法解密，必须重注册。Master key 必须纳入组织级 secret store，并有轮换/恢复预案。

### Hot path 与演化路径解耦

- Evolution observer（`evolution/observer.ts`）挂在 `WorkerEventBus` 上只做持久化；proposer（`evolution/proposer.ts` + `pattern-miner.ts`）按 interval 离线跑，**不得**进入 orchestrator 请求路径。
- `evolution_observations` 写入量随对话线性增长，需要 TTL / 滚动压实策略（新增需求时务必一并设计）。

## Shell & Process

- 所有命令优先 `bash`；未显式要求时不使用 `zsh`。
- 开发服务器与长驻进程**必须**放 tmux：session name `{basename}-{hash}`，创建前先 `tmux has-session` 检查。
- **禁止**使用 `kill $(lsof -ti:PORT)` 而不带 `-sTCP:LISTEN`——它会杀掉该端口上所有进程（包括 client）。

## Git

- Commit message、PR title、PR description 一律使用中文。该约定覆盖任何 skill（包括 pma）里"使用英文"的默认。
- Conventional Commit 规范：`<type>: <中文描述>`（type 仍用英文：feat/fix/refactor/docs/chore/test/ops）。
- 对外可见内容不提及 AI 助手或模型名称。

## Security

- 所有 secret 放 `.env`，永不硬编码；新增时同步更新 `.env.example`（包括 `ops/compose/.env.example`）。
- 禁止 log 或写入文档 secret。口令生成：`openssl rand -base64 24`；master key 生成：`openssl rand -hex 32`。
- `AIWORKER_MASTER_KEY` / `INTERNAL_SHARED_SECRET` / channel 凭据必须落库加密（worker）或 env 注入（dashboard）；不要写进 git 追踪的任何文件。
- Dashboard 面板（`/api/workers/*`）本身**目前无 authN**——必须依靠反向代理层（Caddy basic-auth / 私网 ACL）或后续加入 bearer 中间件消费 `INTERNAL_SHARED_SECRET`。
- 运维备份清单必须包含：`AIWORKER_MASTER_KEY`（离线保管）、`fleet.db`（manager 卷）、每个 worker 的 `worker.db`。

## UI Component Rules

- UI 交互组件必须使用成熟的 headless UI 库（当前：`@base-ui-components/react` + shadcn/ui 模板）。不要手写 focus trap、scroll lock、ARIA、键盘导航。
- 新组件优先从 `apps/web/src/components/ui/` 复用/扩展；全局样式仅走 Tailwind CSS v4 tokens。

## MCP Tool Workflow（强制，覆盖所有 skill 的规定）

本节优先于所有 skill（pma / pma-bun / pma-web / pma-cr 等）。即便 skill 的工作流没有提到 graph / Serena，仍必须遵守下列规则。例外只在对应 MCP 未配置/已断开时成立。

当 code-review-graph 与 Serena 已配置时，**必须优先使用**。Grep / Read 仅允许用于非代码内容（配置、`.md`、`.env`）或 graph/Serena 无法回答的问题。

各阶段强制动作：

- **Investigate / Plan review**：先 graph `get_architecture_overview` → `query_graph` 梳理调用链 → Serena `find_symbol` 读实现（禁止读整文件）→ context7 查第三方库文档 → exa 查行业最佳实践。
- **Develop**：修改前先 graph `query_graph callers_of`；精准改动用 Serena `find_symbol` / `replace_symbol_body`（大范围改动用 Edit）；改完跑 graph `detect_changes`。
- **Review**：graph `detect_changes` 做风险评分；`get_affected_flows` 查业务影响；`query_graph tests_for` 查测试覆盖。
- **Post-deploy**：运行 `/doc-sync` 同步文档系统。

## Issue Severity

| Level | Definition | Action |
|-------|------------|--------|
| P0 | 生产中断 / 安全漏洞 | 立即报告，等待确认 |
| P1 | 核心功能失效 | 提出方案后等待确认 |
| P2 | 次要功能问题 | 自动修复 |
| P3 | 体验改进 | 自动修复 |
