# AIWorker

自托管 Agent Runtime — 由 **Brain provider**（知识 / 记忆 / 技能）与 **Executor provider**（OpenAI 兼容 chat completions + tool calling）组合而成。

工作站、服务器、k8s pod、docker container 都能跑成一个 worker 加入同一个 fleet。Operator 通过一个 CLI 控制所有 worker。

## Features

- **4 种入网路径**：手动 pair、docker auto-launch、自助 self-enroll（unattended）、**OTP-attended enrollment（worker deployer 零凭证）**
- **WS 控制面**：operator 与 worker 共享同一 gateway 入口，按 path 分流
- **多 LLM engine**：`http`（OpenAI / DeepSeek / SiliconFlow 等）/ `claude-code` / `codex` / `gemini-cli` / `qwen-code` / `cursor` / `mcp`
- **多 channel**：Telegram / WhatsApp / Lark / LINE / Web 五种 webhook adapter，全部强制验签
- **Cron / per-tool approvals / hot-reload / fallback chain** 全部内建
- **数据物理隔离**：fleet.db（gateway）与 worker.db（每 worker）AES-256-GCM 各自加密，丢失 master key = 全部失联
- **三档部署**：裸跑（开发）/ systemd（推荐 Linux）/ docker compose（fast-launch）

## Architecture

```
operator ─basicauth─►  /ws         ──────► gateway
worker  ─无凭证─────►  /enroll-ws  ──────► gateway     (OTP enrollment 专用)
                                            │
                                            ▼
                                       fleet.db
                                            │
                                       outbound WS
                                            │
                                       worker process(es)
                                            │
                                            ▼
                                  worker.db + LLM engine
```

详见 [`docs/architecture.md`](docs/architecture.md)。

## Stack

- Bun workspaces (monorepo: `apps/api` + `apps/cli` + `apps/gateway` + `apps/web` + 7 个 packages)
- Hono OpenAPIHono / Bun.serve / Drizzle ORM / SQLite / Zod / consola
- React 19 + TanStack Router/Query + shadcn/ui + Tailwind v4（web SPA）

---

## Quickstart

> **Stage A 命令形态**：当前 CLI 走开发态 `bun apps/cli/src/aiworker.ts <subcmd>`；Stage B（FEAT-027 npm publish）完成后改为 `bun install -g @zonease/aiworker-cli && aiworker <subcmd>`，命令树不变。

### 角色

```
operator        ─── 持 basicauth + aiworker CLI ─── 管 fleet
worker deployer ─── 跑 aiworker serve ────────── 加入 fleet 后等指令
```

### 选哪种 enrollment？

| 场景 | 用 | 一句话 |
|---|---|---|
| 朋友/客户/CI 临时装 worker | **OTP（推荐）** | worker deployer **零凭证**，operator 看 8 字符 OTP 后 approve |
| k8s/docker compose 批量 unattended | self-enroll | env 配 `AIWORKER_JOIN_TOKEN` 自动入网 |
| 高安全单 worker 手动 | 手动 pair | `aiworker pair --bootstrap-token wtk_...` |
| docker fast-launch（gateway 同机） | `aiworker fleet launch` | gateway supervisor 自己拉容器 |

---

## 路径 1：OTP 入网（最简）

### Worker deployer（任何机器，**零 fleet 凭证**）

```sh
# 1. 装 bun
curl -fsSL https://bun.sh/install | bash

# 2. clone + install
git clone <repo-url>
cd aiworker && bun install

# 3. 最小 env
export AIWORKER_HOME="$HOME/.aiworker"
export AIWORKER_MASTER_KEY=$(openssl rand -hex 32)         # worker 自己的 vault key
export WORKER_DB_PATH="$AIWORKER_HOME/worker.db"
export AIWORKER_GATEWAY_URL="wss://your-gateway.example/"  # ← 仅这一个公网地址
export AIWORKER_DISPLAY_NAME="my-laptop"                   # 可选

# 4. init + serve
bun apps/cli/src/aiworker.ts init
bun apps/cli/src/aiworker.ts serve --port 3001
```

控制台输出：

```
i [aiworker serve] OTP enrolling to wss://your-gateway.example/enroll-ws; awaiting operator approval
┌─────────────────────┐
│  OTP:  9CDT-94BK    │
│  expires in 300s    │
└─────────────────────┘
```

把 OTP 报给 operator。

### Operator

```sh
aiworker enroll list
# {"pending":[{"otp":"9CDT-94BK","displayName":"my-laptop",...}]}

aiworker enroll approve 9CDT-94BK
# ✔ 已批准

aiworker fleet list
# {"workers":[{"workerId":"w_xxx","displayName":"my-laptop","online":true,...}]}
```

