# FEAT-043 优化 aiworker serve 本地管理入口体验

- **status**: completed
- **priority**: P2
- **owner**: self
- **createdAt**: 2026-04-30 20:59
- **plan**: PLAN-053

## 描述

`aiworker serve` 当前能启动 worker HTTP server 并默认挂载 worker admin bundle 到
`/admin/*`，但启动完成后只输出监听地址和静态资源目录。首次使用者仍需要自己拼
`/admin/` URL，并在非 loopback 场景手动处理 bearer token。

验收标准：

1. `aiworker serve` 启动成功后能生成 worker admin URL。
2. admin URL 通过 URL fragment 携带当前 worker bearer token，复用 worker UI
   已有 `#token=...` → sessionStorage → 清 hash 的安全引导逻辑。
3. 交互式本地启动默认尝试打开浏览器；非交互式、禁用 web bundle 或显式禁用时不打开。
4. 提供显式 CLI 开关控制浏览器打开行为。
5. 不把 bearer token 落入 query string；默认日志不打印完整 token。
6. 保持 `--no-serve-web`、gateway enrollment、SIGTERM 前台生命周期行为不变。

## 进行时描述

已交付 `aiworker serve` worker admin URL、token fragment 引导和可控浏览器打开体验。

## 依赖

- **blocked by**: (none)
- **blocks**: 本地 worker quickstart、worker admin 首次进入体验
- **relates to**: FEAT-035, FEAT-041, BUG-035

## 笔记

- 2026-04-30 20:59：调查确认 `apps/cli/src/commands/serve.ts` 启动后已经拿到
  `state.tokenPlaintext`，这是 worker `/api/worker/*` 的 bearer token。
- 2026-04-30 20:59：worker UI 已在 `apps/web/src/worker/lib/auth.ts` 支持从
  `#token=...` 读取 token、写入 sessionStorage，并立即清理 URL hash。
- 2026-04-30 20:59：`serve` 默认挂载 worker bundle；`--no-serve-web` 或静态资源缺失时
  不应尝试打开 `/admin/`。
- 2026-04-30 20:59：上一轮 BUG-035 已固定 `serve` 前台生命周期，回归验证应继续覆盖
  `/health` ready、进程保持存活、SIGTERM 正常退出。
- 2026-04-30 21:09：实现已完成。`serve` 在 worker web bundle 挂载时输出不含 token 的
  admin 基础 URL；交互式 TTY 默认打开带 `#token=...` fragment 的 admin URL；
  `--open` / `--no-open` 可显式控制；完整 bearer 不写入日志。
- 2026-04-30 21:09：验证通过：聚焦 `serve.integration.test.ts`、`aiworker.test.ts`、
  CLI package typecheck/test/build、root lint、`git diff --check`。
