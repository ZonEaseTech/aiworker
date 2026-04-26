# AIWorker CLI — `aiw` + `aim`

`@aiworker/cli` 发布两枚 bin：

- **`aiw`** — worker 侧：引导 worker 运行时、喂消息、启动 HTTP 服务、（可选）作为 node 拨回 gateway。
- **`aim`** — operator 侧（PLAN-013）：通过 WS 协议跟 gateway 对话，管理 fleet 内所有 worker。

两者共享 `cac` 解析器与 `@aiworker/core` 服务端复用，但状态文件各自独立——`aiw` 读写 `worker.db`，`aim` 读写 `~/.aiworker/aim.json`。

## Installation (dev)

Bun workspace。目前直接跑源码：

```sh
bun apps/cli/src/aiw.ts <subcommand> [options]
bun apps/cli/src/aim.ts <subcommand> [options]
```

或通过 workspace script：

```sh
bun run --filter '@aiworker/cli' smoke:aiw-run   # aiw 冒烟：init + run --dry-run
```

正式发版（phase-1b）会用 `bun build --compile` 分别产出单文件 `aiw` / `aim` 二进制。

---

## `aiw` — worker-side CLI

### 环境变量

最小要求（仅 `--help` / `--version` 除外）：

- `AIWORKER_MASTER_KEY` — 32-byte hex（64 字符），worker 自己的 secrets vault 主密钥。
- `WORKER_DB_PATH` — 每 worker 独占的 SQLite 文件路径（默认 `/var/lib/aiworker/worker.db`）。

可选：

- `AIWORKER_HOME` — `~/.aiworker/workers/<workerId>/...` 根目录，默认 `~/.aiworker`。
- `WORKER_DATA_ROOT` — per-conversation 工作区根。未设时派生为 `<AIWORKER_HOME>/data-root`（默认 `~/.aiworker/data-root`），裸跑/dev 零配置即可；容器/systemd `--system` 形态请显式设到操作员可写的绝对路径（compose `docker-compose.yml` 设为 `/var/lib/aiworker`）。
- `WORKER_MIGRATIONS_FOLDER` — 默认使用 `@aiworker/storage-sqlite` 内嵌路径（`import.meta.url` 解析得来的**绝对**路径），源码运行 / 容器 / 单文件 bundle 都能定位；外部 vendor 时再显式覆盖。
- `AIWORKER_FORCE_ID` / `AIWORKER_FORCE_TOKEN` — 测试 / 备份恢复用的一次性覆盖。

### `aiw init`

初始化 `worker.db`，跑迁移，首次启动 mint identity + bootstrap token，种 default config，并在 `~/.aiworker/workers/<workerId>/` 下创建 `AGENT.md` / `SOUL.md` / `USER.md` / `brain/skills/` / `brain/memories/` / `workspaces/`。幂等——重复跑不会重打 bootstrap token，也不会覆盖既有 seed。

```sh
aiw init
# → prints (once):
# [worker] id=w_xxxxxxxxxxxx
# [worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_...
# [worker] save this token; it will not be printed again.
```

### `aiw run --message <text> [--chat-id <id>] [--dry-run] [--timeout-ms <n>]`

一次性把一条消息喂进 orchestrator。事件以 NDJSON 输出到 stdout，直到 orchestrator 发出终态事件（`orchestrator.task.succeeded` / `.failed` / `.cancelled`）。

```sh
aiw run --message "hello"
# {"type":"channel.inbound",...}
# {"type":"conversation.message",...}
# {"type":"orchestrator.task.succeeded",...}
```

- `--dry-run` — 完整 bootstrap 但不投递消息，用于 CI 冒烟。
- `--timeout-ms` — 硬上限，默认 120000；未按时到达终态事件 → 退出 124。

Exit codes: 0 success, 1 task failed, 2 bad arguments, 124 timeout.

### `aiw serve [--port <n>] [--gateway <wsUrl>] [--gateway-token <token>] [--no-reconnect]`

启动 worker HTTP 服务。行为等同 `AIWORKER_MODE=worker bun src/index.ts`：同一套 bootstrap / 路由 / hot-reload 契约 / `/openapi.json` / `/docs`。

