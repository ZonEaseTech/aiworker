# AIWorker

轻量自托管 **Project Brain + Worker/Fleet aggregation runtime**。

AIWorker 负责 Project Brain、worker identity/state、gateway routing、fleet
presence、audit 和 admin surface。Executor 是 bring-your-own 外部 agent runtime：
Codex、Claude Code、Hermes、OpenClaw、Cursor 等继续拥有自己的 MCP、skills、
plugins、auth、sandbox、approval 和 native sessions，AIWorker 只通过薄 adapter
调用、观察和聚合它们。

这里的 Project 是 worker 在 host/workspace 上服务的业务作用域，不等同于
software project。developer Soul 可以把 scope 绑定到代码仓库；HR Soul 可以把
scope 绑定到岗位、候选人池或简历库；legal、finance、ops 等 Soul 也应以各自
业务对象、资料、审核和归档流程为中心建模。

工作站、服务器、k8s pod、docker container 都能跑成一个 worker 加入同一个 fleet。Operator 用一个 CLI 控制所有 worker。

## Operator topology（一图 canonical）

```text
        ┌──────────────────────────────────────────────────────────────┐
        │ Operator / Admin                                             │
        │   $ aiworker fleet ...    $ aiworker gateway ...             │
        └───────────────────┬──────────────────────────────────────────┘
                            │ WS  /ws (basicauth) + /enroll-ws (OTP)
                            ▼
        ┌──────────────────────────────────────────────────────────────┐
        │ AIWorker Gateway (control plane)                             │
        │   fleet.db: registered_workers + audit_events                │
        │   只持指针 / presence / routing / audit ── 不持 brain / 对话 │
        └───────────────────┬──────────────────────────────────────────┘
                            │ WS frame relay
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
   ┌──────────┐         ┌──────────┐        ┌──────────┐
   │ Worker A │         │ Worker B │        │ Worker N │
   └────┬─────┘         └────┬─────┘        └────┬─────┘
        │                    │                   │
        ▼ (data plane, per worker)              ...
   ┌─────────────────────────────────────────────────────────────┐
   │ worker.db (identity + config + conversations, AES-256-GCM)  │
   │ Project Brain (filesystem 权威，5 类资产)                   │
   │ Thin Executor Adapter   →  External Engine                  │
   │   health / run / stream / cancel / resume                   │
   │                            └─→ user/host MCP / skills /     │
   │                                plugins / auth / sessions    │
   └─────────────────────────────────────────────────────────────┘
```

