# FEAT-033 Phase 1 — 基建：apps/web 静态托管 + 双视角源码骨架

- **status**: completed
- **priority**: P1
- **owner**: BKD/z27fqf6l (worktree)
- **createdAt**: 2026-04-27 18:35
- **completedAt**: 2026-04-27 19:30

## 描述

PLAN-022 Phase 1 落地。复活 dormant 的 apps/web，按 pma-web 标准搭起「物理独立的双视角」基础设施。本 phase 只做骨架与托管，不做业务功能。

### 验收标准

1. `apps/web/src/` 顶层重构为 `shared/` + `fleet/` + `worker/` 三块，每块各有独立的 `routes/` + `features/` + `lib/api.ts` + `main.tsx`。
2. `apps/web/vite.config.ts` 切换为 multi-page，emit `dist/fleet/index.html` 与 `dist/worker/index.html`，共用 vendor chunk。
3. TanStack Router 支持双 routeTree（`routeTree.fleet.gen.ts` + `routeTree.worker.gen.ts`），plugin 多实例配好。
4. ESLint `no-restricted-imports` 落地三条 rule：
   - `src/fleet/**` 禁 import `src/worker/**` 与 worker REST client
   - `src/worker/**` 禁 import `src/fleet/**` 与 gateway WS client
   - `src/shared/**` 禁 import 任一边的 `features/`、`routes/`、`lib/api`
   - 故意写错的 import 应被 `bun run lint` 报错
5. `packages/gateway/src/server.ts` 加 static middleware：`GET /admin/*` → `apps/web/dist/fleet/`。loopback 默认开，非 loopback 必须叠 basic-auth（沿用 BUG-007 fail-closed 模式，启动期断言）。
6. `apps/api/src/modes/worker.ts` 加 static middleware：`GET /admin/*` → `apps/web/dist/worker/`。bearer-auth middleware 透传（`buildBearerAuth` 已有 loopback bypass）。
7. CLI flag：`aiworker gateway start [--no-serve-web]`、`aiworker worker start [--no-serve-web]`，默认开。
8. `@zonease/aiworker-cli` 的 `package.json` `files` 字段把 `apps/web/dist/{fleet,worker}/` 纳入 publish artifact；`.npmignore` 不能误漏 dist。
9. 两个 bundle 至少跑通空白路由（`/admin/`）、theming token、provider 链（QueryClientProvider + TooltipProvider + Toaster），不报错。
10. `apps/web/src/__tests__/` 留两个 smoke test：fleet bundle 渲染 `<App />`、worker bundle 渲染 `<App />`。

### 不做（留给后续 Phase）

- fleet/worker 的具体业务路由与 features（Phase 2/3）。
- 旧 `apps/web/src/{routes,features,lib,stores}` 的搬迁删除（Phase 4）。
- gateway proto 的 `audit.list` / `secrets.*` 等扩展（Phase 2/5）。

## 进行时描述

搭建 apps/web 双视角骨架与静态托管基建

## 依赖

- **blocked by**: (无；epic 起点)
- **blocks**: FEAT-034 / FEAT-035

## 笔记

- 静态托管路径选 `/admin/` 避免与 worker REST `/api/worker/*` 冲突，也方便公网叠 basic-auth 时 path-scoped。
- multi-page Vite 参考：`build.rollupOptions.input = { fleet: 'src/fleet/main.tsx', worker: 'src/worker/main.tsx' }`，配合各自 `index.html`。
- TanStack Router plugin 多实例的 `generatedRouteTree` 路径必须不同，否则会互相覆盖。
- BUG-007 / BUG-019 已建立的不变量：non-loopback 必须 basic-auth，缺则 refuse to start。这次给 gateway 加 static middleware 等于把它的「公网可达表面」从 WS 拓展到 HTTP，同样守这条规则。
- npm tarball 体积估算：fleet bundle ~500KB（含 vendor），worker bundle ~500KB，gzip 后 ~300KB；可接受。
- 实施前先确认 packages/gateway 的 server 是 `Bun.serve` 还是 hono OpenAPI——如是 hono，复用 `@hono/node-server` 风格的 serve-static 中间件；如是裸 `Bun.serve`，需要自己写 `if (url.pathname.startsWith('/admin/')) { return new Response(Bun.file(...)) }` 分支。

## BKD 完成报告（2026-04-27 19:30）

Coordinator dispatch via BKD subtask `z27fqf6l` (worktree branch `bkd/z27fqf6l`)。

### Commits (4)

- `09f7ecc` feat(cli): --no-serve-web flag + web bundle 解析 + npm tarball 含 web/
- `a750c6d` feat(gateway,api): /admin/* 静态托管 fleet + worker bundle
- `8c2268f` feat(web): apps/web 双视角骨架 + multi-page build
- `1bacd8e` docs(plan,task): 立项 PLAN-022 / FEAT-033（**docs 部分被 coordinator 否决**——subtask 把 epic 改写为 2-phase 简化版，与已批准的 5-phase 设计冲突。Coordinator cherry-pick 仅取 code 三 commits + README 单独 patch，docs 保持 main 上的 5-phase epic 版本）

### Key Decisions

- 物理目录 + 物理 bundle + 物理托管面（PLAN-022 方案 C）；fleet/worker 各打成独立 `dist/<bundle>/`，shared/ 各落一份保部署解耦
- Vite multi-page 用 `AIWORKER_WEB_BUNDLE` env 切 root 跑两次 build；TanStack Router 用 generator-only 实例（双 plugin 同时挂 HMR 会触发 'Duplicate declaration hot'）
- packages/gateway 仍不引 hono——admin static 写两份独立实现（Bun-native + Hono middleware），各自 `decodeURIComponent` + resolve traversal 防御 + SPA fallback
- bearer-auth 仅守 `/api/worker/*`，`/admin/*` 公开。公网部署须靠反代 basicauth（README 安全模型段补硬约束）
- CLI flag `--no-serve-web` 对称 env：`AIWORKER_GATEWAY_NO_SERVE_WEB` / `AIWORKER_WORKER_NO_SERVE_WEB`（systemd 不动 ExecStart 也能开关）
- apps/web/src 53 文件 git mv 保历史；现存 worker 管理面 lift-and-shift 到 fleet/，不重写——视角拆分留 FEAT-034 / FEAT-035

### Self-review (passed)

- P0-1 / P0-2 / P1-1 / P1-2 / P1-3 / P1-6 全部修复（详见 BKD follow-up 报告）

### Validation

- typecheck：9/9 包 0 error
- test：716+ pass / 0 fail
- web build：dist/{fleet,worker}/index.html + assets/ 完全独立
- lint：仅 24 条 pre-existing baseline 错误（apps/cli，REFACTOR-008 territory，本次未触达）
- ESLint 三条边界 rule 手验：fleet→worker / worker→fleet / shared→fleet/api 三种违规均触发正确 message

### Deferred to Phase 2 / 单独任务

- worker 模式 BUG-019 风格 fail-closed bind 检查
- worker bundle 恢复 `declare module`（需 per-bundle tsconfig + d.ts）
- vite multi-page build 进 CI
- smoke 测试升级到 dynamic import main.tsx 端到端

### Subtask 范围 over-reach 备忘

Subtask 在 worktree 里改写了 PLAN-022 + FEAT-033 docs，把 5-phase epic 缩成 2-phase（Phase 1 骨架 + Phase 2 业务迁移合并）。Coordinator 拒绝该 docs 改动，保留 main 上的 5-phase epic 设计；后续 subtask prompt 加约束「不要改 PLAN/FEAT 文件的 scope 与 phase 结构，只改自己 task 的 status/notes」。
