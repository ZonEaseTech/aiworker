# PLAN-022 apps/web 双视角骨架 + 静态托管

- **status**: completed (Phase 1 only — FEAT-034 / FEAT-035 留作 Phase 2)
- **createdAt**: 2026-04-27 18:30
- **relatedTask**: FEAT-033 (Phase 1) + FEAT-034 (Phase 2 fleet 迁移) + FEAT-035 (Phase 2 worker 迁移)
- **bkd issue**: `xft5fyjw`（coordinator）

## Context

apps/web 当前是 dormant 单 SPA，53 个文件全部混在 `src/{routes,features/workers,lib,components,stores,styles}/`。把多 worker 管理面（fleet）与单 worker 自带 admin（worker）共塞一个 bundle，会带来：

- 部署粒度错位：worker 端 npm install 后只想要"自带的 admin UI"，不该夹带 fleet 整套；
- 反过来 gateway 节点不该挂 worker 详情页（同一节点无 worker.db）；
- fleet/worker 路由树合并后，`<Link to="/workers/$workerId">` 在 worker bundle 上没意义。

PLAN-022 把 web 一分为二：物理目录 + 物理 bundle + 物理托管面。Phase 1（本 plan / FEAT-033）只搭骨架与托管，业务逻辑保持原样 lift-and-shift；Phase 2（FEAT-034 / FEAT-035）做真正的视角拆分。

### 现状摸底

- `apps/web/vite.config.ts`：单 entry，`tanstackRouter` plugin 指 `./src/routes`，无 `rollupOptions.input`。
- `apps/web/src/main.tsx`：单挂载点 `#root` + 单 routeTree。
- `packages/gateway/src/server.ts`：纯 `Bun.serve`，仅处理 `/health` `/ws` `/enroll-ws`，无 HTTP 资源面。`assertGatewayBindIsSafe` 在 bind 前 fail-closed。
- `apps/api/src/modes/worker.ts`：OpenAPIHono，`/api/worker/*` 顶层 bearer-auth，channels webhook 与 `/health` 公开。Bun 运行时。
- `apps/cli/src/aiworker.ts`：单二进制（`bun build --target=bun`）；`serve` 起 worker，`gateway start` 起 gateway。`files: ["dist/", "README.md"]` —— web dist 当前不入 npm tarball。
- `eslint.config.ts`：仅有 `packages/core` 的 transport 隔离 rule。

## Proposal

### S1. 源码骨架双视角切分

```
apps/web/
├── fleet.html              # vite multi-page entry (fleet)
├── worker.html             # vite multi-page entry (worker)
├── src/
│   ├── shared/             # 跨视角共享，禁止依赖 fleet/worker 的 features/routes/lib/api
│   │   ├── api.ts          # 占位：通用 axios/fetch wrapper
│   │   ├── components/ui/  # 沿用 shadcn/ui
│   │   ├── lib/            # api.ts(legacy ts client) / utils / queryClient / gateway-client / hooks
│   │   ├── stores/theme.ts # 跨视角主题
│   │   └── styles/         # tailwind v4 globals
│   ├── fleet/
│   │   ├── api.ts          # fleet 特化（gateway WS for fleet operations）
│   │   ├── features/workers/  # 沿用现有 22 个文件
│   │   ├── lib/            # 视角私有 helpers
│   │   ├── routes/         # 沿用现有 4 个 route 文件
│   │   ├── routeTree.gen.ts
│   │   ├── stores/worker.ts
│   │   └── main.tsx
│   ├── worker/
│   │   ├── api.ts          # worker 特化（HTTP /api/worker/*）
│   │   ├── features/       # 空（Phase 2 填）
│   │   ├── lib/            # 空
│   │   ├── routes/         # 单 placeholder route
│   │   ├── routeTree.gen.ts
│   │   └── main.tsx
│   └── __tests__/          # smoke 测试
│       ├── fleet-bootstrap.test.tsx
│       └── worker-bootstrap.test.tsx
└── vite.config.ts          # multi-page + 双 routeTree plugin 实例
```

**lift-and-shift 不重写**：现有 53 个文件按视角归位，import 路径更新（`@/components` → `@/shared/components` 等），但 component 内部逻辑、hooks 行为、props 结构一律不动。

### S2. vite multi-page

