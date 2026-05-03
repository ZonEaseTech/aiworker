# PLAN-070 Worker Admin locked state without bearer token

- **status**: completed
- **createdAt**: 2026-05-02 21:40
- **approvedAt**: 2026-05-03
- **completedAt**: 2026-05-03
- **relatedTask**: BUG-047

## 现状

1. Worker API 的 `/api/worker/*` 路由由 `buildBearerAuth` 统一保护；缺少
   `Authorization` 时返回 401，body 形态是顶层
   `{ code: "auth-failed", message: "missing Authorization header" }`。
2. Worker Admin 的 `lib/auth.ts` 和 `api.ts` 注释仍描述 loopback dev 可不带
   token，但当前 API 行为已经要求 bearer token。
3. Worker Admin root layout 在没有 token 时仍会挂载 `useWorkerHealth()`、
   `useWorkerInfo()` 等查询；概览页还会挂载 cron / approvals polling，导致
   no-token 页面反复请求受保护端点并把原始 auth 错误渲染进卡片。
4. `aiworker serve` 当前打印的 `worker admin: http://.../admin/` 是不带 token
   的 base URL；只有自动打开浏览器时才用 `#token=...` URL fragment。
5. 现有 Web 测试默认直接挂载 Worker Admin shell，未覆盖 no-token locked
   state。

## 方案

1. 在 Worker Admin root layout 增加 token gate：启动时若 `getBearerToken()`
   为空，渲染清晰的 locked state，不挂载 TopBar、导航、Outlet，也就不会启动
   后台 query / polling。
2. locked state 提供本 tab 内的 bearer token 粘贴表单；提交后只写
   `sessionStorage` / 模块 cache，然后挂载正常 Worker Admin。
3. locked state 同时给出下一步：优先使用 `aiworker serve --open` 打开的
   tokenized URL，或在轮换/重启后粘贴当前 worker bearer token。
4. 更新 Worker Web auth/API 注释，明确 Worker Admin API 需要 bearer token；
   loopback 只影响静态 admin 可访问性，不代表 API 可匿名调用。
5. 调整 `aiworker serve` 的 admin URL 输出，避免把不带 token 的 base URL 表述成
   可直接使用的入口；继续只在浏览器打开路径中携带 token fragment，不把明文 token
   写进日志。
6. 增加/调整聚焦测试：no-token 渲染 locked state 且不触发 API 查询；已有 shell /
   responsive 测试显式 seed bearer；必要时覆盖 CLI admin URL 提示文本。

## 风险

1. 如果 operator 已经在一个无 token tab 中打开页面，locked state 只能让其粘贴已知
   token；它无法从正在运行的 worker 进程反向读取明文 token。
2. `aiworker token rotate` 会更新持久化 token，但当前运行中的 worker 只有下次
   `serve` 才会加载新 token；locked state 文案需要避免暗示在线轮换后可立即使用。
3. 只在 root layout gate 能阻止正常路由查询；若未来有代码在 root 外单独调用
   worker API，仍需复用同一 auth gate。
4. CLI 输出不能打印 tokenized URL，否则会把 bearer 写进 shell log；本计划保持
   token 只经 URL fragment 进入浏览器打开动作。

## 范围

- `apps/web/src/worker/routes/__root.tsx`
- `apps/web/src/worker/lib/auth.ts`
- `apps/web/src/worker/api.ts`
- focused Worker Admin tests under `apps/web/src/worker/__tests__/`
- `apps/cli/src/commands/worker/serve.ts`
- focused CLI serve URL output tests if practical
- `docs/task/BUG-047.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不新增 worker HTTP API 或读取当前明文 token 的 CLI command。
- 不改变 `/api/worker/*` bearer-auth fail-closed 行为。
- 不改变 gateway-hosted Fleet UI 或 gateway worker proxy auth。
- 不处理 `BUG-046` executor tiny probe timeout。
- 不做真实浏览器 smoke，除非聚焦测试无法覆盖 locked state 行为。

## 验证

- Passed: `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/bootstrap.test.tsx src/worker/__tests__/responsive-shell.test.tsx src/worker/api.test.ts`
- Passed: `bun test apps/cli/src/commands/worker/serve.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-cli' typecheck`
- Passed: `bunx eslint apps/web/src/worker/routes/__root.tsx apps/web/src/worker/lib/auth.ts apps/web/src/worker/api.ts apps/web/src/worker/api.test.ts apps/web/src/worker/__tests__/bootstrap.test.tsx apps/web/src/worker/__tests__/responsive-shell.test.tsx apps/cli/src/commands/worker/serve.ts apps/cli/src/commands/worker/serve.test.ts`
- Passed: `git diff --check`

## 结果

- Worker Admin now renders a locked state when no bearer token is present,
  before TopBar, navigation, route Outlet, or polling hooks can mount.
- The locked state accepts a bearer token for the current tab via
  `sessionStorage`, matching the existing URL fragment bootstrap model.
- Worker API auth failures in the legacy top-level `{ code, message }` shape
  now normalize to `WorkerApiError` instead of surfacing raw JSON.
- `aiworker serve` still avoids printing tokenized URLs, but the base admin URL
  output now states that no-token access shows the locked state and `--open`
  injects the bearer via URL fragment.