详见 [`docs/architecture.md` § Product Positioning](docs/architecture.md#product-positioning)（同一份 mermaid 图，operator 与 dataplane 视角分开画）；部署形态对照见 [`docs/deployment.md`](docs/deployment.md)。

要点：

- **Gateway = control plane**：fleet.db 只存 worker 指针 / presence / audit；从不缓存 conversations / messages / secrets，也不主动持有 brain 资产。
- **Worker = data plane**：worker.db 与 Project Brain 都在 worker 本机；fleet 视角通过 gateway WS 发指令读 worker，**不**反向 fetch worker REST。
- **External executor only inside the worker**：Codex / Claude Code / Hermes / OpenClaw / Cursor 等 engine 在 worker 内由薄 adapter 调用，永不被 gateway 直接接触；engine 自己持 user/host 级 MCP / skills / plugins / auth / native sessions，AIWorker 不默认隔离这些 ambient capabilities。

## Features

- **Project Brain**：每个业务作用域一份 5 类 brain 资产 — identity（`AGENT/SOUL/USER`）、memory（`MEMORY.md` + `memories/`）、brain skills（`.aiworker/skills/**`）、policy & drafts（`policy.json` / `toolsets.json` / `capability-packs.json` / `.aiworker/mcp.json`）、admission state（roadmap）；filesystem 为权威，便于迁移和审计
- **Worker/Fleet 聚合**：gateway 管 workers、presence、audit、routing；worker 自持 worker.db、Project Brain 和外部 executor adapter
- **4 种入网路径**：OTP-attended（worker deployer 零凭证）/ self-enroll（unattended 批量）/ 手动 pair / docker auto-launch
- **WS 控制面**：operator + worker 共享同一 gateway 入口，按 path 分流（`/ws` basicauth + `/enroll-ws` OTP 专用）
- **Bring-your-own executor**：`http` baseline / `claude-code` / `codex` / `acp` (gemini / qwen) / `cursor` / `mcp`，外部 engine 自己管理 user/host 级能力
- **多 channel webhook**：Telegram / WhatsApp / Lark / LINE / Web，全部强制验签
- **Cron / per-tool approvals / hot-reload / fallback chain** 内建
- **数据物理隔离**：fleet.db（gateway）与 worker.db（每 worker）AES-256-GCM 各自加密
- **三档部署**：裸跑 / systemd / docker compose

---

## 🚀 30 秒 demo

**目标**：本机起一个 worker，加入远端 gateway，发一条消息让 worker 用 LLM 回。

```
┌──────────────────────────┐      OTP enroll          ┌──────────────────────────┐
│   你的工作站              │  wss://<gateway>/        │   远端 gateway            │
│                          │     /enroll-ws           │                          │
│   aiworker serve         │ ───────────────────────► │  /root/.bun/bin/aiworker │
│   (workerId 自动 mint)   │                          │  gateway start (systemd) │
│   listening :9217        │ ◄─────── OTP YDCR-ZD8M ──│                          │
│                          │                          │  fleet.db                │
└──────────┬───────────────┘                          └─────┬────────────────────┘
           │                                                │
           │  ┌─────────────────────────────────────────────┴──┐
           │  │  Step 4: operator 在 gateway 同机 loopback     │
           │  │  ws://127.0.0.1:9218/ws (空 token bypass)      │
           │  │  $ aiworker fleet enroll list                        │
           │  │  $ aiworker fleet enroll approve YDCR-ZD8M           │
           │  └─────────────────────────────────────────────┬──┘
           │                                                │
           │ ◄─────── enrollment.approved (deviceToken) ────┤
           │  worker.online=true 写 fleet.db                │
           │                                                │
           │  Step 6: chat (operator → gateway → worker)    │
           │ ◄─────── chat.send 'hello' ────────────────────┤
           │  orchestrator → executor (claude-code)         │
           │  orchestrator → ... → done                     │
           ├───── chat.message echo ──────────────────────► │
           ▼                                                ▼
     pkill / SIGTERM                                  fleet.db 持久化
```

**Worker 端**（你的工作站，零 fleet 凭证）：

```sh
bun install -g @zonease/aiworker-cli       # 或 npm install -g

export AIWORKER_GATEWAY_URL='wss://your-gateway.example/'
export AIWORKER_DISPLAY_NAME='my-laptop'
aiworker serve
```

输出：

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ⚠️  AIWORKER first-run setup                                              │
│  AIWORKER_MASTER_KEY (写入 ~/.aiworker/.env, chmod 0600)                   │
│      <64 hex chars — 离线备份>                                             │
└────────────────────────────────────────────────────────────────────────────┘
[worker] id=w_ntssfzwwzzq0
[worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_VhW4ea1JrfCJFdSQ...
√ [aiworker serve] worker listening on :9217 (config v1)
i [aiworker serve] OTP enrolling to wss://your-gateway.example/enroll-ws
┌─────────────────────┐
│  OTP:  YDCR-ZD8M    │
│  expires in 300s    │
└─────────────────────┘
```

**Operator 端**（gateway 主机或 basicauth 远端）：

```sh
aiworker fleet enroll list                       # 看 pending OTP
aiworker fleet enroll approve YDCR-ZD8M          # ✔ 已批准
aiworker fleet list                        # online: true
aiworker fleet chat w_ntssfzwwzzq0 'hello'       # NDJSON 流式输出
```

完整端到端实测见 [docs/changelog.md](docs/changelog.md) 11:50 条目。

---

## Install

### 已发布

```sh
bun install -g @zonease/aiworker-cli

# 已安装 Bun 时也可免全局安装：
bunx @zonease/aiworker-cli --help

# npm / npx 也可作为分发入口，但运行时仍需要 bun 在 PATH：
npx @zonease/aiworker-cli --help
npm install -g @zonease/aiworker-cli
```

AIWorker CLI 是 Bun-native：`npx` / `npm install -g` 不会把 runtime 改成 Node。没有 Bun 时，CLI 会提示安装 Bun 或改用 GitHub Releases 的 standalone binary。binary 跑在 `~/.bun/bin/aiworker` 或 `$(npm bin -g)/aiworker`。第一次跑任意命令时自动 mint master key 写到 `~/.aiworker/.env`（chmod 0600）。

**项目级 worker**（PLAN-023，可选）：`aiworker up --soul developer` 会在当前目录 `<cwd>/.aiworker/` 落 Project Brain layout（每个 worker-bound business scope 一份独立 worker.db / master key / persona / brain skills；不要求当前目录是 git repo，也不要求 scope 是软件工程项目），随后完成 brain/runtime 静态预检并启动本地 HTTP/admin。executor（claude / codex / cursor / Hermes / OpenClaw 等）默认是 operator 自己提供的外部运行时，可能加载 user/host 级 MCP、skills、plugins、auth 和 native sessions；AIWorker 不默认做 executor isolation。`aiworker scope` 诊断当前命中的 layout；显式拆步时仍可用 `aiworker init` / `aiworker doctor` / `aiworker serve`。详见 [docs/cli.md §`aiworker up`](docs/cli.md)。
新项目默认使用安全的 `http/default` stub executor；准备好 Codex / Claude 等本机 CLI 后，用 `aiworker executor select --engine codex --apply` 显式切换 task executor，再用 `aiworker executor doctor --engine codex` 检查 engine CLI 和可选 project executor overlay。`.aiworker/executor-capabilities.json` 只是 bootstrap hint / best-effort projection helper，不是 executor effective capability 的完整来源。

```sh
cd ~/code/my-project
aiworker up --soul developer --port 9217
```

### 本地开发

```sh
git clone https://github.com/ZonEaseTech/aiworker
cd aiworker && bun install
bun apps/cli/src/aiworker.ts <subcmd>      # = aiworker <subcmd>
```

下面所有 `aiworker ...` 命令在本地开发态等价 `bun apps/cli/src/aiworker.ts ...`。

---

## 4 种入网路径

| 场景 | 用 | Worker 端凭证 | Operator 介入 |
|---|---|---|---|
| 朋友/客户/CI 临时装 worker | **OTP（推荐）** | 零（worker 不持任何 fleet 共享 secret） | 看 8 字符 OTP → approve |
| k8s/docker compose 批量 unattended | self-enroll | `AIWORKER_JOIN_TOKEN`（fleet 共享） | 无（自动入网） |
| 高安全单 worker 手动 | 手动 pair | worker 启动后输出 `wtk_xxx` bootstrap token | `aiworker fleet pair --bootstrap-token wtk_...` |
| docker fast-launch（gateway 同机） | `aiworker fleet launch` | gateway 自动注入 | 一行命令 |

### OTP（推荐）

Worker:
```sh
export AIWORKER_GATEWAY_URL='wss://your-gateway.example/'
export AIWORKER_DISPLAY_NAME='my-laptop'   # 可选，默认 hostname
aiworker serve
```

Operator:
```sh
aiworker fleet enroll list                       # → pending [{ otp, workerId, displayName }]
aiworker fleet enroll approve <OTP>
```

### self-enroll（自动化）

Worker:
```sh
export AIWORKER_GATEWAY_URL='wss://operator:<basicauth-pwd>@your-gateway.example/ws'
export AIWORKER_JOIN_TOKEN='<gateway 配置的 join token>'
export AIWORKER_DISPLAY_NAME='ci-runner-12'
aiworker serve
# operator 端立即 aiworker fleet list 见到
```

> ⚠️ URL 含 basicauth + JOIN_TOKEN 是 fleet 共享 secret，泄露面大。CI 可接受，朋友机器不要给。

### 手动 pair（高安全）

```sh
# Worker:
aiworker serve --gateway 'wss://operator:<pwd>@gateway/ws'
# 抓 stdout 的 wtk_xxx

# Operator:
aiworker fleet pair --url 'wss://operator:<pwd>@gateway/ws' \
              --worker-url http://<worker-host>:9217 \
              --bootstrap-token wtk_xxx \
              --display-name production-1
```

> 限制：gateway 必须 inbound 到 worker `:9217` 验 token。worker 在 NAT 后用 OTP 替代。

### docker auto-launch

需要 gateway 启用 `AIWORKER_GATEWAY_CAN_LAUNCH=true` + `docker.sock:ro` mount。

```sh
aiworker fleet launch --display-name demo
# gateway supervisor 自动 docker run + scrape bootstrap token + pair
```

详见 [`docs/deployment.md`](docs/deployment.md) supervisor overlay。

---

## Operator cheat sheet

```sh
# fleet 状态
aiworker fleet list                                # 谁在线
aiworker fleet remove <workerId>                   # 摘除（deviceToken 立即失效）

# chat（流式 NDJSON）
aiworker fleet chat <workerId> 'hello'
aiworker fleet chat <workerId> '继续' --conversation-id <prev-id>

# 配置（乐观锁必须带 --if-match）
aiworker fleet config get <workerId>                     # 读出含 version
aiworker fleet config set <workerId> "$(cat new.json)" --if-match <version>

# Token 轮换
aiworker fleet token rotate <workerId>

# OTP 审批
aiworker fleet enroll list / approve <OTP> / reject <OTP>

# 日志订阅
aiworker fleet logs <workerId> --follow --tail 200

# Per-tool approvals
aiworker fleet approvals list
aiworker fleet approvals grant <workerId> <taskId> <toolCallId>           # allow
aiworker fleet approvals grant <workerId> <taskId> <toolCallId> --deny

# Cron
aiworker fleet schedule list <workerId>
aiworker fleet schedule add <workerId> --expression '0 9 * * *' --prompt '早报' --channel web --chat-id daily
aiworker fleet schedule remove <workerId> <jobId>
```

Operator 端首次需写 `~/.aiworker/aiworker.json`：

```sh
mkdir -p ~/.aiworker
cat > ~/.aiworker/aiworker.json <<EOF
{
  "gatewayUrl": "wss://operator:<basicauth-pwd>@your-gateway.example/ws",
  "deviceId": "op-$(uuidgen)",
  "deviceToken": "<INTERNAL_SHARED_SECRET>",
  "defaultWorkerId": ""
}
EOF
chmod 600 ~/.aiworker/aiworker.json
```

> gateway 同机 loopback：用 `ws://127.0.0.1:9218/ws`，无需 basicauth/token（loopback bypass）。

---

## Worker 配 LLM executor

新 worker 默认 `executor: { engine: 'http', variant: 'default' }` 但缺 OpenAI key 会失败。配真实 LLM：

### 选 1：claude-code（本地已 `claude login`）

```sh
# 1. 拿 worker 当前 config + version
aiworker fleet config get <workerId>
# → { "version": 1, "config": {...} }

# 2. 切到 claude-code default variant（model=sonnet, timeout=120s）
NEW='{
  "brains": [
    {
      "id": "local-filesystem",
      "type": "filesystem",
      "priority": 100,
      "readOnly": false,
      "config": {}
    }
  ],
  "brainWriteTarget": "local-filesystem",
  "brainRetrieval": "first-match",
  "executor": { "engine": "claude-code", "variant": "default" },
  "channels": [],
  "evolution": { "enabled": false, "observationRetentionDays": 7 }
}'
aiworker fleet config set <workerId> "$NEW" --if-match 1

# 3. 如果是在该 worker 主机 / 项目目录内调试，可只读确认 brain source / skills / memories
aiworker brain status
aiworker brain skills
aiworker brain memories --limit 20

# 4. chat 验证
aiworker fleet chat <workerId> '请用中文回我一句话'
# {"kind":"accepted",...}
# {"kind":"chat.message","payload":{"role":"assistant","content":"...claude 真实回复..."}}
# {"kind":"done","payload":{"finishReason":"stop"}}
```

要求：worker 进程所在主机能跑 `claude` CLI（PATH 含 `~/.claude/local/claude` 或 npm 全局），且 `~/.claude.json` 有效（`claude login` 已完成）。

`opus-plan` variant 切到 opus + plan 模式：`"executor": { "engine": "claude-code", "variant": "opus-plan" }`。

### 选 2：OpenAI 兼容 (OpenAI / DeepSeek / SiliconFlow / etc.)

```json
{
  "executor": {
    "engine": "http",
    "variant": "default",
    "overrides": {
      "baseUrl": "https://api.deepseek.com/v1",
      "model": "deepseek-chat",
      "apiKeyRef": "secret://openai/deepseek"
    }
  }
}
```

`apiKeyRef` 必须先 register 到 worker 的 `SecretsVault`（POST `/api/worker/secrets`）；明文 secret 永不进 `worker_config.configJson`。

### 选 3：ACP gemini / qwen

```json
{ "executor": { "engine": "acp", "variant": "gemini" } }
```

要求：worker 主机有 `gemini` CLI（`npm install -g @google/generative-ai-cli`）+ `~/.gemini/` auth。

### 选 4：codex / cursor / mcp

详见 [`docs/executor-engines.md`](docs/executor-engines.md)（含每 engine 安装/auth recipe）。

---

## Architecture & deployment

详见：
- [`docs/architecture.md`](docs/architecture.md) — monorepo 布局、数据流、安全模型、env 全表
- [`docs/gateway.md`](docs/gateway.md) — WS 协议（METHODS / EVENTS）+ 4 enroll path 实现
- [`docs/deployment.md`](docs/deployment.md) — 三档部署 run book
- [`docs/deployment-public-https.md`](docs/deployment-public-https.md) — 可选 Cloudflare + Caddy 公网叠加层（含 BUG-007 fail-closed basicauth）
- [`docs/executor-engines.md`](docs/executor-engines.md) — 每 LLM engine 的 auth/install recipe

```
apps/{api, cli, web} + packages/{core, gateway, gateway-proto, shared, storage-sqlite, fs-layout}
```

部署形态：

| 形态 | 适用 | 入口 | docker |
|------|------|------|--------|
| **裸跑** | 开发 / CI | `aiworker gateway start` / `aiworker serve` 前台 | 无 |
| **systemd**（Linux 推荐） | 服务器长跑 | `aiworker gateway install systemd [--user\|--system]` | 无 |
| **docker compose** | 不愿装 bun / per-worker 隔离 | `ops/compose/docker-compose.yml`（GHCR 镜像） | 有 |

---

## 关键 env

| 变量 | 用于 | 说明 |
|---|---|---|
| `AIWORKER_MASTER_KEY` | gateway / worker | 64 hex；丢了 fleet.db / worker.db 解不开 — **必须组织级离线备份** |
| `INTERNAL_SHARED_SECRET` | gateway / 远程 operator | ≥16 chars；远程 operator bearer |
| `AIWORKER_JOIN_TOKEN` | gateway / self-enroll worker | self-enroll 模式触发；与 INTERNAL_SHARED_SECRET 解耦 |
| `AIWORKER_GATEWAY_URL` | worker | OTP / self-enroll 模式连入口 |
| `AIWORKER_DISPLAY_NAME` | worker | operator 端识别用（默认 hostname） |
| `AIWORKER_HOME` | gateway / worker | 默认 `~/.aiworker` |
| `WORKER_DB_PATH` | worker | 默认 `$AIWORKER_HOME/worker.db` |
| `AIWORKER_FLEET_DB_PATH` | gateway | 默认 `$AIWORKER_HOME/fleet.db` |
| `AIWORKER_GATEWAY_PORT` | gateway | 默认 `9218` |
| `AIWORKER_GATEWAY_HOST` | gateway | 默认 `127.0.0.1`；非 loopback 需 `INTERNAL_SHARED_SECRET` |
| `PORT` | worker | 默认 `9217` |
| `AIWORKER_WORKER_HOST` | worker CLI | 默认 `127.0.0.1`；`aiworker serve --host` 可覆盖 |
| `AIWORKER_ADMIN_EXTERNAL_AUTH` | gateway / worker CLI | `1` / `true` 表示 `/admin/*` 已由 Caddy / Access / allowlist 等外部层保护 |
| `AIWORKER_ENROLL_OTP_TTL_SEC` | gateway | OTP 过期秒数，默认 300，[30, 3600] |

完整列表：`apps/api/.env.example` + `ops/compose/.env.example`。

---

## 故障排查（高频）

| 现象 | 原因 | 修法 |
|---|---|---|
| `aiworker fleet list` → `WebSocket Expected 101 status code` | aiworker.json `gatewayUrl` 缺 `/ws` 或 basicauth | 重写 `~/.aiworker/aiworker.json`（见上） |
| 公网 `/health` 返回 401 | Caddy basicauth | `curl -u operator:<pwd> https://your-gateway/health` |
| OTP enroll 后 `aiworker fleet chat` `executor error: OpenAI API key is not configured` | worker 没配 LLM | 走"Worker 配 LLM executor"段，切 claude-code / 配 OpenAI key |
| systemd `aiworker-gateway` exit 1 `gateway 入口未找到` | 用了 0.2.0 旧 cli | `bun install -g @zonease/aiworker-cli@latest`（≥0.2.1）+ restart |

---

## 安全模型

- **fleet.db / worker.db 物理隔离**：gateway 永不存 worker 的业务数据
- **AES-256-GCM** 加密 `registered_workers.apiTokenEnc` + `worker_secrets`
- **timing-safe** bearer 比较
- **5 channel webhook 强制验签**（Telegram / WhatsApp / Lark / LINE / Web binding token）
- **Caddy 路径分流**：`/ws` basicauth 守 operator + 已配对 worker，`/enroll-ws` 仅接受 OTP submit；fail-closed（缺 `/etc/caddy/auth.snippet` 直接拒启动，BUG-007）
- **`/admin/*`（fleet + worker UI）** 与 `/ws`、`/api/*` 同等级，公网必须走 basicauth / Cloudflare Access / IP allowlist / Logto 等外部鉴权。`aiworker {gateway start, serve}` 默认挂 `/admin/*`，但在非 loopback host 上实际服务 admin bundle 时会 fail closed：要么绑定 `127.0.0.1`，要么 `--no-serve-web` / `AIWORKER_*_NO_SERVE_WEB=1` 关闭 admin，要么确认外部鉴权已覆盖后设置 `AIWORKER_ADMIN_EXTERNAL_AUTH=1`。这不是应用内登录开关，只是防止误把公开 admin 静态资源裸跑。

---

## Backup checklist

- **`AIWORKER_MASTER_KEY`** — 离线保管。丢失 = fleet.db 全部 worker 必须重 enroll
- **fleet.db** — gateway 卷
- **每个 worker 的 worker.db** — worker 自己的卷
- **`INTERNAL_SHARED_SECRET`** — operator 凭证
- **`AIWORKER_JOIN_TOKEN`** — fleet 共享 secret（self-enroll 用）
- **Caddy basicauth bcrypt hash** — `/etc/caddy/auth.snippet`

---

## Development

```sh
bun install
bun run typecheck      # 9 packages 全过
bun run test           # 全工作区
bun run lint
```

文档系统（PMA workflow）：[`docs/plan/`](docs/plan/) 历史方案、[`docs/task/`](docs/task/) task 跟踪、[`docs/changelog.md`](docs/changelog.md) 发布日志。新功能按 `/pma` skill 走 investigate → proposal → implement 三阶段。

---

## License

[MIT](LICENSE) © 2026 ZonEase Tech

---

## Status

| Module | Status |
|---|---|
| Gateway WS 控制面 | ✅ Production |
| 4 enrollment paths（OTP / self-enroll / pair / launch） | ✅ Production |
| 6 LLM engines（http / claude-code / acp / codex / cursor / mcp） | ✅ Production |
| 5 channel webhooks（Telegram / WhatsApp / Lark / LINE / Web） | ✅ Production |
| Cron / per-tool approvals / hot-reload | ✅ Production |
| 单 `aiworker` CLI（PLAN-020 / FEAT-028） | ✅ GA |
| npm 发布（`@zonease/aiworker-cli`） | ✅ Latest 0.2.1 |
| In-process gateway（npm install 场景，REFACTOR-004） | ✅ GA |
| Web SPA pending UI | 🔜 Stage-2 |
| Multi-host HA | 🔜 Stage-2 |