worker 端同步打：`√ approved as w_xxx; deviceToken=wtk_...，已加入 fleet`。

---

## 路径 2：self-enroll（自动化批量）

Worker 端 env 多两个，省去 operator approve：

```sh
export AIWORKER_GATEWAY_URL="wss://operator:<basicauth-pwd>@your-gateway.example/ws"
export AIWORKER_JOIN_TOKEN="<gateway 端配的 join token>"
export AIWORKER_DISPLAY_NAME="ci-runner-12"

bun apps/cli/src/aiworker.ts init
bun apps/cli/src/aiworker.ts serve --port 3001
# 自动加入；operator 端 aiworker fleet list 直接见到
```

> ⚠️ URL 含 basicauth + JOIN_TOKEN 是 fleet 共享 secret，泄露面大。CI 可接受，朋友机器不要给。

---

## 路径 3：手动 pair（高安全）

```sh
# Worker 端：
bun apps/cli/src/aiworker.ts init
# 抓 stdout 的 wtk_xxx
bun apps/cli/src/aiworker.ts serve --port 3001 --gateway wss://operator:<pwd>@gateway/ws

# Operator 端：
aiworker pair --url wss://operator:<pwd>@gateway/ws \
              --worker-url http://<worker-host>:3001 \
              --bootstrap-token wtk_xxx \
              --display-name production-1
```

> 限制：gateway 必须能 inbound 到 worker `:3001` 验 token。worker 在 NAT 后需要反向 tunnel；改用 OTP 模式避坑。

---

## 路径 4：docker auto-launch

需要 gateway 启用 `AIWORKER_GATEWAY_CAN_LAUNCH=true` + `docker.sock:ro` mount。

```sh
aiworker fleet launch --display-name demo
# gateway supervisor 自动 docker run + scrape bootstrap token + pair
```

详见 [`docs/deployment.md`](docs/deployment.md) 的 supervisor overlay 段落。

---

## Operator 日常 cheat sheet

```sh
# fleet 状态
aiworker fleet list                            # 谁在线
aiworker fleet info <workerId>                 # 单个 worker 运行时快照
aiworker fleet remove <workerId>               # 摘除（deviceToken 立即失效）

# 与 worker 对话（流式 NDJSON）
aiworker chat <workerId> 'hello'
aiworker chat <workerId> '继续' --conversation-id <prev-id>

# 配置（乐观锁必须带 --if-match）
aiworker config get <workerId>                 # 读出含 version
aiworker config set <workerId> "$(cat new.json)" --if-match <version>

# Token 轮换（旧立即失效）
aiworker token rotate <workerId>

# OTP 审批
aiworker enroll list
aiworker enroll approve <OTP>
aiworker enroll reject  <OTP>

# 日志订阅
aiworker logs <workerId> --follow --tail 200

# 审批 per-tool
aiworker approvals list
aiworker approvals grant <workerId> <taskId> <toolCallId>          # allow
aiworker approvals grant <workerId> <taskId> <toolCallId> --deny

# 定时任务
aiworker schedule list <workerId>
aiworker schedule add  <workerId> --expression '0 9 * * *' --prompt '早报' --channel web --chat-id daily
aiworker schedule remove <workerId> <jobId>
```

`aiworker` operator 默认 gatewayUrl 在 `~/.aiworker/aim.json`。第一次跑：

```sh
mkdir -p ~/.aiworker
cat > ~/.aiworker/aim.json <<EOF
{
  "gatewayUrl": "wss://operator:<basicauth-pwd>@your-gateway.example/ws",
  "deviceId": "op-$(uuidgen)",
  "deviceToken": "<INTERNAL_SHARED_SECRET>",
  "defaultWorkerId": ""
}
EOF
chmod 600 ~/.aiworker/aim.json
```

如果在 gateway 同机跑（loopback），用 `ws://127.0.0.1:3000/ws`，无需 basicauth/token。

---

## Worker 配 LLM（claude-code 示例）

```sh
NEW='{"brains":[],"brainWriteTarget":"","brainRetrieval":"first-match","executor":{"engine":"claude-code","variant":"default"},"channels":[],"evolution":{"enabled":false,"observationRetentionDays":7}}'
aiworker config set <workerId> "$NEW" --if-match <current-version>
```

可选 `engine`：`http`（OpenAI 兼容）/ `mcp` / `claude-code` / `acp`(gemini/qwen) / `codex` / `cursor`。

---

