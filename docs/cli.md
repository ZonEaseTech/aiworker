# AIWorker CLI — `aiworker`（单二进制）

`@zonease/aiworker-cli` 发布**一枚** bin：`aiworker`，子命令树由 worker-side（dash-form）+ operator-side（两词 form）+ gateway 生命周期 + `install systemd` 构成。原 PLAN-020 之前的 `aiw` / `aim` 双 bin 形态已下线（FEAT-028），命令树形态以本文件为准。

| Surface | 形态 | 例子 |
|---|---|---|
| **worker-local** | dash-form 子命令（worker 容器自身或 ssh 进容器跑） | `aiworker serve` / `aiworker config-show` / `aiworker schedule-list` |
| **fleet 管理** | 两词子命令 group（operator 控 fleet） | `aiworker fleet list` / `aiworker fleet launch` |
| **gateway 生命周期** | 两词子命令 group（本机起 daemon） | `aiworker gateway start` / `aiworker gateway status` |
| **operator-remote** | 两词子命令（operator 通过 WS 触达 worker） | `aiworker chat <id> 'hi'` / `aiworker config get <id>` / `aiworker enroll approve` |
| **`install systemd`** | unit 模板写盘 | `aiworker install systemd --user` |

> **命名约定**：worker-local 命令统一使用 dash-form（`config-show` 操作本地 `worker.db`），operator-remote 命令统一使用两词 form（`config get <workerId>` 经 gateway WS 触达远端 worker）。两套命令在同一 bin 下共存，靠 cac argv 预处理把 `argv[2]+argv[3]` 合并成两词 token。

## Installation (dev)

Bun workspace。Stage A 仍直接跑源码：

```sh
bun apps/cli/src/aiworker.ts <subcommand> [options]
```

Stage B（FEAT-027 npm publish 完成后）改为：

```sh
bun install -g @zonease/aiworker-cli
# 或 npm install -g @zonease/aiworker-cli
aiworker <subcommand> [options]
```

下文示例统一用 `aiworker`（生产姿势），开发期把 `aiworker` 替换为 `bun apps/cli/src/aiworker.ts` 即可。

---

## Worker-local 命令（dash-form）

worker 容器内或 ssh 进 worker 主机直接操作 `worker.db` 的子命令。**不**经 gateway，不需要 operator basicauth；运维 fallback / 备份恢复 / dev 自检常用。

### 环境变量

最小要求（仅 `--help` / `--version` 除外）：

- `AIWORKER_MASTER_KEY` — 32-byte hex（64 字符），worker 自己的 secrets vault 主密钥。
- `WORKER_DB_PATH` — 每 worker 独占的 SQLite 文件路径（默认 `/var/lib/aiworker/worker.db`）。

可选：

