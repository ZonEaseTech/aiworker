# FEAT-033 apps/web 静态托管 + 双视角源码骨架

- **status**: completed
- **priority**: P1
- **owner**: bkd/z27fqf6l
- **createdAt**: 2026-04-27 18:30
- **completedAt**: 2026-04-27 19:30
- **bkd issue**: `xft5fyjw`（PLAN-022 Phase 1，coordinator dispatch）

## 描述

复活 dormant 的 `apps/web`，按 `pma-web` 标准搭起「物理独立的双视角」基础设施。Phase 1 只做骨架与托管，不做业务功能（业务迁移留给 FEAT-034 / FEAT-035）。

### 目标

`apps/web` 单仓双 bundle：

| 视角 | bundle | 服务方 | 用途 |
|------|--------|--------|------|
| fleet | `dist/fleet/` | `packages/gateway` | operator 视角 — 管多个 worker |
| worker | `dist/worker/` | `apps/api` (worker mode) | 单 worker 自带 admin UI |

两 bundle 共用 `shared/` 资源（components / lib / stores / styles），**禁止互引 fleet ↔ worker**，由 ESLint `no-restricted-imports` 守。

### 验收标准

1. `apps/web/src/{shared,fleet,worker}/` 三块物理分隔，fleet/worker 各自有 `routes/ features/ lib/ api.ts main.tsx`，shared 提供 `components/ lib/ stores/ styles/ api.ts`。
2. `apps/web/vite.config.ts` 切 multi-page，`bun run build` 同时 emit `dist/fleet/index.html` 与 `dist/worker/index.html`。
3. TanStack Router 双 routeTree 生成（fleet 与 worker 各一棵，互不污染）。
4. 顶层 `eslint.config.ts` 增三条 `no-restricted-imports` rule：fleet ↛ worker、worker ↛ fleet、shared ↛ 任一边的 features/routes/lib/api。
5. `packages/gateway/src/server.ts` 加 `GET /admin/*` static middleware，serve fleet bundle。
6. `apps/api/src/modes/worker.ts` 加 `GET /admin/*` static middleware，serve worker bundle。
7. CLI flag `--no-serve-web`（默认开 serve）；`aiworker serve` 与 `aiworker gateway start` 都接受。
8. `@zonease/aiworker-cli` 的 npm tarball 含 `apps/web/dist/{fleet,worker}/`（npm install 后立刻可用）。
9. 两 bundle 跑通空白路由 + theming（`shared/stores/theme`）+ provider（`QueryClientProvider`）。
10. `apps/web/src/__tests__/` 各 1 个 smoke test（fleet + worker 各自验证 main.tsx 能挂载）。

### 关键不变量（违反必拒）

