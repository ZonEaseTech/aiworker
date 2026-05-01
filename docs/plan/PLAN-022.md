# PLAN-022 复活并重构 Worker + Fleet Web UI（epic）

- **status**: completed
- **createdAt**: 2026-04-27 18:30
- **approvedAt**: 2026-04-27 18:35
- **completedAt**: 2026-05-01 14:53
- **relatedTask**: FEAT-032

## 完成标记 / Absorbed By Child Plans

本 epic plan 已被 FEAT-033、FEAT-034、FEAT-035、REFACTOR-009、REFACTOR-010 的实际交付吸收并完成。当前代码已经具备 fleet / worker 双视角 Web UI、双 bundle、静态托管、gateway WS / worker REST 边界和基础回归保护。

本文保留为历史设计记录，不再作为新的 Web UI 工作入口。

## 现状

### 1. apps/web 当前是 dormant 状态

- 存在完整 React 19 + Vite 8 + TanStack Router/Query + Zustand + shadcn/ui + Tailwind v4 stack（与 pma-web 标准一致），含 `apps/web/src/features/workers/{components,hooks.ts}`、`apps/web/src/lib/{api.ts,gateway-client.ts}`，bundle 可以构建。
- **但镜像里没有任何 HTTP server 在 serve 这个 bundle**。`Dockerfile:57` 注释直说「web 静态资源已被 PLAN-013 S5 下线（浏览器走 WS）」。`packages/gateway/src/{server.ts,index.ts}` 只暴露 `/ws` + `/enroll-ws`，无 static middleware；`apps/api/src/modes/worker.ts` 也只挂 `/api/worker/*` + `/openapi.json`，无 static middleware。
- 操作员当前只能用 `aiworker` CLI（aim 已合并），web 视角实质缺失。

### 2. 现有 web 代码已对接 gateway WS，但能力被 proto 限制

- `apps/web/src/lib/api.ts` 完整改写为通过 `getGatewayClient().request()` 调用，error 已映射到 `WorkerApiError`。
- `packages/gateway-proto/src/methods.ts` 已暴露：`workers.{list,info,pair,launch,stop,remove}` / `enroll.{list,approve,reject}` / `chat.send` / `config.{get,put}` / `token.rotate` / `logs.tail` / `system.presence` / `approval.{list,grant}` / `cron.{list,add,remove,update}`。
- **未暴露但 UI 需要**：worker secrets CRUD、brain test、executor test、channel test、engine availability、capabilities（max workers / canLaunch）、audit events 浏览。`api.ts` 对应函数全是 `unsupported(...)` 抛错或返回空数组。

### 3. 现存 routes 是混合视角，无独立性

- `apps/web/src/routes/` 仅 `index.tsx` / `__root.tsx` / `workers.index.tsx` / `workers.$workerId.tsx`，全部以「单 worker 的 self-management」视角组织——顶部 worker switcher、左侧侧栏、右侧 detail。
- 没有专门的 fleet 视角（fleet workers 列表 + 状态 + enrollment OTP 审批队列 + audit + presence），也没有 worker-direct self-service 视角（脱离 fleet 的 single worker 自我配置）。
- 当前 components/features/lib **完全混在一起**：fleet-only 操作（workers.list/launch/pair/remove）和 worker-only 操作（config/secrets/test）共用 `features/workers/`，无源码层分隔，没有 ESLint guard 防止 worker UI 误依赖 fleet client。

### 4. 数据域边界 vs UI 视角

仓库不变量明确：`fleet.db`（gateway 持有，仅 `registered_workers` + `audit_events`）与 `worker.db`（每 worker 独占）物理隔离。drizzle 配置分开。当前 web 把这两边的视图揉到一个 SPA 里，有违这条边界——需要在 UI 层也体现物理隔离。

### 5. 已发布 npm CLI（REFACTOR-004）改变了部署形态

