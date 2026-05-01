# PLAN-053 优化 aiworker serve 本地管理入口体验

- **status**: completed
- **createdAt**: 2026-04-30 20:59
- **approvedAt**: 2026-04-30 21:00
- **completedAt**: 2026-04-30 21:09
- **relatedTask**: FEAT-043

## 现状

1. `aiworker serve` 在 `apps/cli/src/commands/serve.ts` 中完成 worker bootstrap、
   `Bun.serve()` 启动、可选 gateway-client 连接以及 SIGTERM/SIGINT 退出等待。
2. `serve` 默认通过 `resolveWebStaticDir('worker')` 挂载 worker admin bundle 到
   `/admin/*`；`--no-serve-web` 或 `AIWORKER_WORKER_NO_SERVE_WEB=1` 会禁用。
3. 启动后日志只输出 `worker <id> listening on <host>:<port>` 和静态资源目录，未输出
   可点击 admin URL，也不会打开浏览器。
4. `bootstrapWorkerApp()` 返回的 `state.tokenPlaintext` 是当前 worker bearer token。
   HTTP 管理 API 通过 bearer-auth 中间件校验它，loopback 场景可放行无 token 请求。
5. worker 前端已有 token 引导：`apps/web/src/worker/lib/auth.ts` 从
   `#token=<bearer>` 提取 token，写入 sessionStorage，然后用 `history.replaceState`
   清掉 hash；`apps/web/src/worker/api.ts` 后续自动加 `Authorization: Bearer ...`。
6. `BUG-035` 的回归测试 `apps/cli/src/commands/serve.integration.test.ts` 已覆盖
   `/health` ready、启动后进程仍存活、SIGTERM clean exit；本次不能破坏该生命周期。

## 方案

1. 给 `aiworker serve` 增加浏览器打开控制：
   - 默认 `auto`：仅在 worker web bundle 已挂载、stdout 是 TTY、目标可转成本机浏览器地址时打开。
   - `--open`：强制尝试打开浏览器。
   - `--no-open`：禁用自动打开。
2. 生成 admin URL：
   - 基础路径为 `http://<browser-host>:<port>/admin/`。
   - 当 bind host 是 `0.0.0.0`、`::` 或空 host 时，浏览器目标改用 loopback
     `127.0.0.1` / `[::1]`，避免打开不可访问的监听地址。
   - fragment 使用 `#token=${encodeURIComponent(state.tokenPlaintext)}`，不使用 query string。
3. 日志输出分两层：
   - 默认只打印不含 token 的 admin 基础 URL，以及“浏览器已携带一次性 fragment token”
     这类提示。
   - 打开失败时提示用户可手动访问基础 URL，不在日志中打印完整 token。
4. 浏览器打开实现采用最小本地 helper，不引入依赖：
   - macOS: `open <url>`
   - Linux/其他 Unix: `xdg-open <url>`
   - Windows: `cmd /c start "" <url>`
   - spawn 后 detached/unref，失败只 warn，不影响 worker server。
5. 测试：
   - 增加纯函数单测覆盖 admin URL 生成、host 到 browser host 的映射、token fragment 编码。
   - 扩展 CLI 注册/help 测试确认 `--open` / `--no-open` 文案存在。
   - 保留并运行 `serve.integration.test.ts`，确认非 TTY 子进程默认不会尝试打开浏览器，且生命周期不变。

## 风险

1. `--open` 如果在 systemd、CI 或远端 shell 中默认触发会造成噪音。对策：默认只在 TTY
   且 web bundle 挂载时打开；非 TTY 默认跳过。
2. bearer token 出现在 URL fragment 中，浏览器地址栏会短暂可见。现有 worker UI 会立即清
   hash，且 fragment 不会进入 HTTP 请求、反代 access log 或 query string。
3. 打开浏览器命令跨平台差异大。对策：只做 best-effort；失败不影响 server，并保留基础 URL。
4. 如果 web bundle 缺失，自动打开 `/admin/` 只会得到 404。对策：沿用现有 `webStaticDir`
   判定，缺失时不打开。

## 范围

预期改动：

- `apps/cli/src/commands/serve.ts`
- `apps/cli/src/commands/serve.integration.test.ts`
- `apps/cli/src/aiworker.ts`
- `apps/cli/src/aiworker.test.ts`
- `docs/task/FEAT-043.md`
- `docs/task/index.md`
- `docs/plan/PLAN-053.md`
- `docs/plan/index.md`

不做：

- 不改变 worker UI 的 token 存储策略。
- 不打印完整 bearer token。
- 不改变 worker bearer-auth、loopback 放行、gateway enrollment 或 hot reload 行为。
- 不新增第三方依赖。
- 不处理 fleet-hosted `/w/:workerId/` worker UI 的跳转体验。

## 验证

已通过：

1. `PATH="$HOME/.bun/bin:$PATH" bun test apps/cli/src/commands/serve.integration.test.ts`
2. `PATH="$HOME/.bun/bin:$PATH" bun test apps/cli/src/aiworker.test.ts`
3. `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' typecheck`
4. `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' test`
5. `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' build:bundle`
6. `PATH="$HOME/.bun/bin:$PATH" bun run lint`
7. `git diff --check`

## 备选方案

1. 只打印带 token 的 URL，不自动打开。实现最小，但会把完整 bearer token 留在终端输出中，
   不符合默认日志不泄漏 secret 的目标。
2. 默认总是打开浏览器。更符合“自动”直觉，但会影响 systemd、CI、远端 session 等非交互式
   场景，不适合作为默认。
3. 只在 loopback 场景不带 token 打开。最安全，但无法覆盖用户明确提到的“自动带 token”体验，
   也不能帮助公网叠 basic-auth 的 worker admin 首次进入。

## 批注

- 2026-04-30 20:59：proposal ready，等待用户批准后实现。
- 2026-04-30 21:00：用户回复 `Proceed`，进入实现。
- 2026-04-30 21:09：完成实现与验证。`serve` 默认在交互式 TTY 打开 worker admin，
  `--open` / `--no-open` 控制行为；admin bearer 只通过 URL fragment 传入浏览器，
  CLI 日志只打印不含 token 的基础 URL。