**`--gateway <wsUrl>`**（PLAN-013 S4）：在 HTTP server 之外额外拨一条 WS 到 gateway，作为 `role=node` 接入。两条路径并行跑，SIGTERM 时都会优雅关闭。

- `--gateway-token <token>` — 给 gateway 的 bearer，loopback 场景可省。
- `--no-reconnect` — 禁用自动重连，冒烟/测试用。

```sh
# 纯 HTTP：
aiw serve --port 3001

# HTTP + 同时作为 node 注册到本机 gateway：
aiw serve --port 3001 --gateway ws://127.0.0.1:3000/ws
```

### `aiw config-show`

打印当前（已 redact）worker 配置与 monotonic version：

```sh
aiw config-show
# {
#   "version": 1,
#   "config": { ... }
# }
```

### `aiw config-set <json> [--if-match <version>]`

替换 worker config。Payload 与 WS 方法 `config.put` / 旧 REST `PUT /api/worker/config` 一致。`--if-match` 触发乐观锁——存储 version 不等则拒绝。成功后把 redact 后的 config mirror 写入 `~/.aiworker/workers/<workerId>/config.yaml`（advisory）。

```sh
aiw config-set "$(cat new-config.json)" --if-match 1
# → [aiw config set] stored config v2
```

Exit codes: 0 success, 2 invalid JSON / validation failure, 3 version conflict.

### `aiw token-rotate`

Mint 新 API token，AES-GCM 加密后覆盖 `worker_identity.api_token_enc`，明文打印一次：

```sh
aiw token-rotate
# [aiw token rotate] worker w_xxxxxxxxxxxx token rotated
# wtk_NEWTOKENHERE
```

旧 token 立即失效。保存明文；存储里只留密文。

### `aiw approvals-list`（PLAN-014 F2）

读取**本地** worker HTTP 端点 `GET /api/worker/approvals`，列出当前进程内所有挂起的 per-tool 审批：

```sh
aiw approvals-list
# {
#   "approvals": [
#     { "taskId":"...","toolCallId":"...","toolName":"...","params":{...},"expiresAt":1714... }
#   ]
# }
```

不经 gateway，是 dev / 运维兜底路径——管理员 ssh 进 worker 容器即可观察。端口取 `workerEnv.PORT`（默认 3000），bearer 由 `loadWorkerContext()` 从 worker.db / vault 解出。

### `aiw approvals-grant <taskId> <toolCallId> [--deny]`（PLAN-014 F2）

调 `POST /api/worker/approvals/:taskId/:toolCallId/grant`，下发决策。默认 `decision=allow`；带 `--deny` 改为 `deny`：

```sh
aiw approvals-grant tsk_xxx call_yyy            # allow
aiw approvals-grant tsk_xxx call_yyy --deny     # deny
```

`deny` 路径会在 worker 内合成助手消息 `"tool {name} blocked by policy"` 短路返回。

### `aiw schedule-list`（PLAN-014 F4）

读取本地 `worker.db` 的 `cron_jobs` 表，输出全部 job：

```sh
aiw schedule-list
# {
#   "jobs": [
#     { "id":"...","expression":"0 9 * * *","prompt":"早报","channel":"web","chatId":"...","accountId":"sys:cron","enabled":true,"lastRunAt":null,"nextRunAt":"..." }
#   ]
# }
```

实现复用 in-process `CronService`（一次性 boot + CRUD + 退出），与 `aiw config-show` / `aiw config-set` 模式一致——不绑 server，不进 orchestrator hot path。

### `aiw schedule-add --expression <expr> --prompt <text> --channel <channel> --chat-id <id> [--account-id <id>] [--disabled]`（PLAN-014 F4）

新增一条 cron job。`--expression` 走 `cron-parser` 校验，无效立即拒绝；`--account-id` 缺省 `sys:cron`（PLAN-014 F1 sys:* 保留前缀）；`--disabled` 把 `enabled` 置 false。