- 测试服只允许 `npm install -g @zonease/aiworker-cli@<v>` + `aiworker install systemd`，**不再** docker compose pull GHCR 也不再 git clone 源码 build。这意味着：
  - web bundle 必须能通过 npm package 分发（已 publish 路径里）
  - 启动 web 的入口必须是 CLI 子命令（`aiworker gateway start --serve-web` / `aiworker worker start --serve-web` 之类）
  - 不能再依赖 Dockerfile 里的 `COPY apps/web/dist`

### 6. 现有部分组件可复用

`apps/web/src/features/workers/components/` 已经有 `workers-list.tsx`、`register-wizard.tsx`、`create-wizard.tsx`、`worker-shell.tsx`、`activity-panel.tsx`、`secrets-panel.tsx`、`test-panel.tsx`、`config-editor/`。这些 UX 大部分能搬到新结构里，避免重写。

## 方案

### 总策略

**沿用 apps/web，按 pma-web 标准重组为「物理独立的双视角 SPA」**，与数据域边界 (fleet.db vs worker.db) 对齐。源码 monorepo 共享 components/ui + 类型，但 routes/features/data 层物理分隔，由 ESLint `no-restricted-imports` 守。

托管模型（与 REFACTOR-004 部署形态对齐）：

| 视角 | 托管者 | 数据通道 | 默认入口 |
|------|--------|----------|----------|
| **Fleet UI** | gateway (HTTP middleware) | gateway WS (`/ws`) | `aiworker gateway start --serve-web` 或默认开 |
| **Worker UI** | worker apps/api (HTTP middleware) | worker REST (`/api/worker/*`) + bearer-auth | 直连 worker 端口（loopback 默认免 token，公网必须叠 basic-auth；BUG-007 已建立的不变量延伸） |

**核心原则**：fleet UI 永远不调 worker REST，worker UI 永远不调 gateway WS。两边都各自只看见自己物理隔离的数据，数据对齐到 fleet.db / worker.db 边界。

### 五个 Phase（按 MVP 分阶段，每个 Phase 一个独立 FEAT/REFACTOR，方便 BKD 分发）

#### Phase 1 — 基础设施：静态托管 + 双视角源码骨架（FEAT-033, P1）

**输出**：
1. `apps/web/src/` 顶层重构：
   ```
   apps/web/src/
   ├── shared/              # components/ui + lib/utils + 类型；两边可用
   ├── fleet/
   │   ├── routes/__root.tsx, index.tsx, workers.tsx, enroll.tsx, audit.tsx
   │   ├── features/{workers,enroll,audit}/
   │   ├── lib/api.ts       # 仅调 gateway WS
   │   └── main.tsx         # bundle 入口
   └── worker/
       ├── routes/__root.tsx, index.tsx, config.tsx, cron.tsx, approvals.tsx, chat.tsx
       ├── features/{config,cron,approvals,chat}/
       ├── lib/api.ts       # 仅调 worker REST + bearer-auth
       └── main.tsx         # bundle 入口
   ```
2. `apps/web/vite.config.ts` 改 multi-page：emit `dist/fleet/index.html` + `dist/worker/index.html`，共用 chunk vendoring。
3. ESLint `no-restricted-imports`：
   - `src/fleet/**` 禁 import `src/worker/**` 与 worker REST client
   - `src/worker/**` 禁 import `src/fleet/**` 与 gateway WS client
   - `src/shared/**` 禁 import 任一边的 features/routes/lib/api
4. `packages/gateway/src/server.ts` 添加 static middleware：`GET /admin/*` → `apps/web/dist/fleet/`（loopback 默认开，公网叠 basic-auth；BUG-007 同模式）。
5. `apps/api/src/modes/worker.ts` 添加 static middleware：`GET /admin/*` → `apps/web/dist/worker/`，bearer-auth 透传（已通过 `buildBearerAuth` 守）。
6. CLI flag：`aiworker gateway start [--no-serve-web]` / `aiworker worker start [--no-serve-web]`，默认开。
7. npm package：在 `@zonease/aiworker-cli` 的 publish artifact 里捎上 `apps/web/dist/{fleet,worker}/`。

**验证**：`aiworker gateway start` → `curl http://127.0.0.1:9218/admin/` 返回 fleet shell；`aiworker worker start` → `curl http://127.0.0.1:9217/admin/` 返回 worker shell（仅 loopback）。两个 bundle 跑得通空白路由 + theming + provider 链。