```ts
// vite.config.ts
build: {
  rollupOptions: {
    input: {
      fleet: fileURLToPath(new URL('./fleet.html', import.meta.url)),
      worker: fileURLToPath(new URL('./worker.html', import.meta.url)),
    },
  },
},
plugins: [
  tanstackRouter({ /* fleet */
    target: 'react',
    autoCodeSplitting: true,
    routesDirectory: './src/fleet/routes',
    generatedRouteTree: './src/fleet/routeTree.gen.ts',
    routeFileIgnorePrefix: '-',
  }),
  tanstackRouter({ /* worker */
    target: 'react',
    autoCodeSplitting: true,
    routesDirectory: './src/worker/routes',
    generatedRouteTree: './src/worker/routeTree.gen.ts',
    routeFileIgnorePrefix: '-',
  }),
  react(),
  tailwindcss(),
],
```

`fleet.html` / `worker.html` 各自 `<script src="/src/{fleet,worker}/main.tsx">`。Vite 默认输出 `dist/<entry-name>/index.html`（用 `build.rollupOptions.output.dir` 不行；需要靠多文件 input + `dist/` 内自然拆分）。

> 实测注意：Vite 8 multi-page 默认把每个 entry 输出为 `dist/<entry-name>.html`（同级），需要后处理或显式 `output.entryFileNames` 把它们摆到 `dist/fleet/index.html` / `dist/worker/index.html`。S2 实施时通过 `build.rollupOptions.output.entryFileNames` + 一段 `closeBundle` 钩子把 `dist/{fleet,worker}.html` rename 为 `dist/{fleet,worker}/index.html`，或直接配 `appType: 'mpa'` + 物理 `apps/web/{fleet,worker}/index.html` 子目录布局。

### S3. ESLint 边界

```ts
// eslint.config.ts 末尾追加
{
  files: ['apps/web/src/fleet/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [
      { group: ['**/worker/**', '@/worker/**'], message: 'fleet 视角不得引用 worker 视角；共享请放 shared/' },
    ]}],
  },
},
{
  files: ['apps/web/src/worker/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [
      { group: ['**/fleet/**', '@/fleet/**'], message: 'worker 视角不得引用 fleet 视角；共享请放 shared/' },
    ]}],
  },
},
{
  files: ['apps/web/src/shared/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [
      { group: ['**/fleet/features/**', '**/fleet/routes/**', '**/fleet/lib/**', '**/fleet/api', '@/fleet/**'], message: 'shared 不得反向依赖 fleet 视角的视角私有内容（features/routes/lib/api）' },
      { group: ['**/worker/features/**', '**/worker/routes/**', '**/worker/lib/**', '**/worker/api', '@/worker/**'], message: 'shared 不得反向依赖 worker 视角的视角私有内容（features/routes/lib/api）' },
    ]}],
  },
},
```

### S4. Gateway `/admin/*` 静态托管

`packages/gateway/src/server.ts` 的 `fetch` handler 在 `/health` 之后加分支：

```ts
if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
  if (!context.webStaticDir) return new Response('not found', { status: 404 })
  return serveBunStatic(context.webStaticDir, url.pathname.replace(/^\/admin\/?/, ''))
}
```

`webStaticDir` 在 `GatewayContext` 上注入，由 CLI 决议（见 S6）。fail-closed 不变：`assertGatewayBindIsSafe` 仍在 bind 前。

### S5. Worker `/admin/*` 静态托管

`apps/api/src/modes/worker.ts` 在所有 route 之前加：

```ts
const webStaticDir = workerEnv.WORKER_WEB_STATIC_DIR // resolved by CLI
if (webStaticDir) {
  app.get('/admin', honoServeStatic({ root: webStaticDir, path: 'index.html' }))
  app.get('/admin/*', honoServeStatic({ root: webStaticDir, rewriteRequestPath: p => p.replace(/^\/admin\/?/, '/') }))
}
```

bearer-auth 仅守 `/api/worker/*`，`/admin/*` 公开（与 `/health` 同等级）。

### S6. CLI `--no-serve-web` + 资源解析

`aiworker serve`（worker）与 `aiworker gateway start` 都加 `--no-serve-web`。默认 serve；带 flag 关。

资源解析顺序（`apps/cli/src/lib/web-static.ts`）：

1. ENV `AIWORKER_WEB_STATIC_DIR_{FLEET,WORKER}` —— ops 手动注入，最高优先级。
2. cli binary 同级 `<dist>/web/{fleet,worker}/` —— npm install 后的标准布局。
3. monorepo dev `<repo>/apps/web/dist/{fleet,worker}/` —— 本地 `bun run --filter` 时。
4. 都不存在 → fallback 到 null（gateway/worker 收到 null 时 `/admin/*` 返回 404，但**不阻塞启动**）。