## 部署形态对比

| 形态 | 适用 | 入口 | docker |
|------|------|------|--------|
| **裸跑** | 开发 / CI | `aiworker gateway start` / `aiworker serve` 前台 | 无 |
| **systemd**（Linux 推荐） | 服务器长跑 | `aiworker install systemd [--user\|--system]` | 无 |
| **docker compose** | 不愿装 bun / per-worker 隔离 | `ops/compose/docker-compose.yml`（GHCR 镜像） | 有 |

详见 [`docs/deployment.md`](docs/deployment.md)；公网 HTTPS（Cloudflare + Caddy）单独叠加层在 [`docs/deployment-public-https.md`](docs/deployment-public-https.md)。

---

## 关键 env

| 变量 | 用于 | 说明 |
|---|---|---|
| `AIWORKER_MASTER_KEY` | gateway / worker | 64 hex；丢了 fleet.db 解不开 — **必须组织级离线备份** |
| `INTERNAL_SHARED_SECRET` | gateway / 远程 operator | ≥16 chars；远程 aiworker CLI bearer |
| `AIWORKER_JOIN_TOKEN` | gateway / self-enroll worker | self-enroll 模式触发；与 INTERNAL_SHARED_SECRET 解耦 |
| `AIWORKER_GATEWAY_URL` | worker | OTP / self-enroll 模式连入口 |
| `AIWORKER_DISPLAY_NAME` | worker | operator 端识别用 |
| `AIWORKER_HOME` | gateway / worker | 默认 `~/.aiworker` |
| `WORKER_DB_PATH` | worker | 默认 `$AIWORKER_HOME/worker.db` |
| `AIWORKER_FLEET_DB_PATH` | gateway | 默认 `$AIWORKER_HOME/fleet.db` |
| `AIWORKER_GATEWAY_PORT` | gateway | 默认 3000 |
| `AIWORKER_ENROLL_OTP_TTL_SEC` | gateway | OTP 过期秒数，默认 300，[30, 3600] |

完整列表见 `apps/api/.env.example` 与 `ops/compose/.env.example`。

---

## 故障排查（高频 3 条）

| 现象 | 原因 | 修法 |
|---|---|---|
| `aiworker fleet list` → `WebSocket Expected 101 status code` | aim.json `gatewayUrl` 缺 `/ws` 或 basicauth | 重写 `~/.aiworker/aim.json`（见上） |
| OTP `aiworker enroll approve` 后 worker `online: false` | gateway 版本旧（缺 BUG-009 fix，commit `233548b` 起修） | 服务器 `git pull && systemctl restart aiworker-gateway` |
| 公网 `/health` 返回 401 | 你忘了带 basicauth | `curl -u operator:<pwd> https://your-gateway/health` |

详见 [`docs/deployment-public-https.md` § Troubleshooting](docs/deployment-public-https.md)。

---

## 安全模型

- **fleet.db / worker.db 物理隔离**：gateway 永不存 worker 的业务数据
- **AES-256-GCM** 加密 `registered_workers.apiTokenEnc` + `worker_secrets`
- **timing-safe** bearer 比较
- **5 channel webhook 强制验签**（Telegram secret token / WhatsApp HMAC / Lark AES + token / LINE channel signature / Web binding token）
- **Caddy 路径分流**：`/ws` basicauth 守 operator + 已配对 worker，`/enroll-ws` 仅接受 OTP submit；fail-closed（缺 `/etc/caddy/auth.snippet` 直接拒启动）

详见 [CLAUDE.md § Security](CLAUDE.md) 与 [`docs/architecture.md` § 加密与认证](docs/architecture.md)。

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

文档系统（PMA）：[`docs/plan/`](docs/plan/) 是历史方案，[`docs/task/`](docs/task/) 是 task 跟踪，[`docs/changelog.md`](docs/changelog.md) 是发布日志。新功能按 `/pma` skill 走 investigate → proposal → implement 三阶段。

---

## License

(待定)

---

## Status

| Module | Status |
|---|---|
| Gateway WS 控制面 | ✅ Production |
| 4 enrollment paths | ✅ Production |
| 7 LLM engines | ✅ Production |
| 5 channel webhooks | ✅ Production |
| Cron / approvals / hot-reload | ✅ Production |
| **CLI 重命名（单 `aiworker` 入口）** | 🚧 Implementing (PLAN-020 / FEAT-028) |
| **npm 发布** | ⏳ Planned (FEAT-027) |
| Web SPA pending UI | 🔜 Stage-2 |
| Multi-host HA | 🔜 Stage-2 |