#### Phase 2 — Fleet UI MVP（FEAT-034, P1）

**输出**（仅 fleet 视角，依赖 Phase 1 完成）：
1. `/admin/` 落地：workers 列表（`workers.list` + presence 状态）、launch wizard（`workers.launch`）、pair wizard（`workers.pair`）、remove 确认对话（`workers.remove`）。
2. `/admin/enroll`：pending OTP 队列（`enroll.list` 30s polling），approve/reject 行级动作（`enroll.approve` / `enroll.reject`）。
3. `/admin/audit`：fleet.db 的 `audit_events` 浏览（**前置**：gateway proto 缺 `audit.list`，本 Phase 先加 `audit.list` method + gateway 实现 + proto 校验，单列子 task）。
4. `/admin/presence`：dashboard 卡片，显示 online/offline workers 与最后心跳。
5. 全部从 `apps/web/src/features/workers/components/` 搬迁可复用的 UX（workers-list / register-wizard / create-wizard），删除 secrets/test/config-editor 这些 worker 视角组件（搬到 Phase 3）。
6. fleet 视角的 `gateway-client.ts` 保留 WS 单连接，复用现有 reconnect/event-bus 实现。

**验证**：在 dev mode 启动 gateway + 1 个 worker，`/admin` 看见列表，能 pair/launch/remove，能审批 OTP enrollment。

#### Phase 3 — Worker UI MVP（FEAT-035, P1）

**输出**（仅 worker 视角，依赖 Phase 1 完成；与 Phase 2 可并行）：
1. `/admin/` worker 自管：config viewer（`/api/worker/config`） + edit 表单（已有 `config-editor/` 复用）。
2. `/admin/secrets`：secrets CRUD（`/api/worker/secrets`，已有 REST endpoints；这些是 gateway proto 未暴露的能力，但 worker UI **直连 worker REST 不依赖 gateway**，正好印证「物理独立」原则的价值）。
3. `/admin/test`：brain/executor/channel test 触发 + 结果展示（复用 `test-panel.tsx`，直连 `/api/worker/{brain,executor,channels}/test`）。
4. `/admin/cron`：cron CRUD（`/api/worker/cron` REST endpoints；如 worker REST 缺，复用 cron.* 的 server-side 实现，单列子 task 补 REST surface）。
5. `/admin/approvals`：per-tool approval 队列（`/api/worker/approvals` REST，与 gateway `approval.*` 同 server-side 实现）。
6. `/admin/chat`：单 worker 聊天界面（`/api/worker/orchestrator/chat`），复用现有 `chat.send` server-side 路由。
7. worker REST client：`apps/web/src/worker/lib/api.ts` 用 `fetch()` + `Authorization: Bearer <deviceToken>`，token 从 URL hash / sessionStorage 取（loopback 默认免，公网由 basic-auth 接管）。

**验证**：单 worker 起来后浏览器开 `http://localhost:9217/admin/` 能看到完整自管面板，能改 config / 加 secret / 跑 test / 改 cron / 审批 tool call / 聊一句。

#### Phase 4 — 独立性强化与回归保护（REFACTOR-009, P2）

**输出**：
1. ESLint `no-restricted-imports` rule 落地 + CI 拦截。
2. Vitest 给 fleet/worker 各自跑 smoke test（`apps/web/src/{fleet,worker}/__tests__/`）。
3. `apps/web/dist/{fleet,worker}/` 体积监控（baseline 见 Phase 1 build），每个 PR 报告增量。
4. `apps/web/src/shared/` 内组件循环依赖扫描。
5. `docs/architecture.md` 补「双视角 web UI」章节。
6. 旧 `apps/web/src/{routes,features,lib,stores}` 全删（搬迁完成后），保留 git 历史。

**验证**：CI 跑 lint + typecheck + smoke test 全绿；故意写个 fleet → worker 的 import 应被 ESLint 报错。

#### Phase 5 — 能力补齐与可观测性（REFACTOR-010, P3，可选）