```sh
aiw schedule-add \
  --expression "0 9 * * *" \
  --prompt "晨间日报" \
  --channel web \
  --chat-id local-cli
# { "job": { "id":"...","expression":"0 9 * * *",... } }
```

### `aiw schedule-remove <jobId>`（PLAN-014 F4）

按 id 删除：

```sh
aiw schedule-remove crn_xxxxxxxxxxxx
# { "removed": true }
```

不存在时退出码 `1`，输出 `{ "removed": false }`。

### Exit code 约定（aiw）

- `0` — 成功；
- `1` — 失败（task 失败、rotate 写错等）；
- `2` — 参数非法（缺 `--message` / JSON 不对 / schema 校验失败）；
- `3` — 业务冲突（例：`config-set` version 不匹配）；
- `124` — 超时。

---

## `aim` — operator-side CLI

`aim` 通过 WebSocket 与 gateway（`apps/gateway`）对话。所有请求 / 响应 / 事件的帧结构与 METHODS / EVENTS schema 定义在 `@aiworker/gateway-proto`，由 aim 与 gateway 共用。

### 本地状态

`~/.aiworker/aim.json`（权限 `0600`）持久化：

```jsonc
{
  "gatewayUrl": "ws://localhost:3000",   // 默认；aim gateway start 会改写
  "deviceId":   "op-<uuid>",              // 首次 aim gateway/pair 时生成
  "deviceToken":"",                       // pair 成功后由 gateway 颁发
  "defaultWorkerId": "w_..."              // 省略 <workerId> 参数时的回退
}
```

补充文件：`~/.aiworker/aim-gateway.pid`（本机 daemon PID）、`~/.aiworker/aim-gateway.log`（daemon 日志）。

### Exit code 约定（aim）

- `0` 成功；`1` 泛型失败；`2` 参数非法 / 未知方法；`3` WS 等待超时；`4` 连接断开。

### `aim gateway start [--port <n>] [--entry <path>]`

本机拉起 gateway daemon（等价于直接跑 `bun apps/gateway/src/index.ts`）。成功后把 `gatewayUrl: ws://localhost:<port>` 回写到 `aim.json`。

```sh
aim gateway start --port 3000
# ✔ gateway daemon 已启动 pid=12345 port=3000
```

### `aim gateway status`

```sh
aim gateway status
# ✔ gateway daemon 运行中 pid=12345
# ℹ pidFile: /root/.aiworker/aim-gateway.pid
# ℹ logFile: /root/.aiworker/aim-gateway.log
```

### `aim gateway stop [--timeout-ms <n>]`

SIGTERM → 等 `timeoutMs` → SIGKILL 兜底。

### `aim install systemd`（PLAN-016）