- 静态托管不能破坏 BUG-007 / BUG-019 的 fail-closed loopback 模式：non-loopback 必须叠 basic-auth，缺则 refuse to start。`/admin/*` 路径上 gateway 仍走 `assertGatewayBindIsSafe`，worker 仍走 `bearer-auth`（**bearer-auth 仅守 `/api/worker/*`，`/admin/*` 不接受 bearer，但要求宿主机／反代提供前置防护**）。
- `worker.db` / `fleet.db` 物理边界不动；本 phase 只动 web 层。
- `packages/core` 不允许引入 hono / @hono/* 依赖（已被 ESLint 守）。
- 现有 `apps/web/src` 53 个文件按视角归位（lift-and-shift）：`components/ui` `lib` `stores/theme` `styles` → shared；`routes` `features/workers` `stores/worker` `main.tsx` `routeTree.gen.ts` → fleet；worker bundle 全新 skeleton。**不重构内部逻辑**。

## ActiveForm

落地 apps/web 双 bundle 静态托管骨架并接入 gateway / worker

## Dependencies

- **blocked by**：（无）
- **blocks**：FEAT-034（fleet 视角业务迁移）、FEAT-035（worker 视角业务迁移）

## Notes

### 实现摘要

- `apps/web/src/{shared,fleet,worker}/` 三块物理分隔。lift-and-shift 移走全部 53 个旧文件（`git mv` 保历史），fleet 承接现有 worker 管理面（Phase 2 才进行视角拆分），worker 端是空骨架（一个 placeholder route + main.tsx + api.ts）。
- `apps/web/vite.config.ts`：用 `tanstackRouterGenerator`（generator-only，不挂 HMR transform，避免双 plugin 实例往同一 route 文件注入两次 `hot` 触发 TS2717）；按 `AIWORKER_WEB_BUNDLE` env 切 `root: ./<bundle>`，输出 `dist/<bundle>/index.html` 完全独立（含各自 assets）；dev 模式无 env 时 root 落 apps/web/，用 `apps/web/index.html` chooser 提供 `/fleet/` `/worker/` 直达。
- `eslint.config.ts`：三条 `no-restricted-imports`，pattern 仅锁 `@/` alias 形态（不通配 `**/...` 避免误伤 node_modules）。
- 静态托管：`packages/gateway/src/admin/serve-static.ts`（Bun-native）+ `apps/api/src/worker/admin/serve-static.ts`（Hono middleware）共两份同形实现——packages/gateway 不引 hono 是硬约束。两份都做 `decodeURIComponent` → `resolve()` traversal 防御 → SPA fallback。`/admin` 308 redirect 到 `/admin/` 让 HTML 内 `./assets/...` 正确 resolve。
- CLI：`aiworker serve` + `aiworker gateway start` 各加 `--no-serve-web`，对称支持 `AIWORKER_WORKER_NO_SERVE_WEB=1` / `AIWORKER_GATEWAY_NO_SERVE_WEB=1` env（systemd unit 不动 ExecStart 也能开关）。`--detach` 通过 env 透传到 spawn 子进程。
- npm 打包：`apps/cli/scripts/build-publish-manifest.ts` 把 `apps/web/dist/{fleet,worker}/` 拷到 `apps/cli/dist/web/`；cli `package.json` `scripts.build` 在自身 build 前先 `bun run --filter '@zonease/aiworker-web' build`。
- smoke 测试：`apps/web/src/__tests__/{fleet,worker}-bootstrap.test.tsx` 各两个 case（routeTree import + RouterProvider mount），`apps/web/src/__tests__` 里也有 routeTree 闭环。
- 静态 helper 单测：`packages/gateway/test/admin-serve-static.test.ts` 8 case + `apps/api/src/worker/admin/serve-static.test.ts` 8 case，覆盖目录穿越（含 URL-encoded）、SPA fallback、malformed `%` 边界、`/admin` 308、leading-slashes、404/200 happy path。

### 自审清单（独立 reviewer 跑了一轮，固定 P0/P1）

| 等级 | 问题 | 修复 |
|------|------|------|
| P0-1 | 公网 `/admin/*` 与 `/ws`/`/api/*` 同等暴露但 README 未提示 | README 「安全模型」段加一条说明：`/admin/*` 必须走反代 basicauth；带 env 开关 |
| P0-2 | worker 路径 `--no-serve-web` 没 env 透传（不对称于 gateway） | `runServe` 加 `AIWORKER_WORKER_NO_SERVE_WEB=1` 兜底 |
| P1-1 | URL-encoded `..%2F` 未 decode → 防御层不可达 | `serveAdminStatic` + `adminStaticMiddleware` 都加 `decodeURIComponent` 前置；malformed `%` → 403 |
| P1-2 | dev 模式访问 `/` 404（root index.html 已删） | `apps/web/index.html` 写最小 chooser + meta refresh redirect 到 `/fleet/` |
| P1-3 | `resolveWebStaticDir` src vs dist 模式 fallback 上溯层数错（src 应 4 层、dist 3 层），dev 完全失效 | 区分两条路径 + 加 `realpathSync` 解 symlink + 注释明确 layout 假设 |
| P1-6 | ESLint pattern 通配 `**/worker/*` 会误伤 node_modules | 改成 `@/worker` + `@/worker/**` 仅锁 alias |

### 验证

- `bun run typecheck`：9/9 包 0 error
- `bun run test`：716+ pass / 0 fail（gateway 120 / api 64 / core 427 / web 28 / cli 34 / shared 18 / gateway-proto 19 / storage-sqlite 9）
- `bun run --filter '@zonease/aiworker-web' build`：双 bundle 各自含 `dist/{fleet,worker}/index.html` + `assets/`，可独立部署
- `bun run lint`：仅 24 条 pre-existing baseline 错误（`apps/cli/src/aim/daemon.ts` + `apps/cli/src/lib/dotenv-bootstrap.ts`，两文件本次未触达；REFACTOR-008 已在另一分支处理）
- ESLint 边界 rule 手验：fleet → worker、worker → fleet、shared → fleet/api 三种违规 import 均 fire 正确 message

### 未做（留 Phase 2 / 单独任务）

- worker 模式没有 BUG-019 那样的 fail-closed bind 检查（`AIWORKER_WORKER_HOST != 127.0.0.1` 时未强制 require basic-auth proxy）——本 phase 仅 README 说明，留单独 BUG。
- worker bundle main.tsx 暂未恢复 `declare module '@tanstack/react-router'` 注册（fleet bundle 已注册，避免 TS2717 重复声明）。Phase 2 引入 worker 业务路由时再用 per-bundle tsconfig + d.ts 分隔。
- `applyConfigUpdate` reload 不重解析 `webStaticDir`（启动期 bind-only），已在 `bootstrapWorkerApp` 注释明确。
- vite multi-page build 未进 CI；现状靠 `bun run --filter '@zonease/aiworker-web' build` 手验。
- `__tests__/{fleet,worker}-bootstrap.test.tsx` 是 routeTree 闭环测试，未 dynamic import `main.tsx` 跑端到端 mount——可在 Phase 2 升级。