**输出**（依赖前四 Phase 完成，nice-to-have）：
1. gateway proto 补 `audit.list` + `system.capabilities` + `secrets.{list,put,delete}` + `test.{brain,executor,channel}`，让 fleet UI 也能跨 worker 触发测试（**仅在用户需要 cross-worker 能力时做**，否则 worker self-serve 已够）。
2. fleet UI 加 cross-worker dashboard：所有 worker 的 cron 总览、approval 总览。
3. 多语言：fleet/worker 各自 i18n（zh-CN 默认，en 可选；复用 `react-i18next`）。
4. dark mode toggle（pma-web dual-channel theming）。

**验证**：fleet UI 能下钻到任一 worker 的快照，proto 校验通过，i18n 切换不丢页面状态。

### 推进顺序

```
Phase 1（基建）
   ├── Phase 2（Fleet UI MVP）  ─┐
   └── Phase 3（Worker UI MVP） ─┴─→ Phase 4（独立性强化）→ Phase 5（可选补齐）
```

Phase 1 是 hard prerequisite。Phase 2/3 可并行（用 BKD 两个 worktree 子任务并跑）。Phase 4 在 2/3 完成后做。Phase 5 不阻塞验收。

### BKD 分发计划（待审批后启动）

每个 Phase 一条 BKD issue，对应 docs/task/ 下的 FEAT/REFACTOR 文件，使用 worktree 隔离避免互相污染：

- BKD issue → `FEAT-033 Phase 1 静态托管 + 双视角骨架` (worktree)
- BKD issue → `FEAT-034 Phase 2 Fleet UI MVP` (worktree, depends FEAT-033)
- BKD issue → `FEAT-035 Phase 3 Worker UI MVP` (worktree, depends FEAT-033, parallel with FEAT-034)
- BKD issue → `REFACTOR-009 Phase 4 独立性强化` (worktree, depends FEAT-034 + FEAT-035)
- Phase 5 等用户后续追加。

依赖按 BKD `issue-follow-up` 串联，Phase 1 完成 + merge 后再 dispatch Phase 2/3。

## 风险

1. **静态托管引入 attack surface**（Phase 1）：gateway 此前只跑 WS，加 HTTP static middleware 会让公网暴露面变宽。**对策**：沿用 BUG-007 的 fail-closed 不变量，loopback 免 auth、非 loopback 必须叠 basic-auth；启动期断言（已被 BUG-019 落实），缺 basic-auth 直接 refuse to start。

2. **worker UI bearer token 怎么交付到浏览器**（Phase 3）：worker REST 全靠 `Authorization: Bearer <deviceToken>`，浏览器要拿到这个 token。**对策**：loopback 场景免 token（worker apps/api 的 bearer-auth middleware 已有 loopback fallback），仅在公网部署强制走 basic-auth + token via URL fragment（`#token=...`）一次性塞入 sessionStorage。绝不存 localStorage 也绝不出现在 query string log 里。

3. **multi-page Vite build 与 TanStack Router 文件路由**（Phase 1）：TanStack Router 默认 `routesDirectory` 单一目录，现在要切成 `src/fleet/routes/` 和 `src/worker/routes/` 两套。**对策**：用 `tanstackRouter` plugin 的多实例（一个 plugin 实例配 fleet route tree，一个配 worker），生成 `routeTree.fleet.gen.ts` 和 `routeTree.worker.gen.ts`，各自 main.tsx 引各自的 tree。pma-web `references/routing-and-ui.md` 有原型可参考。

4. **CLI npm artifact 体积膨胀**（Phase 1）：在 npm package 里捎 dist 会让 install 包变大。**对策**：dist 只捎 minified + gzip 必须开；估算 baseline ~500KB（fleet）+ ~500KB（worker），可接受。如果超 2MB 再考虑 cdn / lazy-fetch。

5. **gateway proto 缺 `audit.list`**（Phase 2）：fleet UI 想浏览 audit_events，proto 没暴露。**对策**：Phase 2 内部小 task 加 `audit.list({ limit, before })` method + gateway server-side 实现，proto 校验 + 单测覆盖。