把 gateway daemon 包成 systemd unit，开机自启 / 长跑。前台跑 `aim gateway start` 适合开发，**生产推荐用 systemd**——这是部署主路径，详见 [`docs/deployment.md` § 形态二：systemd 服务化](./deployment.md#形态二systemd-服务化推荐-linux-服务器)。

```sh
aim install systemd [--user|--system] [--dry-run] [--out <path>] [--no-enable]
```

| Flag | 默认 | 含义 |
|------|------|------|
| `--user` | 是（默认） | 用户实例：`~/.config/systemd/user/aiworker-gateway.service`，`WantedBy=default.target` |
| `--system` | 否 | 系统实例：`/etc/systemd/system/aiworker-gateway.service`，`WantedBy=multi-user.target`；需 root |
| `--dry-run` | 否 | 只打印 unit 内容到 stdout，不写盘、不 enable |
| `--out <path>` | 不设 | 覆盖目标路径（测试 / 异常布局 / packaging 用） |
| `--no-enable` | 否 | 写文件后**不**调 `systemctl daemon-reload + enable --now`，留给运维手动 |

unit 模板（`--user` 形态）：

```ini
[Unit]
Description=AIWorker gateway daemon
After=network.target

[Service]
Type=simple
ExecStart=%h/.bun/bin/aim gateway start
Restart=on-failure
RestartSec=5
Environment=AIWORKER_HOME=%h/.aiworker

[Install]
WantedBy=default.target
```

`--system` 形态把 `%h` 替换为 `/var/lib/aiworker`（或操作员显式指定的 home），`WantedBy` 改 `multi-user.target`。

幂等：同一 `--out` 路径反复跑产生**字节级一致**的 unit 内容；只有 `aim install systemd --dry-run` 输出与最终写盘一致，才算合法实现。

注意：

- unit 模板里的 `ExecStart=%h/.bun/bin/aim` 假设 `aim` 已经 `bun install -g`。一旦走 binary 形态（PLAN-017+ 的 `bun build --compile`），unit 模板要 parameterize 为绝对路径——届时 `aim install systemd` 会自动改写。
- `--system` 形态需要明确知道在做什么——服务以 root 跑、数据写到 root home。新手优先 `--user`。
- worker 进程目前不提供 systemd 模板（worker 通常按需手工 `aiw serve` 或走 docker fast-launch；gateway 是常驻的"那一个"）。

### `aim pair --url <wsUrl> --worker-url <httpUrl> --bootstrap-token <token> [--display-name <name>]`

把一个已启动的 worker 通过 bootstrap token 注册到 gateway。gateway 会调 worker 的 `/info` 验 token，加密落 fleet.db，并把 deviceToken 返回——aim 把它写回 `aim.json`，之后所有 operator 请求都用它。

```sh
aim pair \
  --url ws://127.0.0.1:3000/ws \
  --worker-url http://aiworker-worker:3001 \
  --bootstrap-token wtk_xxxxxxxxxxxx \
  --display-name test
# ✔ 已配对 worker w_xxxxxxxxxxxx
# { "workerId": "w_xxxxxxxxxxxx" }
```

失败码：`auth_failed` / `worker_unreachable` / `already_registered` / `quota_exceeded` / `master_key_missing`。

### `aim workers list`

```sh
aim workers list
# {
#   "workers": [
#     { "workerId":"w_abc","displayName":"prod-1","online":true,"deviceId":"node-...","baseUrl":"http://...:3001","lastSeenAt":1714... },
#     ...
#   ]
# }
```

### `aim workers info <workerId>`

转发到目标 worker 的运行时快照（原 REST `GET /api/worker/info` 等价物）。

### `aim workers launch [--display-name <name>] [--image <image>] [--force-id <workerId>]`

由 gateway supervisor 本机拉起一个 worker 容器，自动 pair，deviceToken 写回本地状态。

前置条件：gateway 启用 `AIWORKER_GATEWAY_CAN_LAUNCH=true`（compose overlay `docker-compose.supervisor.yml`），并正确挂载 `/var/run/docker.sock:ro` + `WORKER_DATA_ROOT`。

```sh
aim workers launch --display-name demo
# ✔ 已 launch worker w_xxxxxxxxxxxx
```

### `aim workers stop <workerId>`

给目标 worker 下停止指令（不从 fleet 中摘除）。

### `aim workers remove <workerId>`

从 fleet 中摘除该 worker（deviceToken 作废 + 若在线则踢下线）。若 `defaultWorkerId` 正是它，也会从 `aim.json` 清掉。

### `aim chat <workerId> '<text>' [--conversation-id <id>] [--timeout-ms <n>]`

给 worker 的某个会话追加一条用户消息并触发一次 run，阻塞到 `agent.done` 事件。stdout 输出 NDJSON：`chat.message` / `agent.thinking` / `agent.tool_call` / `agent.done`。

```sh
aim chat w_xxxxxxxxxxxx '查一下今天东京天气'
# {"type":"event","name":"agent.thinking",...}
# {"type":"event","name":"agent.tool_call",...}
# {"type":"event","name":"agent.done",...}
```

### `aim config get <workerId>`

读 worker 当前 config + version：

```sh
aim config get w_xxxxxxxxxxxx
# { "version": 2, "config": { ... } }
```

### `aim config set <workerId> <json> --if-match <version>`

乐观锁更新 config。`--if-match` 必填，防止误覆盖。

```sh
aim config set w_xxxxxxxxxxxx "$(cat new-config.json)" --if-match 2
```

### `aim token rotate <workerId>`

为目标 worker 轮换 deviceToken；gateway 会：

1. 调 worker 的 `/token/rotate` 下发新 token；
2. 重新加密落 `registered_workers.apiTokenEnc`；
3. 把新 deviceToken 返回给 operator。

```sh
aim token rotate w_xxxxxxxxxxxx
# { "deviceToken": "wtk_NEWTOKENHERE" }
```

### `aim approvals list [--worker <id>]`（PLAN-014 F2）

通过 gateway WS 协议 `approval.list` 列出挂起的 per-tool 审批。带 `--worker` 时只查指定 worker；不带时先 `workers.list` 拉全部 online worker，再并行查每个 worker 的 approvals 并聚合：

```sh
aim approvals list
# 聚合所有 online worker
aim approvals list --worker w_xxxxxxxxxxxx
# 只查指定
# {
#   "approvals": [
#     { "workerId":"w_...","taskId":"tsk_...","toolCallId":"call_...","toolName":"...","params":{...},"expiresAt":1714... }
#   ]
# }
```

### `aim approvals grant <workerId> <taskId> <toolCallId> [--deny]`（PLAN-014 F2）

调 gateway 协议 `approval.grant`，下发 `allow` / `deny` 决策。worker 收到后：

- `allow`：`ApprovalStore` resolve，orchestrator 继续执行 tool。
- `deny`：合成 `"tool {name} blocked by policy"` 助手消息短路。

```sh
aim approvals grant w_xxxxxxxxxxxx tsk_xxx call_yyy
aim approvals grant w_xxxxxxxxxxxx tsk_xxx call_yyy --deny
```

### `aim schedule list <workerId>`（PLAN-014 F4）

读取目标 worker 上 `cron_jobs` 表全量：

```sh
aim schedule list w_xxxxxxxxxxxx
# { "jobs": [ { "id":"...","expression":"0 9 * * *","prompt":"...","channel":"web","chatId":"...","accountId":"sys:cron","enabled":true,... } ] }
```

### `aim schedule add <workerId> --expression <expr> --prompt <text> --channel <channel> --chat-id <id> [--account-id <id>] [--disabled]`（PLAN-014 F4）

通过 gateway 协议 `cron.add` 在远端 worker 落库一条 cron job。`--account-id` 缺省 `sys:cron`，`--disabled` 把初始 `enabled` 置 false。

```sh
aim schedule add w_xxxxxxxxxxxx \
  --expression "*/15 * * * *" \
  --prompt "每 15 分钟巡检" \
  --channel web \
  --chat-id ops-monitor
```

### `aim schedule remove <workerId> <jobId>`（PLAN-014 F4）

```sh
aim schedule remove w_xxxxxxxxxxxx crn_xxxxxxxxxxxx
# { "removed": true }
```

### `aim logs <workerId> [--follow] [--tail N] [--timeout-ms <n>]`

订阅 worker 的日志尾部，stdout 输出 NDJSON `logs.line` 事件。`--follow` 持续订阅直到超时或 Ctrl-C；`--tail N` 请求历史行数（上限 1000）。

```sh
aim logs w_xxxxxxxxxxxx --follow --tail 200
# {"type":"event","name":"logs.line","payload":{"stream":"stdout","line":"...","ts":...}}
```

---

## 老版 caveats（保留给迁移用户）

- 子命令名仍是带空格的两词（`config get` / `token rotate`）；`cac` 6 原生不支持，`aim.ts` 在入口前做了一次 argv 预处理把 `argv[2]+argv[3]` 合成一个 token。新增两词命令需注册到 `cli.command('foo bar', ...)` 并让 `twoWordNames` 自动识别。
- `aiw run` 默认频道 `web` 与 chat id `cli:stdin`；webhook-driven 频道（Telegram / Lark / WhatsApp）仍需 `aiw serve`。
- 没有 `aiw repl` / 交互循环；`aiw run` 是一次性。
- PLAN-013 下线了 dashboard 模式；任何仍走 REST 的脚本需要切到 `aim` 或 gateway WS 客户端。变更明细见 `docs/changelog.md` 的 PLAN-013 条目。
