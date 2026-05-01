# AIWorker

AIWorker 是自托管 worker/fleet runtime。Gateway 是 WebSocket 控制面，持有 `fleet.db`；worker 是数据面，持有各自的 `worker.db`。完整架构以 [`docs/architecture.md`](docs/architecture.md) 为准。

## 工作规则

- 默认用中文与用户交流；文档、代码注释、commit message、PR title/description 也默认中文。
- 对外可见内容避免提及具体协作工具、模型名称或内部执行过程，除非用户明确要求。
- 开发任务使用 `/pma`：先调查，再 proposal，获批后实现，并同步 `docs/task/*.md`。后端用 `/pma-bun`，前端用 `/pma-web`，代码评审用 `/pma-cr`，复杂编排按需用 `/bkd`。
- 不创建非必要说明文件。临时产物放 `tmp/`。

## 常用命令

- 安装依赖：`bun install`
- 全量类型检查：`bun run typecheck`
- 全量 lint：`bun run lint`
- 全量测试：`bun run test`
- 常规验证：`bun run check`
- 构建发布产物：`bun run build`
- 聚焦某个 workspace：`bun run --filter '@zonease/aiworker-core' test`
- Web 构建：`bun run --filter '@zonease/aiworker-web' build`
- API 构建：`bun run --filter '@zonease/aiworker-api' build`
- CLI bundle：`bun run --filter '@zonease/aiworker-cli' build:bundle`
- 数据库 schema 生成：`bun run db:generate:fleet` / `bun run db:generate:worker`
- code-review-graph 状态/刷新/变更审查：`bun run crg:status` / `bun run crg:update` / `bun run crg:review`

优先跑和改动范围匹配的聚焦命令；跨 package、发布、迁移或安全相关改动再跑全量 gate。

## 仓库结构

- `apps/api`：worker HTTP API、OpenAPIHono 文档、worker admin 静态托管。
- `apps/gateway`：fleet WebSocket gateway、worker registry、enrollment、audit。
- `apps/cli`：单一 `aiworker` CLI。
- `apps/web`：fleet 与 worker 两套 admin bundle。
- `packages/core`：transport-agnostic worker runtime。
- `packages/gateway-proto`：gateway WS 协议类型和 zod 校验。
- `packages/storage-sqlite`：`fleet.db` / `worker.db` schema、Drizzle 配置和迁移。
- `packages/fs-layout`：`AIWORKER_HOME`、project scope、worker home 与模板解析。
- `packages/shared`：共享类型与工具。

## 技术栈

- 后端：Bun、Hono/OpenAPIHono、Drizzle ORM、SQLite、Zod、consola。
- 前端：React 19、Vite 8、TanStack Router/Query、Zustand、Base UI/shadcn/ui、Tailwind CSS v4。
- Runtime：Brain provider 当前以 filesystem 为权威；Executor 支持 `http`、`claude-code`、`codex`、`acp`、`cursor`、`mcp` 等 engine。扩展点见 [`docs/executor-engines.md`](docs/executor-engines.md) 与 [`docs/architecture.md`](docs/architecture.md)。

## 能力边界

- Brain capability 与 Executor capability 必须隔离设计、隔离持久化、隔离同步；不要用 Brain 的 memory/persona/prompt skill/capability-pack 机制去配置 executor 原生能力。
- Executor capability 指 engine 自身运行时可用的能力，例如 Claude/Codex/Cursor 的 MCP server、engine-native skill/plugin、sandbox、approval 或 project-scope CLI 配置。AIWorker 只做声明、校验、dry-run、sync/projection；具体落地优先通过 engine 官方 CLI 或官方配置格式完成。
- Brain capability 指 worker 自身的 filesystem brain、长期记忆、persona、prompt skill 与未来学习沉淀；这层如何选择、注入、演化另行设计，不能成为 executor MCP/skill/plugin 配置的前置条件。
- CLI、API、DB schema、文档里出现 `mcp`、`skill`、`plugin` 等重名概念时必须显式加限定词，例如 `executor mcp`、`engine plugin`、`brain skill`，避免跨层复用语义。
- Executor capability 涉及 secret 时只能存 ref，经 vault/hydration 在投影或运行时注入；不要把明文 secret 写入 engine project config、`.aiworker/*.json` 或 worker configJson。

## 架构不变量