6. **现有 dormant 代码搬迁丢历史**（Phase 4）：直接 `rm -r apps/web/src/routes` 会让 git blame 历史断在原文件。**对策**：用 `git mv` 搬迁，commit message 显式标 `refactor(web): 拆分 fleet/worker 视角，文件搬迁见 PLAN-022 Phase 4`。

7. **fleet/worker 各自维护 themer / provider chain 重复代码**（Phase 1）：两个 main.tsx + 两个 __root.tsx 会重复 QueryClientProvider / TooltipProvider / ThemeProvider 等。**对策**：把 Provider 链抽到 `src/shared/providers/AppProviders.tsx`，两边 main.tsx 都引同一个，只有 router 与 api client 不同。

8. **gateway-client.ts 当前只服务 worker 视角**：现有 `apps/web/src/lib/gateway-client.ts` 设计目标是 single-tenant operator session。Phase 2 后它要服务 multi-worker 列表的 fleet UI，确认 reconnect / event-bus 不会因为多 subscriber 出问题。**对策**：Phase 2 第一步先做 gateway-client 的 multi-subscriber unit test。

9. **测试服部署摩擦**（REFACTOR-004 不变量）：CLI 必须 self-contained，install web 不能跑额外 build step。**对策**：CI（GH Releases）发布前跑 `bun run --filter '@zonease/aiworker-web' build`，把 dist 打包进 npm tarball。`.npmignore` 别误漏 dist。

## 工作量

- Phase 1：~10-12 文件改动（vite multi-page + 目录搬迁骨架 + gateway/worker 静态 middleware + CLI flag），中风险（multi-page + ESLint 配置），~2-3 天。
- Phase 2：~15-20 文件（fleet routes + features 搬迁 + audit.list proto 扩展），中风险（reuse 现有 components），~3-4 天。
- Phase 3：~15-20 文件（worker routes + features + REST client），中风险（bearer-auth 传递路径），~3-4 天。
- Phase 4：~5-8 文件（ESLint config + smoke test + 旧文件删除 + architecture 文档），低风险，~1-2 天。
- Phase 5：依需求追加，~5-15 天。

合计 1-5 共 ~9-13 天 dev，外加 review/QA 约 2-3 周。

## 备选方案

**方案 A — 单 bundle 由 gateway 托管，worker 视角通过 gateway 转发**：
- 优势：托管简单（gateway 唯一 web server），独立 bundle 不需要 multi-page build。
- 劣势：违反「fleet/worker 物理独立」诉求；worker 自管能力被 gateway proto 限制（要么 proto 全量扩展要么 UI 残废）；worker 没 web 也没 self-serve 能力；测试服必须跑 gateway 才能看到 web。
- 不推荐：违背用户明确诉求「做好 worker 与 fleet 的相互独立性」。

**方案 B — 双 monorepo bundle，独立 source（apps/web-fleet + apps/web-worker）**：
- 优势：物理独立性最强，两边代码 0 共享，零误依赖风险。
- 劣势：双倍维护，components/ui 必须双份维护（或抽 packages/ui 包），开发体验差。
- 不推荐：维护成本高于收益，pma-web 的 components/ui 复用价值大。

**方案 C（推荐）— 单 monorepo source，多 page bundle，源码物理分隔 + ESLint guard**：
- 优势：components/ui 共享 + features/routes/lib 物理分隔 + ESLint 强制独立性 + 双 bundle 各自托管。
- 劣势：multi-page Vite + 双 routeTree 配置略复杂。
- 推荐：已选作主方案。

**Phase 5 是否上 i18n / dark mode**：
- 现状：CLI 是中文，CLAUDE.md 默认中文，但 web 操作员可能英文。
- 选项：默认 zh-CN；en 仅做 placeholder 留接口（react-i18next）；不阻塞 MVP。

## 批注

- 2026-04-27 18:35 用户批准：选定备选方案 C（单 source + 多 page bundle + 物理分隔 + ESLint guard），并要求一次性编排全部 5 个 Phase。BKD worktree issue 串联 follow-up，FEAT-033 立即起跑，后续按依赖触发。
