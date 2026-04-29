# AIWorker

自托管 Agent Runtime：由 Brain provider（知识/记忆）与 Executor provider（OpenAI 兼容 chat completions + tool calling）组合而成。

仓库采用 Bun workspaces 布局：`apps/{api,cli,gateway,web}` + `packages/{core,gateway-proto,shared,storage-sqlite,fs-layout}`。Gateway 是 WS 控制面（fleet.db），worker 是数据面（worker.db），通过 WebSocket + bearer 通信。完整架构见 `docs/architecture.md`。

## Agent Rules

- 所有输出（文档、代码注释、commit message、PR description）默认使用中文。与用户交流也用中文。
- 对外可见内容中不提及 AI 助手、Agent 或协作模型名称。

## Project Preferences

- 用 PMA skill 管理生命周期（investigate → proposal → implement），不跳阶段、不绕过 `docs/task/*.md` 文件追踪。
- 不创建非必要的说明文件（`summary.md` / `report.md` 等）。临时文件放 `./tmp/`。
- API 文档以代码为准（OpenAPIHono `app.doc('/openapi.json')` + `/docs`）。新增/修改 API 时同步更新 schema。
- **测试服只允许两件事**：`npm install -g @zonease/aiworker-cli@<version>` + `aiworker install systemd`，加 Caddy 反代（人工维护）。**禁止** git clone 源码、`docker compose pull` GHCR、远端 `bun build` / `tsc`。`scripts/deploy.ts` + `ops/compose/*.yml` 仅作其他自托管者参考，不再用于测试服。详情见 `docs/task/REFACTOR-004.md`。

## Project Development

- `/pma` 流程控制 / `/pma-bun` 后端 / `/pma-web` 前端 / `/pma-cr` 代码评审 / `/bkd` 多子任务编排。

## Stack

- **后端**：Bun + Hono（OpenAPIHono）+ Drizzle ORM + SQLite + Zod + consola。
- **前端**：React 19 + Vite 8 + TanStack Router/Query + Zustand + shadcn/ui + Tailwind CSS v4。
- **存储**：`fleet.db`（gateway 持有，仅 `registered_workers` + `audit_events`）与 `worker.db`（每 worker 独占）物理隔离。
- **通信**：bearer token；AES-256-GCM 封存 token / secrets。

## 关键不变量（违反必拒）

- **数据域边界**：`fleet.db` 绝不放 worker 业务数据（config / secrets / conversations / messages）；`worker.db` 由 worker 自持。drizzle-kit 配置分开（`drizzle.fleet.config.ts` vs `drizzle.worker.config.ts`），迁移目录不混用。
- **Worker 入 fleet 的四条路径**（`registered_workers.addedBy`）：`manual` (手动 pair) / `launch-local` (gateway supervisor 自动拉) / `self-enroll` (worker 持 `AIWORKER_JOIN_TOKEN`) / `otp` (operator 在 `/ws` approve OTP)。集中判定在 `apps/gateway/src/auth/token.ts::authorizeConnection`，按路径 `/ws` vs `/enroll-ws` + `enroll.mode` 分流。
- **Hot-reload**：路由层用 `() => state.runtime` 闭包懒取 runtime（不要把 runtime 实例冻进闭包）；reload 必须串行化（防止老版本晚到覆盖新版本）；老 runtime 的 `dispose()` 必须解绑长连接资源。
- **Secrets 与 config**：`worker_config.configJson` 永不存明文 secret——配置中的 secret 以 ref 形式占位，启动 / reload 时通过 `enumerateSecretPaths` + `hydrateSecrets` 从 `SecretsVault` 注回。
- **Provider 扩展契约**（实现都在 `packages/core/src/worker/`）：新 Brain → 实现 `BrainProvider` + 在 `brain/factory.ts` 加 case；新 Executor → `ExecutorProvider` + `executor/factory.ts`；新 Channel → `ChannelAdapter` + `channels/registry.ts`。**不要在 orchestrator 里加 provider-specific 分支**，orchestrator 只依赖三大接口。
- **Channel webhook 必须验签**：Telegram (`X-Telegram-Bot-Api-Secret-Token`) / WhatsApp (`X-Hub-Signature-256` HMAC) / Lark (`encrypt` AES + token)。
- **Bearer token 比较**一律 `timingSafeEqualStrings`；`AIWORKER_MASTER_KEY` 丢失 = 全部已注册 worker token 解不开，必须备份在组织密钥库。
- **Transport 与业务边界**：`packages/core` 不依赖 `hono` / `@hono/*` / `@scalar/*`，由 ESLint `no-restricted-imports` 守，CI 拦回退耦合。

## Shell & Process

- 命令优先 `bash`，未明示不用 `zsh`。
- 开发服务器与长驻进程放 tmux：session name `{basename}-{hash}`，创建前 `tmux has-session` 检查。
- **禁止** `kill $(lsof -ti:PORT)` 不带 `-sTCP:LISTEN`——会杀掉端口上所有进程（含 client）。

## Git

- Commit message / PR title / PR description 一律中文（覆盖 skill 默认）。Conventional Commit type 仍用英文：`feat:` / `fix:` / `refactor:` / `docs:` / `chore:` / `test:` / `ops:`。

## Security

- secret 放 `.env`，永不硬编码；新增同步 `.env.example`（含 `ops/compose/.env.example`）。
- 禁止 log / 写入文档 secret。生成口令 `openssl rand -base64 24`；master key `openssl rand -hex 32`。
- 运维备份必须含：`AIWORKER_MASTER_KEY`（离线）、`fleet.db`、每个 worker 的 `worker.db`。
- 公开 Caddy 反代必须叠 basic-auth（fail-closed），见 `docs/task/BUG-007.md`——loopback 绕过 token 校验，反代后所有流量看起来都是 loopback。

## UI

- 交互组件用成熟 headless UI 库（`@base-ui-components/react` + shadcn/ui 模板）。不要手写 focus trap / scroll lock / ARIA / 键盘导航。
- 新组件优先复用 `apps/web/src/components/ui/`；全局样式仅走 Tailwind CSS v4 tokens。
- 所有 UI 视觉值（颜色 / 字号 / 间距 / 圆角 / 阴影）必须来自项目根目录的 `DESIGN.md`。
- 视觉值通过 Tailwind CSS v4 `@theme` 接入，禁止 hex 字面量和 arbitrary value。
- 视觉值冲突时，`DESIGN.md` 优先于 `pma-web`。

## MCP 工具偏好

按需使用，非强制。`code-review-graph` + `serena` 已配置时**优先**用于：
- 跨调用链的 impact 分析（`get_affected_flows` / `query_graph callers_of`）
- 大型代码库的符号定位（`find_symbol`）
- 第三方库文档（`context7`）

简单查找、单文件改动、文档/配置编辑——直接 Grep / Read / Edit 即可，不必绕道 MCP。

## Issue Severity

| Level | Definition | Action |
|-------|------------|--------|
| P0 | 生产中断 / 安全漏洞 | 立即报告，等待确认 |
| P1 | 核心功能失效 | 提出方案后等待确认 |
| P2 | 次要功能问题 | 自动修复 |
| P3 | 体验改进 | 自动修复 |