- `fleet.db` 只存 `registered_workers` 和 `audit_events` 等 fleet 指针/审计数据；worker 的 config、secrets、conversations、messages 必须留在 `worker.db`。
- Fleet 与 worker migration 分开：`drizzle.fleet.config.ts`、`drizzle.worker.config.ts` 和对应迁移目录不要混用。
- `worker_config.configJson` 不存明文 secret；配置里只能存 ref，启动/reload 时经 `enumerateSecretPaths`、`hydrateSecrets`、`SecretsVault` 注回。
- 新 Brain/Executor/Channel 只通过 `packages/core/src/worker/*` 的 provider/adapter 接口扩展；不要在 orchestrator 加 provider-specific 分支。
- `packages/core` 不依赖 `hono`、`@hono/*`、`@scalar/*`；transport 边界由 ESLint `no-restricted-imports` 守。
- Hot reload 必须懒取当前 runtime，reload 串行化，旧 runtime 的 `dispose()` 必须解绑长连接资源。

## 安全

- secret 放 `.env` 或 vault，永不硬编码；新增 env 时同步 `.env.example` 或对应示例文件。
- bearer/token 比较使用 `timingSafeEqualStrings`。
- `AIWORKER_MASTER_KEY` 必须离线备份；丢失会导致已注册 worker token 无法解密。
- Telegram、WhatsApp、Lark 等 channel webhook 必须验签；web channel 必须有 inbound bearer。
- 公开 admin、gateway 或 worker 入口时遵守 fail-closed 外部鉴权规则。部署细节见 [`docs/deployment.md`](docs/deployment.md) 和 [`docs/deployment-public-https.md`](docs/deployment-public-https.md)。
- 测试服和发布验证部署规则以 [`docs/task/REFACTOR-004.md`](docs/task/REFACTOR-004.md) 为准；不要把源码部署、docker compose 或远端 build 当成默认路径。

## API 与数据

- API 文档以代码为准：OpenAPIHono `app.doc('/openapi.json')` + `/docs`。
- 新增或修改 API 时同步 zod schema、OpenAPI metadata、typed client/proto 和相关测试。
- schema 变更必须通过 `packages/storage-sqlite` 的 Drizzle schema 与 migration 生成，不手写应用层绕过。

## UI

- 新组件优先复用 `apps/web/src/shared/components/ui/` 和已有 shared primitives。
- 交互组件使用成熟 headless UI；不要手写 focus trap、scroll lock、ARIA、键盘导航。
- 所有颜色、字号、间距、圆角、阴影等视觉值来自根目录 [`DESIGN.md`](DESIGN.md)，通过 Tailwind CSS v4 `@theme` 接入；禁止新增 hex 字面量和 arbitrary value。
- Fleet UI 只走 gateway WS；Worker UI 只走 worker REST/SSE + bearer-auth，两边源码边界不能交叉。

## Shell 与进程

- 命令默认用 `bash`。
- 开发服务器和长驻进程优先放 tmux：session name 用 `{basename}-{hash}`，创建前先 `tmux has-session`；如果环境没有 `tmux`，使用 `setsid`/`nohup` + 明确 pidfile/logfile，并在完成后清理。
- 测试 Codex executor 或 Codex-backed worker 时保持真实用户 `HOME`，让 Codex CLI 读取已有认证和 sandbox 配置；只用 `AIWORKER_HOME`、DB 路径、data root、log、pidfile 隔离 AIWorker 状态。需要验证默认 HOME 初始化行为时，单独做非 Codex 场景。
- 禁止 `kill $(lsof -ti:PORT)`；如需按端口处理，只匹配监听进程，例如 `lsof -tiTCP:PORT -sTCP:LISTEN`。

## Git

- Commit message / PR title / PR description 使用中文；Conventional Commit type 保持英文，例如 `feat:`、`fix:`、`refactor:`、`docs:`、`chore:`、`test:`、`ops:`。
- 提交前给出已运行的验证命令和结果；未能运行的 gate 要说明原因。

## 工具偏好

- 简单文件查找优先 `rg` / `rg --files`。
- 跨调用链影响分析可用 code-review-graph；大型符号定位可用 Serena；第三方库文档按需用 context7。
- 使用 code-review-graph 时优先从 `get_minimal_context` 起步；审查变更用 `detect_changes`、`get_affected_flows`、`get_impact_radius`，定位关系用 `query_graph`、`list_communities`、`list_flows`。CLI 统一走 `bun run crg:*`，避免本机 PATH 版本漂移。当前规避 `get_docs_section`、hub/bridge/gaps/surprising 相关端点，它们在本仓库环境下会返回工具错误。
- 单文件文档/配置改动直接读写即可，不需要强行使用 MCP。