- `AIWORKER_HOME` — aiworker home 显式覆盖。最高优先级，会绕过 PLAN-023 的 cwd-based project scope 探测（详见下文 §`aiworker scope`）。systemd / docker 部署在 unit / compose 里显式设了此变量，行为零回归。
- `WORKER_DATA_ROOT` — per-conversation 工作区根。未设时派生为 `<AIWORKER_HOME>/data-root`（默认 `~/.aiworker/data-root`），裸跑/dev 零配置即可；容器/systemd `--system` 形态请显式设到操作员可写的绝对路径（compose `docker-compose.yml` 设为 `/var/lib/aiworker`）。
- `WORKER_MIGRATIONS_FOLDER` — 默认使用 `@zonease/aiworker-storage-sqlite` 内嵌路径（`import.meta.url` 解析得来的**绝对**路径），源码运行 / 容器 / 单文件 bundle 都能定位；外部 vendor 时再显式覆盖。
- `AIWORKER_FORCE_ID` / `AIWORKER_FORCE_TOKEN` — 测试 / 备份恢复用的一次性覆盖。
- `AIWORKER_WORKER_HOST` — `aiworker serve` 的 HTTP bind host，默认 `127.0.0.1`。公网或容器网络显式暴露时用 `--host` 覆盖。
- `AIWORKER_WORKER_NO_SERVE_WEB=1` — 禁用 worker `/admin/*` 静态 bundle。
- `AIWORKER_ADMIN_EXTERNAL_AUTH=1`（或 `true`）— 仅表示 `/admin/*` 已被外部鉴权层保护。`aiworker serve --host 0.0.0.0` 且实际挂载 admin bundle 时必须设置它，或改用 `--no-serve-web`。
- `AIWORKER_GATEWAY_URL` / `AIWORKER_JOIN_TOKEN` / `AIWORKER_DISPLAY_NAME`（PLAN-018 / FEAT-024）— self-enroll 三件套：URL + token 同时设 → `aiworker serve` 跳过 operator 手动 `aiworker pair`，bootstrap 完成后用 outbound WS 主动拨 gateway 把自身写入 fleet。`DISPLAY_NAME` 可选，缺省回落 workerId（最长 80 字符）。详见下文 §`aiworker serve` 与 [`docs/deployment.md` § Worker self-enroll quick start](./deployment.md#worker-self-enroll-quick-start-plan-018--feat-024)。
- `AIWORKER_ENROLL_MODE`（PLAN-019 / FEAT-026）— `'auto' | 'otp'`，缺省 `'auto'`。`'auto'` 下走 self-enroll 还是 OTP 由 `JOIN_TOKEN` 是否设来判定（设 → self-enroll；未设 → OTP）；显式 `'otp'` 强制 attended 路径，即使 `JOIN_TOKEN` 同时存在也忽略它（用于 deployer 拿不到 fleet 凭证的 attended 场景）。详见下文 §`aiworker serve` 与 [`docs/deployment.md` § Worker OTP-attended enroll quick start](./deployment.md#worker-otp-attended-enroll-quick-startplan-019--feat-026)。

### `aiworker init [--soul <preset>] [--global] [--force]`

初始化 `worker.db`，跑迁移，首次启动 mint identity + bootstrap token，种 default config，落 layout 模板。幂等——重复跑不会重打 bootstrap token，也不会覆盖既有 seed。

brand-new project scope 会在创建 worker identity / worker.db 之前选择 Soul。交互终端直接运行 `aiworker init` 会出现 preset wizard；非交互脚本必须显式传 `--soul <preset>`，避免静默生成通用 stub。当前内置 preset：`developer`、`project-manager`、`devops-sre`、`product-designer`、`qa-reviewer`、`support-operator`、`finance-ops`、`hr-recruiting`、`general-assistant`、`customize`。其中 `customize` 需要交互终端回答职责、边界、职责外响应、沟通风格和高风险操作策略。

PLAN-023 起 `aiworker init` 默认走 **project scope**：

| 模式 | 触发条件 | 落位 |
|------|----------|------|
| **project**（默认） | 当前 cwd（未显式 `AIWORKER_HOME`） | `<cwd>/.aiworker/{AGENT.md,SOUL.md,USER.md,MEMORY.md,ROLLUP.md,policy.json,toolsets.json,capability-packs.json,skills/,memories/,mcp.json}` + `<cwd>/.aiworker/local/{worker.db,identity.json,.env,workspaces/}` |
| **user**（legacy） | `--global` flag，或显式 `AIWORKER_HOME=...` | `~/.aiworker/{worker.db,.env,workers/<workerId>/{AGENT.md,SOUL.md,USER.md,brain/skills,brain/memories,workspaces/}}` |

`local/` 目录强制 `.gitignore = "*\n!.gitignore\n"`（worker.db / .env / workspaces 等敏感产物绝不入 git）；`.aiworker/.gitignore = "local/\n"`（其余 persona / policy / toolsets / skills / memories 默认入 git，团队共享 agent 人格定义）。每个 project worker 独立 mint master key（写入 `.aiworker/local/.env`，chmod 0600），与 user 级 `~/.aiworker/.env` 物理隔离——这是数据安全边界。

```sh
# 进入要拥有这个 worker 的项目目录（不要求 git repo）
cd ~/code/my-project

# 非交互或脚本里显式选择 Soul preset
aiworker init --soul developer
# → ✓ project-scope worker w_xxxxxxxxxxxx ready (~/code/my-project)
# → AIWORKER_MASTER_KEY 写入 .aiworker/local/.env（仅首次输出明文）
# → bootstrap token 打印（仅一次）

# 交互终端可省略 --soul，按 wizard 选择 preset 或 customize
aiworker init

# 走 legacy user scope（host 上唯一 worker）
aiworker init --global

# 兼容旧脚本；默认已允许非 git 目录，且仍不覆盖既有文件
aiworker init --force
```

### `aiworker scope`

诊断命令（零副作用）。打印当前 cwd 命中的 aiworker scope（user / project / explicit）+ home 路径 + layout 各文件存在性。等同 `git config --list --show-origin` 的角色，运维在跑数据修改命令前先查清楚自己在哪个 scope。

```sh
aiworker scope
# Scope        : project
# Home         : ~/code/my-project/.aiworker/local
# Source       : project-detect
# Project root : ~/code/my-project
#   ✓ AGENT.md       ~/code/my-project/.aiworker/AGENT.md
#   ✓ SOUL.md        ~/code/my-project/.aiworker/SOUL.md
#   ...
```

**Scope 解析优先级**（高 → 低）：
1. CLI `--aiworker-home <path>`（reserved，未来）
2. `AIWORKER_HOME` env（systemd / docker 通常显式设）
3. `<cwd>/.aiworker/`（向上搜，遇 git boundary 即停止——不跨 monorepo / repo 边界）
4. `~/.aiworker/`（user 级 fallback）

### `aiworker run --message <text> [--chat-id <id>] [--dry-run] [--timeout-ms <n>]`

一次性把一条消息喂进 orchestrator。事件以 NDJSON 输出到 stdout，直到 orchestrator 发出终态事件（`orchestrator.finished` 成功 / `orchestrator.error` 失败）。

```sh
aiworker run --message "hello"
# {"type":"channel.inbound",...}
# {"type":"conversation.message",...}
# {"type":"orchestrator.text",...}
# {"type":"orchestrator.finished",...}
```

- `--dry-run` — 完整 bootstrap 但不投递消息，用于 CI 冒烟。
- `--timeout-ms` — 硬上限，默认 120000；未按时到达终态事件 → 退出 124。

Exit codes: 0 success, 1 task failed, 2 bad arguments, 124 timeout.

### `aiworker serve [--port <n>] [--host <host>] [--gateway <wsUrl>] [--gateway-token <token>] [--no-reconnect] [--no-serve-web]`

启动 worker HTTP 服务。行为等同 `AIWORKER_MODE=worker bun src/index.ts`：同一套 bootstrap / 路由 / hot-reload 契约 / `/openapi.json` / `/docs`。

**`--gateway <wsUrl>`**（PLAN-013 S4）：在 HTTP server 之外额外拨一条 WS 到 gateway，作为 `role=node` 接入。两条路径并行跑，SIGTERM 时都会优雅关闭。

- `--gateway-token <token>` — 给 gateway 的 bearer，loopback 场景可省。
- `--no-reconnect` — 禁用自动重连，冒烟/测试用。
- `--host <host>` — 覆盖 `AIWORKER_WORKER_HOST`，默认 `127.0.0.1`。
- `--no-serve-web` — 不挂载 worker `/admin/*` bundle，访问返回 404。

Admin fail-closed：当 worker admin bundle 实际存在并会被挂到 `/admin/*` 时，非 loopback 绑定（如 `--host 0.0.0.0`）必须满足其一：前置 Caddy / Cloudflare Access / IP allowlist / basic-auth 等外部鉴权已经覆盖，并设置 `AIWORKER_ADMIN_EXTERNAL_AUTH=1`；或使用 `--no-serve-web` 关闭 admin 静态资源。这不会给应用本身加登录态，只是防止公开绑定时静默裸跑 admin。

```sh
# 纯 HTTP：
aiworker serve --port 9217

# HTTP + 同时作为 node 注册到本机 gateway：
aiworker serve --port 9217 --gateway ws://127.0.0.1:9218/ws

# 公开绑定但不暴露 worker admin：
aiworker serve --host 0.0.0.0 --port 9217 --no-serve-web
```

**Self-enroll / OTP enroll via env**（PLAN-018 / FEAT-024 + PLAN-019 / FEAT-026）：当 env 设了 `AIWORKER_GATEWAY_URL` 且**未** 传 `--gateway` flag 时，`aiworker serve` bootstrap 完成后自动拨 gateway，按下面触发表分派 self-enroll（带 join token）或 OTP（attended）路径——operator 完全不用跑 `aiworker pair`。

| `--gateway` flag | `AIWORKER_GATEWAY_URL` | `AIWORKER_JOIN_TOKEN` | `AIWORKER_ENROLL_MODE` | 行为 |
|---|---|---|---|---|
| 设 | 任意 | 任意 | 任意 | 走老路径（operator-pull 后 deviceToken 已下发，flag 显式覆盖 env） |
| 未设 | 设 | 设 | 缺省 / `'auto'` | **PLAN-018 self-enroll**：拨 `<URL>/ws`，连接帧 enroll 块带 join token |
| 未设 | 设 | 未设 | 任意 | **PLAN-019 OTP enroll**：拨 `<URL>` 并把 path 强制改写为 `/enroll-ws`，连接帧 `enroll.mode='otp'`，stdout 打 8 字符 OTP 等 operator approve |
| 未设 | 设 | 设 | `'otp'` | **强制 OTP**（即使设了 JOIN_TOKEN 也走 OTP，用于 attended 但 deployer 不该持 fleet 凭证的场景） |
| 未设 | 未设 | 设 | 任意 | `consola.warn` 跳过 |
| 未设 | 未设 | 未设 | 任意 | 纯 HTTP 模式 |

self-enroll vs OTP 差异：

- **self-enroll**：worker 端持 fleet 共享 `AIWORKER_JOIN_TOKEN`，gateway 验签后直接落 fleet.db，无人审；适合 CI / k8s / 自动化批量部署。
- **OTP**：worker 端**不**持 fleet 凭证，gateway 给 worker 派 8 字符 OTP（`XXXX-YYYY`，去歧义 30 字符 alphabet），worker 通过任意带外通道把 OTP 发给 operator，operator `aiworker enroll approve <otp>` 决定放行；适合给客户 / 朋友 / CI runner 等不该看见 fleet 凭证的人装 worker。

OTP 模式 stdout 格式（`apps/cli/src/commands/serve.ts::formatOtpBox`）：

```text
[aiworker serve] OTP enrolling to ws://gateway-host:9218/enroll-ws; awaiting operator approval

┌──────────────────────────┐
│  OTP:  BX7P-K39M         │
│  expires in 300s         │
└──────────────────────────┘

[aiworker serve] OTP BX7P-K39M 已签发，请用 `aiworker enroll approve BX7P-K39M` 准入；expires in 300s
```

适用场景与运维 / 排错见 [`docs/deployment.md` § Worker self-enroll quick start](./deployment.md#worker-self-enroll-quick-start-plan-018--feat-024) 与 [§ Worker OTP-attended enroll quick start](./deployment.md#worker-otp-attended-enroll-quick-startplan-019--feat-026)。

```sh
# self-enroll（NAT 后批量部署）：
AIWORKER_GATEWAY_URL=wss://aiw.example.com/ws \
AIWORKER_JOIN_TOKEN=<shared> \
AIWORKER_DISPLAY_NAME=prod-1 \
aiworker serve --port 9217

# OTP enroll（attended，deployer 无 fleet 凭证）：
AIWORKER_GATEWAY_URL=wss://aiw.example.com/ws \
AIWORKER_DISPLAY_NAME=ben-laptop \
aiworker serve --port 9217
# stdout 打 OTP 后 deployer 把它带外发给 operator
```

### `aiworker config-show`

打印当前（已 redact）worker 配置与 monotonic version。若本地 worker state 尚不存在，
该命令会执行与 worker-local 命令一致的轻量 bootstrap：创建 `.env` / `worker.db`、
运行迁移并 seed 默认配置，但不会启动 HTTP server：

```sh
aiworker config-show
# {
#   "version": 1,
#   "config": { ... }
# }
```

### `aiworker config-set <json> [--if-match <version>]`

替换 worker config。Payload 与 WS 方法 `config.put` / 旧 REST `PUT /api/worker/config` 一致。`--if-match` 触发乐观锁——存储 version 不等则拒绝。成功后把 redact 后的 config mirror 写入 `~/.aiworker/workers/<workerId>/config.yaml`（advisory）。

```sh
aiworker config-set "$(cat new-config.json)" --if-match 1
# → [aiworker config-set] stored config v2
```

Exit codes: 0 success, 2 invalid JSON / validation failure, 3 version conflict.

### `aiworker token-rotate`

Mint 新 API token，AES-GCM 加密后覆盖 `worker_identity.api_token_enc`，明文打印一次：

```sh
aiworker token-rotate
# [aiworker token-rotate] worker w_xxxxxxxxxxxx token rotated
# wtk_NEWTOKENHERE
```

旧 token 立即失效。保存明文；存储里只留密文。

### `aiworker approvals-list`（PLAN-014 F2）

读取**本地** worker HTTP 端点 `GET /api/worker/approvals`，列出当前进程内所有挂起的 per-tool 审批：

```sh
aiworker approvals-list
# {
#   "approvals": [
#     { "taskId":"...","toolCallId":"...","toolName":"...","params":{...},"expiresAt":1714... }
#   ]
# }
```

不经 gateway，是 dev / 运维兜底路径——管理员 ssh 进 worker 容器即可观察。端口取 `workerEnv.PORT`（默认 9217），bearer 由 `loadWorkerContext()` 从 worker.db / vault 解出。

### `aiworker approvals-grant <taskId> <toolCallId> [--deny]`（PLAN-014 F2）

调 `POST /api/worker/approvals/:taskId/:toolCallId/grant`，下发决策。默认 `decision=allow`；带 `--deny` 改为 `deny`：

```sh
aiworker approvals-grant tsk_xxx call_yyy            # allow
aiworker approvals-grant tsk_xxx call_yyy --deny     # deny
```

`deny` 路径会在 worker 内合成助手消息 `"tool {name} blocked by policy"` 短路返回。

### `aiworker schedule-list`（PLAN-014 F4）

读取本地 `worker.db` 的 `cron_jobs` 表，输出全部 job：

```sh
aiworker schedule-list
# {
#   "jobs": [
#     { "id":"...","expression":"0 9 * * *","prompt":"早报","channel":"web","chatId":"...","accountId":"sys:cron","enabled":true,"lastRunAt":null,"nextRunAt":"..." }
#   ]
# }
```

实现复用 in-process `CronService`（一次性 boot + CRUD + 退出），与 `aiworker config-show` / `aiworker config-set` 模式一致——不绑 server，不进 orchestrator hot path。

### `aiworker schedule-add --expression <expr> --prompt <text> --channel <channel> --chat-id <id> [--account-id <id>] [--disabled]`（PLAN-014 F4）

新增一条 cron job。`--expression` 走 `cron-parser` 校验，无效立即拒绝；`--account-id` 缺省 `sys:cron`（PLAN-014 F1 sys:* 保留前缀）；`--disabled` 把 `enabled` 置 false。

```sh
aiworker schedule-add \
  --expression "0 9 * * *" \
  --prompt "晨间日报" \
  --channel web \
  --chat-id local-cli
# { "job": { "id":"...","expression":"0 9 * * *",... } }
```

### `aiworker schedule-remove <jobId>`（PLAN-014 F4）

按 id 删除：

```sh
aiworker schedule-remove crn_xxxxxxxxxxxx
# { "removed": true }
```

不存在时退出码 `1`，输出 `{ "removed": false }`。

### Exit code 约定（worker-local）

- `0` — 成功；
- `1` — 失败（task 失败、rotate 写错等）；
- `2` — 参数非法（缺 `--message` / JSON 不对 / schema 校验失败）；
- `3` — 业务冲突（例：`config-set` version 不匹配）；
- `124` — 超时。

---

## Operator-remote 命令（两词 form）

operator 通过 WebSocket 与 gateway（`apps/gateway`）对话，由 gateway 转发到目标 worker。所有请求 / 响应 / 事件的帧结构与 METHODS / EVENTS schema 定义在 `@zonease/aiworker-gateway-proto`，由 CLI 与 gateway 共用。

### 本地状态

`~/.aiworker/aim.json`（权限 `0600`，文件名沿用历史以避免 operator 升级时丢配置）持久化：

```jsonc
{
  "gatewayUrl": "ws://localhost:9218/ws", // 默认；aiworker gateway start 会改写
  "deviceId":   "op-<uuid>",              // 首次 aiworker gateway/pair 时生成
  "deviceToken":"",                       // pair 成功后由 gateway 颁发
  "defaultWorkerId": "w_..."              // 省略 <workerId> 参数时的回退
}
```

补充文件：`~/.aiworker/aim-gateway.pid`（本机 daemon PID）、`~/.aiworker/aim-gateway.log`（daemon 日志）。

### Exit code 约定（operator-remote）

- `0` 成功；`1` 泛型失败；`2` 参数非法 / 未知方法；`3` WS 等待超时；`4` 连接断开。

---

## Gateway 生命周期

### `aiworker gateway start [--port <n>] [--no-serve-web]`

本机拉起 gateway daemon。成功后把 `gatewayUrl: ws://localhost:<port>/ws` 回写到 `aim.json`。

Gateway bind host 由 `AIWORKER_GATEWAY_HOST` 控制，默认 `127.0.0.1`。非 loopback host 仍然必须配置 `INTERNAL_SHARED_SECRET`；如果同时实际挂载 fleet `/admin/*` bundle，还必须设置 `AIWORKER_ADMIN_EXTERNAL_AUTH=1` 来确认外部鉴权已覆盖，或用 `--no-serve-web` 关闭 admin 静态资源。

```sh
aiworker gateway start --port 9218
# ✔ gateway 已启动 (foreground) port=9218
```

### `aiworker gateway status`

```sh
aiworker gateway status
# ✔ gateway daemon 运行中 pid=12345
# ℹ pidFile: /root/.aiworker/aim-gateway.pid
# ℹ logFile: /root/.aiworker/aim-gateway.log
```

### `aiworker gateway stop [--timeout-ms <n>]`

SIGTERM → 等 `timeoutMs` → SIGKILL 兜底。

---

## Fleet 管理

### `aiworker fleet list`

```sh
aiworker fleet list
# {
#   "workers": [
#     { "workerId":"w_abc","displayName":"prod-1","online":true,"deviceId":"node-...","baseUrl":"http://...:9217","lastSeenAt":1714... },
#     ...
#   ]
# }
```

### `aiworker fleet info <workerId>`

转发到目标 worker 的运行时快照（原 REST `GET /api/worker/info` 等价物）。

### `aiworker fleet launch [--display-name <name>] [--image <image>] [--force-id <workerId>]`

由 gateway supervisor 本机拉起一个 worker 容器，自动 pair，deviceToken 写回本地状态。

前置条件：gateway 启用 `AIWORKER_GATEWAY_CAN_LAUNCH=true`（compose overlay `docker-compose.supervisor.yml`），并正确挂载 `/var/run/docker.sock:ro` + `WORKER_DATA_ROOT`。

```sh
aiworker fleet launch --display-name demo
# ✔ 已 launch worker w_xxxxxxxxxxxx
```

### `aiworker fleet stop <workerId>`

给目标 worker 下停止指令（不从 fleet 中摘除）。

### `aiworker fleet remove <workerId>`

从 fleet 中摘除该 worker（deviceToken 作废 + 若在线则踢下线）。若 `defaultWorkerId` 正是它，也会从 `aim.json` 清掉。

---

## Pair / chat / config / token

### `aiworker pair --url <wsUrl> --worker-url <httpUrl> --bootstrap-token <token> [--display-name <name>]`

把一个已启动的 worker 通过 bootstrap token 注册到 gateway。gateway 会调 worker 的 `/info` 验 token，加密落 fleet.db，并把 deviceToken 返回——CLI 把它写回 `aim.json`，之后所有 operator 请求都用它。

```sh
aiworker pair \
  --url ws://127.0.0.1:9218/ws \
  --worker-url http://aiworker-worker:9217 \
  --bootstrap-token wtk_xxxxxxxxxxxx \
  --display-name test
# ✔ 已配对 worker w_xxxxxxxxxxxx
# { "workerId": "w_xxxxxxxxxxxx" }
```

失败码：`auth_failed` / `worker_unreachable` / `already_registered` / `quota_exceeded` / `master_key_missing`。

### `aiworker chat <workerId> '<text>' [--conversation-id <id>] [--timeout-ms <n>]`

给 worker 的某个会话追加一条用户消息并触发一次 run，阻塞到 `agent.done` 事件。stdout 输出 NDJSON：`chat.message` / `agent.thinking` / `agent.tool_call` / `agent.done`。

```sh
aiworker chat w_xxxxxxxxxxxx '查一下今天东京天气'
# {"type":"event","name":"agent.thinking",...}
# {"type":"event","name":"agent.tool_call",...}
# {"type":"event","name":"agent.done",...}
```

### `aiworker config get <workerId>`

读 worker 当前 config + version：

```sh
aiworker config get w_xxxxxxxxxxxx
# { "version": 2, "config": { ... } }
```

### `aiworker config set <workerId> <json> --if-match <version>`

乐观锁更新 config。`--if-match` 必填，防止误覆盖。

```sh
aiworker config set w_xxxxxxxxxxxx "$(cat new-config.json)" --if-match 2
```

### `aiworker token rotate <workerId>`

为目标 worker 轮换 deviceToken；gateway 会：

1. 调 worker 的 `/token/rotate` 下发新 token；
2. 重新加密落 `registered_workers.apiTokenEnc`；
3. 把新 deviceToken 返回给 operator。

```sh
aiworker token rotate w_xxxxxxxxxxxx
# { "deviceToken": "wtk_NEWTOKENHERE" }
```

---

## OTP enrollment（operator 侧人审）

### `aiworker enroll list`（PLAN-019 / FEAT-026）

通过 gateway WS 协议 `enroll.list` 列出当前所有 pending OTP enrollment——它们是**已 submit 但 operator 还没 approve / reject**的 worker，连接挂在 `apps/gateway/src/registry/pending.ts::PendingEnrollmentRegistry` 内存队列里。

```sh
aiworker enroll list
# {
#   "pending": [
#     {
#       "otp": "BX7P-K39M",
#       "workerId": "w_xxxxxxxxxxxx",
#       "displayName": "ben-laptop",
#       "submittedAt": 1714...,
#       "expiresAt": 1714...
#     }
#   ]
# }
```

返回字段刻意不含 worker 自报的 `apiToken`（仅在 approve 时落 fleet.db）；`expiresAt` 由 `AIWORKER_ENROLL_OTP_TTL_SEC`（默认 300s）算出。空列表也是合法返回。

### `aiworker enroll approve <otp>`（PLAN-019 / FEAT-026）

调 gateway 协议 `enroll.approve`，参数即 worker stdout 上看到的 OTP（`XXXX-YYYY` 形态）。gateway 在原 ws 上推 `enrollment.approved` 事件回 worker，worker 立即升级为 fleet 内正式 node：

```sh
aiworker enroll approve BX7P-K39M
# ✔ 已批准 OTP BX7P-K39M，workerId=w_xxxxxxxxxxxx
# {
#   "workerId": "w_xxxxxxxxxxxx",
#   "deviceToken": "wtk_..."
# }
```

approve 在 fleet.db 写 `addedBy='otp'` 行（与 self-enroll 共用 `upsertEnrolledWorker`），写完才 broadcast `worker.online`。失败码：

- `not_found` — OTP 不在 pending 列表（可能已 approve / reject / expire）
- `master_key_missing` — gateway 未配 `AIWORKER_MASTER_KEY`
- `quota_exceeded` — `AIWORKER_MAX_WORKERS` 已满（已注册 workerId 重批不占新名额）
- `feature_disabled` — gateway 未注入 pending registry（异常 / 测试场景）

### `aiworker enroll reject <otp>`（PLAN-019 / FEAT-026）

```sh
aiworker enroll reject BX7P-K39M
# ℹ 已拒绝 OTP BX7P-K39M
# { "rejected": true }
```

worker 端立即收到 `close 4403 enroll:rejected`，audit 写 `gateway.enrollment.rejected`（含 `otpHash` 前 16 hex）。OTP 本身不返回明文给 audit，避免 fleet.db 拷贝出去后用来批准已 reject 的请求。

OTP 不存在时返回 `{ rejected: false }` + warn——非错误，幂等。

---

## Per-tool approvals（operator 侧）

### `aiworker approvals list [--worker <id>]`（PLAN-014 F2）

通过 gateway WS 协议 `approval.list` 列出挂起的 per-tool 审批。带 `--worker` 时只查指定 worker；不带时先 `workers.list` 拉全部 online worker，再并行查每个 worker 的 approvals 并聚合：

```sh
aiworker approvals list
# 聚合所有 online worker
aiworker approvals list --worker w_xxxxxxxxxxxx
# 只查指定
# {
#   "approvals": [
#     { "workerId":"w_...","taskId":"tsk_...","toolCallId":"call_...","toolName":"...","params":{...},"expiresAt":1714... }
#   ]
# }
```

### `aiworker approvals grant <workerId> <taskId> <toolCallId> [--deny]`（PLAN-014 F2）

调 gateway 协议 `approval.grant`，下发 `allow` / `deny` 决策。worker 收到后：

- `allow`：`ApprovalStore` resolve，orchestrator 继续执行 tool。
- `deny`：合成 `"tool {name} blocked by policy"` 助手消息短路。

```sh
aiworker approvals grant w_xxxxxxxxxxxx tsk_xxx call_yyy
aiworker approvals grant w_xxxxxxxxxxxx tsk_xxx call_yyy --deny
```

---

## Cron schedule（operator 侧）

### `aiworker schedule list <workerId>`（PLAN-014 F4）

读取目标 worker 上 `cron_jobs` 表全量：

```sh
aiworker schedule list w_xxxxxxxxxxxx
# { "jobs": [ { "id":"...","expression":"0 9 * * *","prompt":"...","channel":"web","chatId":"...","accountId":"sys:cron","enabled":true,... } ] }
```

### `aiworker schedule add <workerId> --expression <expr> --prompt <text> --channel <channel> --chat-id <id> [--account-id <id>] [--disabled]`（PLAN-014 F4）

通过 gateway 协议 `cron.add` 在远端 worker 落库一条 cron job。`--account-id` 缺省 `sys:cron`，`--disabled` 把初始 `enabled` 置 false。

```sh
aiworker schedule add w_xxxxxxxxxxxx \
  --expression "*/15 * * * *" \
  --prompt "每 15 分钟巡检" \
  --channel web \
  --chat-id ops-monitor
```

### `aiworker schedule remove <workerId> <jobId>`（PLAN-014 F4）

```sh
aiworker schedule remove w_xxxxxxxxxxxx crn_xxxxxxxxxxxx
# { "removed": true }
```

---

## Logs

### `aiworker logs <workerId> [--follow] [--tail N] [--timeout-ms <n>]`

订阅 worker 的日志尾部，stdout 输出 NDJSON `logs.line` 事件。`--follow` 持续订阅直到超时或 Ctrl-C；`--tail N` 请求历史行数（上限 1000）。

```sh
aiworker logs w_xxxxxxxxxxxx --follow --tail 200
# {"type":"event","name":"logs.line","payload":{"stream":"stdout","line":"...","ts":...}}
```

---

## `aiworker install systemd`（PLAN-016）

把 gateway daemon 包成 systemd unit，开机自启 / 长跑。前台跑 `aiworker gateway start` 适合开发，**生产推荐用 systemd**——这是部署主路径，详见 [`docs/deployment.md` § 形态二：systemd 服务化](./deployment.md#形态二systemd-服务化推荐-linux-服务器)。

```sh
aiworker install systemd [--user|--system] [--dry-run] [--out <path>] [--no-enable] [--exec-start <command>]
```

| Flag | 默认 | 含义 |
|------|------|------|
| `--user` | 是（默认） | 用户实例：`~/.config/systemd/user/aiworker-gateway.service`，`WantedBy=default.target` |
| `--system` | 否 | 系统实例：`/etc/systemd/system/aiworker-gateway.service`，`WantedBy=multi-user.target`；需 root |
| `--dry-run` | 否 | 只打印 unit 内容到 stdout，不写盘、不 enable |
| `--out <path>` | 不设 | 覆盖目标路径（测试 / 异常布局 / packaging 用） |
| `--no-enable` | 否 | 写文件后**不**调 `systemctl daemon-reload + enable --now`，留给运维手动 |
| `--exec-start <command>` | 自动探测当前 CLI | 高级覆盖：手动指定完整 systemd `ExecStart` 命令 |

unit 模板（`--user` 形态）：

```ini
[Unit]
Description=AIWorker gateway daemon (user instance)
Documentation=https://github.com/ZonEaseTech/aiworker/blob/main/docs/deployment.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=AIWORKER_HOME=%S/aiworker
EnvironmentFile=-%h/.config/aiworker/gateway.env
ExecStart=/absolute/path/to/current/aiworker gateway start
Restart=on-failure
RestartSec=5
StateDirectory=aiworker
StateDirectoryMode=0700
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=%S/aiworker
NoNewPrivileges=true

[Install]
WantedBy=default.target
```

`--system` 形态使用 `/etc/aiworker/gateway.env`、`AIWORKER_HOME=/var/lib/aiworker`、`StateDirectory=aiworker`、`User=root` / `Group=root`，`WantedBy` 改 `multi-user.target`。

幂等：同一 `--out` 路径反复跑产生**字节级一致**的 unit 内容；只有 `aiworker install systemd --dry-run` 输出与最终写盘一致，才算合法实现。

远程 PATH / version 诊断：

- systemd unit 的 `ExecStart` 使用绝对路径或 `%h` 展开路径，不依赖远程
  `ssh` / `aissh exec` shell 的 PATH。远程 shell 里的 `which aiworker`
  可能与 systemd 实际运行的 binary 不一致。
- 查 systemd 部署版本时，先从 `systemctl show ... --property=ExecStart`
  读取 unit-visible `argv[]`。当前 direct-CLI unit 可运行 `path=` 的
  `--version`；portable ExecStart 如果经 `bun <aiworker.js>` 启动，则以
  `argv[]` 完整命令为准，不要误把 `bun --version` 当成 AIWorker 版本。
- 不要把 env 文件或 `systemctl show -p Environment ...` 输出贴进诊断记录；
  它们可能包含 `AIWORKER_MASTER_KEY`、`INTERNAL_SHARED_SECRET` 或其它 secret。
- 需要稳定远程命令路径时，把 AIWorker CLI 本身（不是 `bun` 解释器）
  symlink 到 `/usr/local/bin/aiworker`，再用 `/usr/local/bin/aiworker --version`。

完整命令见 [`docs/deployment.md` § 远程 PATH / 版本诊断](./deployment.md#远程-path--版本诊断)。

注意：

- unit 模板的 `ExecStart` 默认从当前运行的 CLI 解析：Bun/npm global 安装通常渲染为绝对 `bun <aiworker.js> gateway start` 或 standalone `aiworker gateway start`。不要假设 `/root/.bun/bin/aiworker`；确实要固定旧路径时用 `--exec-start '/root/.bun/bin/aiworker gateway start'` 显式选择。
- unit 只引用 `EnvironmentFile`，不会把 secret 写进 unit。首次运行按安装输出创建 `gateway.env`：`AIWORKER_MASTER_KEY=$(openssl rand -hex 32)` 和 `INTERNAL_SHARED_SECRET=$(openssl rand -base64 24)`，文件权限 `0600`。
- 写入变更后默认执行 `daemon-reload + enable --now`。这会启动未运行的服务，但不会重启已在运行的服务；升级/重装时按输出提示在维护窗口执行 `systemctl [--user] restart aiworker-gateway`。
- `--system` 形态需要明确知道在做什么——服务以 root 跑、数据写到 `/var/lib/aiworker`。新手优先 `--user`。
- worker 进程目前不提供 systemd 模板（worker 通常按需手工 `aiworker serve` 或走 docker fast-launch；gateway 是常驻的"那一个"）。

---

## 老版 caveats（保留给迁移用户）

- 历史 PLAN-013 / PLAN-018 / PLAN-019 期间命令为 `aiw <subcmd>`（worker-side）和 `aim <subcmd>`（operator-side），PLAN-020 / FEAT-028 起合并为单二进制 `aiworker`，**无 backwards-compat shim**——脚本里残留的 `aiw` / `aim` 调用必须按本文件 §worker-local / §operator-remote 命令树替换。
- 历史 task 卡 / changelog 条目仍保留 `aiw` / `aim` 字面（设计如此，史料不动）；新写的脚本与文档统一走 `aiworker`。
- 子命令名仍是带空格的两词（`config get` / `token rotate`）；`cac` 6 原生不支持，`aiworker.ts` 在入口前做了一次 argv 预处理把 `argv[2]+argv[3]` 合成一个 token。新增两词命令需注册到 `cli.command('foo bar', ...)` 并让多词识别表自动拾取。
- `aiworker run` 默认频道 `web` 与 chat id `cli:stdin`；webhook-driven 频道（Telegram / Lark / WhatsApp）仍需 `aiworker serve`。
- 没有 `aiworker repl` / 交互循环；`aiworker run` 是一次性。
- PLAN-013 下线了 dashboard 模式；任何仍走 REST 的脚本需要切到 `aiworker` operator-remote 子命令或 gateway WS 客户端。变更明细见 `docs/changelog.md` 的 PLAN-013 条目。
