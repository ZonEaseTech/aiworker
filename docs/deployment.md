# AIWorker Deployment

AIWorker 的当前部署主路径是 **local daemon**。一台 host 运行一个 daemon，
daemon 托管 Worker Web、local API、SQLite metadata、Soul worker registry 和
session runtime。历史 gateway/fleet、Docker compose gateway、公网 Caddy/aissh
部署路径已经从活跃代码中移除。

## Topology

```text
host
  -> local daemon
  -> Soul worker
  -> workspace/project
  -> session
  -> business artifact
  -> review
  -> durable org memory
```

- Host 是承载环境，不是产品对象。
- Local daemon 是唯一的本地控制面，监听本机端口并托管 Web/API。
- Worker 绑定一个 Soul；Host 可以管理多个 Soul workers。
- Workspace/session 是业务工作上下文，也是外部 engine native session 的接管点。
- 外部 engine 在 operator 的 host/user 环境里运行；AIWorker 不重新实现 tool loop、
  sandbox、approval、profile 或插件生态。

## Source Checkout

适合本仓开发和调试：

```bash
bun install
bun run --filter '@zonease/aiworker-web' build
AIWORKER_HOME=/tmp/aiworker-dev \
  bun apps/cli/src/aiworker.ts daemon foreground --host 127.0.0.1 --port 9217
```

打开 `http://127.0.0.1:9217/`。这个 daemon 同时提供：

- Worker Web；
- `/api/local/*` Host-local API；
- `/openapi.json` 和 `/docs`；
- official Soul App bootstrap；
- worker.db migration。

## Packaged CLI

构建发布包：

```bash
bun run --filter '@zonease/aiworker-cli' build:bundle
```

运行打包后的 CLI：

```bash
AIWORKER_HOME=~/.aiworker \
  apps/cli/dist/aiworker.js daemon foreground --host 127.0.0.1 --port 9217
```

发布包只需要：

- `aiworker.js` / `aiworker-bun.js`；
- `drizzle/worker` migrations；
- `web/worker` static bundle；
- package README。

## Installed CLI

发布后，operator 的本地入口应是：

```bash
aiworker daemon foreground --host 127.0.0.1 --port 9217
```

`AIWORKER_HOME` 默认是 `~/.aiworker`。可用环境变量：

- `AIWORKER_HOME`：Host-local runtime root；
- `WORKER_DB_PATH`：覆盖默认 `~/.aiworker/aiworker.db`；
- `AIWORKER_WORKER_HOST`：daemon bind host；
- `PORT`：daemon port。

## Official Soul Apps

Host 不内置垂直 Soul 源码。官方维护的 Soul Apps 位于 `apps/`，通过正常
install/enable lifecycle 快捷 bootstrap：

```bash
aiworker app bootstrap official
aiworker app list
```

daemon 启动时会安装/启用官方 HR/QA Soul Apps，除非 operator 显式 disable。Host
catalog 只投影已安装且 enabled 的 Soul Apps。

## Engine Auth

AIWorker 不接管外部 engine 的登录态。Codex、Claude Code、Gemini、Qwen、Cursor 等
engine 仍使用 operator 当前 host/user 下自己的 auth 文件、profile、MCP、插件和 native
session。`GET /api/local/settings/engines` 只做只读 readiness 探测，不读取 secret 内容。

推荐方式：

1. 在同一个操作系统用户下登录对应 CLI。
2. 启动 AIWorker daemon。
3. 在 Web settings 里 scan/test engine readiness。

## Data And Backup

需要备份：

- `AIWORKER_HOME`；
- `worker.db` 或自定义 `WORKER_DB_PATH`；
- `AIWORKER_HOME/workers/*/workspaces` 下的业务文件；
- operator 自己的外部 engine auth/profile 文件。

不应写入仓库或日志：

- API key；
- bearer token；
- engine auth JSON；
- connector secret。

## Verification

开发和发布前的常规 gate：

```bash
bun run lint
bun run typecheck
bun run test
bun run build
bun run web:smoke:mounted-surfaces
```