### S7. npm 打包

`apps/cli/scripts/build-publish-manifest.ts` 在 `bun build` 之后多一步：把 `apps/web/dist/{fleet,worker}/` 复制到 `apps/cli/dist/web/{fleet,worker}/`。`apps/cli/package.json` 的 `scripts.build` 在 cli 自身 build 前先 `bun run --filter '@zonease/aiworker-web' build`。`files` 字段不变（`dist/` 已涵盖）。

### S8. Smoke 测试

`apps/web/src/__tests__/`：

- `fleet-bootstrap.test.tsx` — `import { router } from '@/fleet/...'`；用 happy-dom 渲染 `<RouterProvider>`，断言 root html 不空。
- `worker-bootstrap.test.tsx` — 同上 worker bundle。

## Risks

1. **vite 8 multi-page 输出布局不可知**：若 `dist/<entry>.html` 不能直接对齐到 `dist/{fleet,worker}/index.html`，要么靠 `output.entryFileNames`，要么物理 `apps/web/fleet/index.html` 子目录。S2 实施时按实际行为调整。
2. **TanStack Router 双 plugin 实例**：plugin 不会冲突（彼此 routeTree.gen.ts 路径不同），但 IDE 体验可能要 `tsconfig` paths 区分；本 phase 暂不优化。
3. **ESLint pattern 用法**：`@antfu/eslint-config` 默认有 `no-restricted-imports` 的等价规则吗？若有冲突需 override。
4. **bun build 单二进制不能 bundle 静态文件**：所以 web dist 必须以"边车文件"形式存在，CLI binary 解析其相对路径。binary 位置不固定（npm bin / homebrew / 直接路径执行）→ 用 `import.meta.url` 推导 self-dir，再向上找 `web/{fleet,worker}/`。
5. **现有 53 个文件 import 路径全量更新**：`@/components/ui/foo` → `@/shared/components/ui/foo`。靠 ESLint + tsc 兜底。

## 工作量

| 阶段 | 文件估算 | 说明 |
|------|----------|------|
| S1 src 切分 | ~55 (移动) + 10 (新建) | lift-and-shift + 双 main.tsx + 双 routeTree placeholder |
| S2 vite | 1 (vite.config.ts 重写) + 2 (HTML) | multi-page |
| S3 eslint | 1 | 三条 rule |
| S4 gateway 静态 | 2-3 | server.ts + context.ts + 一个 helper |
| S5 worker 静态 | 1-2 | worker.ts + serveStatic adapter |
| S6 CLI flag | 3 | aiworker.ts + serve.ts + gateway.ts |
| S7 packaging | 2 | build script + cli package.json |
| S8 smoke | 2 | 两个 test 文件 |

合计：约 80 个文件触达，其中 50+ 是物理移动（`git mv` 友好），新建/改写约 25。

## 备选方案

- **方案 A（采纳）**：物理目录 + 物理 bundle + 物理托管面（双 vite entry）。
- **方案 B**：单 SPA + runtime feature flag 区分 fleet/worker 视角。
  - 优势：bundle 小、迁移成本低。
  - 劣势：无法物理隔离部署粒度，worker 节点上还是要装下整 fleet 业务包；ESLint 边界靠 import alias，绕一下就破。
- **方案 C（用户指定）**：物理目录 + 单 bundle + runtime 路由表。
  - 优势：vite 配置简单。
  - 劣势：仍然 bundle 共载；worker 端节省不了体积。
  - **不采纳**。

## 验证

- `bun run --filter '@zonease/aiworker-web' build` 成功，`apps/web/dist/{fleet,worker}/index.html` 同时存在。
- `bun run --filter '@zonease/aiworker-web' typecheck` 通过。
- `bun run --filter '@zonease/aiworker-web' test` 两个 smoke test 通过。
- 顶层 `bun run lint` 通过（fleet → worker import 应被 ESLint 拦下，反之亦然 —— 通过手工注入一条非法 import 验证）。
- gateway smoke：`aiworker gateway start --no-serve-web` 后 `curl /admin/` 返回 404；不带 `--no-serve-web` 时返回 fleet 的 `index.html`。
- worker smoke：`aiworker serve --no-serve-web` 后 `curl /admin/` 返回 404；不带时返回 worker 的 `index.html`。
- npm pack dry-run：`apps/cli/dist/web/{fleet,worker}/index.html` 在 tarball 内。
