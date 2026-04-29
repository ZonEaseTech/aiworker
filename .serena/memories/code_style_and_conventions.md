# Code Style And Conventions

语言与格式：
- TypeScript ESM monorepo，package manager/runtime/test runner 以 Bun 为主。
- ESLint 使用 @antfu/eslint-config，开启 TypeScript 与 React 规则。
- 默认中文文档、中文代码注释和中文 commit/PR 描述；Conventional Commit type 保持英文，例如 `feat:`、`fix:`、`refactor:`、`docs:`、`test:`、`chore:`、`ops:`。
- 注释保持简洁，只在解释复杂边界、约束或非显然行为时添加。

后端约定：
- API 文档以 OpenAPIHono 代码为准：`app.doc('/openapi.json')` + `/docs`。
- 新增或修改 API 时同步 zod schema、OpenAPI metadata、typed client/proto 和相关测试。
- `packages/core` 必须 transport-agnostic，不依赖 `hono`、`@hono/*`、`@scalar/*` 或 `apps/*`。
- 新 Brain/Executor/Channel 通过 `packages/core/src/worker/*` 的 provider/adapter 接口扩展，不在 orchestrator 加 provider-specific 分支。
- bearer/token 比较使用 `timingSafeEqualStrings`。

数据与安全：
- fleet.db 只存 registered_workers、audit_events 等 fleet 指针/审计数据；worker config、secrets、conversations、messages 留在 worker.db。
- fleet 和 worker migration 分开，分别使用 `drizzle.fleet.config.ts` / `drizzle.worker.config.ts` 和对应迁移目录。
- `worker_config.configJson` 不存明文 secret；配置只能存 ref，启动/reload 时经 `enumerateSecretPaths`、`hydrateSecrets`、`SecretsVault` 注回。
- schema 变更必须走 packages/storage-sqlite 的 Drizzle schema 与 migration 生成，不手写应用层绕过。

前端约定：
- 新组件优先复用 `apps/web/src/shared/components/ui/` 和已有 shared primitives。
- 交互组件使用成熟 headless UI，不手写 focus trap、scroll lock、ARIA、键盘导航。
- 视觉值来自根目录 DESIGN.md 并通过 Tailwind CSS v4 `@theme` 接入；禁止新增 hex 字面量和 arbitrary value。
- Fleet UI 只走 gateway WS；Worker UI 只走 worker REST/SSE + bearer-auth；两边源码边界不能交叉。

Shell/进程：
- 命令默认 bash。
- 开发服务器和长驻进程放 tmux，session name 用 `{basename}-{hash}`，创建前先 `tmux has-session`。
- 禁止 `kill $(lsof -ti:PORT)`；按端口处理只匹配监听进程：`lsof -tiTCP:PORT -sTCP:LISTEN`。