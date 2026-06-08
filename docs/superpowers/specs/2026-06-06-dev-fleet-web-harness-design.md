# Dev Fleet Web Harness 设计

## 背景

AIWorker v1 的 canonical runtime 是 daemon-per-worker：每个 Worker daemon 只承载一个 active Worker，Workbench web 通过 `AIWORKER_API_URL` 绑定到一个 daemon。当前长线目标是为所有官方 Soul 做完整 E2E 验收，逐个跑通目标 Soul 的工作区、会话、投产输出和证据留存。

单个 Vite 绑定一个默认 daemon 适合日常开发，但不适合长期多 Soul E2E：浏览器状态、SSE 连接、API 代理目标和路由缓存都可能互相干扰。为测试编排引入 1 daemon : 1 Vite 的 harness，可以让每个 Soul 拥有独立 Web origin，同时不改变产品架构。

## 目标

- 固化一个可重复启动的本地 dev/test harness。
- 为 5 个官方 Soul 各创建或复用一个 fleet worker。
- 正常启动 5 个 daemon，每个 daemon 绑定一个 Worker。
- 用 tmux 启动 5 个 Vite dev server，每个 Vite 通过 `AIWORKER_API_URL` 绑定对应 daemon。
- 输出人可读端口表和机器可读 manifest，供后续 E2E runner 直接消费。
- 提供 status 和 clean 命令，便于长线测试反复运行。

## 非目标

- 不改变 Worker/Workbench 产品架构。
- 不让一个 daemon 承载多个 active Worker。
- 不在 Worker Web 内实现多 daemon 切换器。
- 不在本设计中定义各 Soul 的业务产出验收细则；后续 E2E spec 单独定义。
- 不默认删除 `$AIWORKER_HOME`，避免误删 E2E 过程中产生的工作区和证据。

## 启动拓扑

默认使用 `AIWORKER_HOME=${AIWORKER_HOME:-$HOME/.aiworker-dev}`。

| Soul | Worker id | Daemon | Vite | tmux session |
| --- | --- | --- | --- | --- |
| `aiworker-freeform` | `dev-aiworker-freeform` | `http://127.0.0.1:9217` | `http://127.0.0.1:5173` | `aiworker-vite-freeform` |
| `google-ads` | `dev-google-ads` | `http://127.0.0.1:9218` | `http://127.0.0.1:5174` | `aiworker-vite-google-ads` |
| `hr-manager` | `dev-hr-manager` | `http://127.0.0.1:9219` | `http://127.0.0.1:5175` | `aiworker-vite-hr-manager` |
| `product-manager` | `dev-product-manager` | `http://127.0.0.1:9220` | `http://127.0.0.1:5176` | `aiworker-vite-product-manager` |
| `software-support` | `dev-software-support` | `http://127.0.0.1:9221` | `http://127.0.0.1:5177` | `aiworker-vite-software-support` |

每个 Vite 都从 `apps/worker-web` 启动，带 `--strictPort`。端口被占用时 harness 必须失败并报告占用进程，不自动换端口。

## 命令

根 `package.json` 增加 3 个命令：

```text
bun run dev:fleet-web
bun run dev:fleet-web:status
bun run dev:fleet-web:clean
```

### `dev:fleet-web`

启动命令负责完整收敛本地拓扑：

1. 检查 `tmux` 可用；缺失则失败并提示安装。
2. 使用当前仓库的 CLI 和 `$AIWORKER_HOME`。
3. bootstrap 官方 Soul descriptors。
4. 为缺失的 5 个 worker 执行 `worker create <id> --app <appId> --name <name>`；已存在同 id worker 时复用。
5. 执行 `aiworker start --all` 启动所有 fleet daemon。
6. 对每个 Soul 启动一个 tmux Vite session：
   - 如果同名 session 已存在，先 kill 再重启。
   - 设置对应的 `AIWORKER_API_URL`。
   - 使用固定 Vite 端口和 `--strictPort`。
7. 做启动后健康检查：
   - `9217-9221 /health` 必须返回 200。
   - health body 中的 active worker id 和 appId 必须匹配拓扑表。
   - `5173-5177` 必须返回 200。
8. 写入 manifest。
9. 打印端口表和 tmux 使用提示。

### `dev:fleet-web:status`

状态命令只读，不启动、不修改状态：

- 打印 fleet daemon running/health 状态。
- 打印 5 个 tmux session 是否存在。
- 打印 `5173-5177` 是否监听。
- 打印 manifest 路径和当前 manifest 摘要，如果存在。

### `dev:fleet-web:clean`

清理命令默认保守：

- kill 5 个 harness 管理的 tmux Vite session。
- 执行 `aiworker stop --all` 停 fleet daemon。
- 删除 harness 生成的 manifest。
- 默认保留 `$AIWORKER_HOME` 中的 worker DB、workspaces、daemon logs 和测试证据。
- 只有设置 `AIWORKER_DEV_FLEET_PURGE=1` 时，才删除整个 `$AIWORKER_HOME`。

## Manifest

启动成功后写入：

```text
$AIWORKER_HOME/dev-fleet-web.json
```

格式：

```json
{
  "home": "/Users/ben/.aiworker-dev",
  "generatedAt": "2026-06-06T00:00:00.000Z",
  "workers": [
    {
      "soul": "google-ads",
      "workerId": "dev-google-ads",
      "apiUrl": "http://127.0.0.1:9218",
      "webUrl": "http://127.0.0.1:5174",
      "tmuxSession": "aiworker-vite-google-ads"
    }
  ]
}
```

后续 E2E runner 应优先读取 manifest，而不是硬编码端口。默认端口仍保留，方便人工打开和调试。

## 错误处理

- `tmux` 不存在：失败。
- daemon port 被非 harness 进程占用：失败并显示 `lsof` 输出。
- Vite port 被占用：失败并显示 `lsof` 输出。
- 同名 tmux session 已存在：认为属于 harness，kill 后重启。
- worker id 已存在且 appId 匹配：复用。
- worker id 已存在但 appId 不匹配：失败，避免把测试绑到错误 Soul。
- daemon health appId/workerId 不匹配：失败。
- Vite Node 版本警告：显示但不阻断；监听或 HTTP 检查失败才阻断。
- 任一步失败时，脚本必须返回非零退出码。

## 验收

实现完成后的最小验证：

```text
bun run dev:fleet-web
bun run dev:fleet-web:status
curl -fsS http://127.0.0.1:9217/health
curl -fsS http://127.0.0.1:9221/health
curl -fsSI http://127.0.0.1:5173/
curl -fsSI http://127.0.0.1:5177/
bun run dev:fleet-web:clean
bun run dev:fleet-web:status
```

成功标准：

- 5 个 daemon health 均为 200。
- 5 个 Web origin 均为 200。
- manifest 包含 5 条 worker 记录。
- clean 后 5 个 Vite tmux session 不存在，`9217-9221` 不再监听。
- clean 默认不删除 `$AIWORKER_HOME`；设置 `AIWORKER_DEV_FLEET_PURGE=1` 时删除。

## 后续 E2E 扩展

本 harness 是后续完整 Soul E2E 的基础设施。下一份 E2E spec 应定义：

- 每个 Soul 的输入 fixture。
- 每个 Soul 期望产出的文件、会话摘要、关键检查点和截图证据。
- Playwright 如何读取 manifest 并逐个访问 `webUrl`。
- 失败时如何保留 workspace、logs、screenshots 和 raw evidence。
- 哪些断言属于平台通用验收，哪些属于 Soul 业务输出验收。
