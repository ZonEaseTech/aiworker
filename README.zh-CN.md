# AIWorker

[English](./README.md) · **简体中文**

轻量自托管 **Project Brain + Worker/Fleet aggregation runtime**。

- **Worker** 持 Project Brain（filesystem 权威）、worker.db 和 conversations；外部 executor（Codex / Claude Code / Hermes / OpenClaw / Cursor 等）只通过薄 adapter 调用。
- **Gateway 是可选的 control plane**：单 worker 不需要 gateway 就能用；多 worker 时 gateway 聚合 presence、routing、audit，不持有任何 brain / 对话数据。

## 为什么需要 AIWorker

AIWorker 不是要做一个更聪明的 coding assistant，也不是另一个 executor 平台。如果你只需要一次性的更强聊天或代码 agent，直接使用 Codex、Claude Code、Cursor、Hermes、OpenClaw 或其他 executor 更合适。

当你已经认可外部 executor 的能力，但需要把它们变成绑定真实业务 scope 的、可持久运行、可治理的 worker 时，才需要 AIWorker：

- **Project Brain 是客户自己的资产**：每个 worker 都有 filesystem-first、可 review、可迁移的 brain，用来承载 scope identity、persona、policy、memories、rollups 和 brain skills。
- **自我迭代必须受治理**：executor 可以提出持久 brain 变更，但 memory 与 brain skill 写入必须经过 admission、approval、secret-scan、provenance 和 audit。
- **Bring your own executor**：AIWorker 不替代 executor 的 tool loop、MCP、plugins、sandbox、native sessions、auth 或 model routing；它只在外层提供 scope context、持久化、观测和治理。
- **Worker/Fleet 运维形态**：单 worker 可以独立运行；多 worker 可以通过 gateway 聚合 presence、routing、logs、approvals、cron 和 audit，同时不把 brain、conversations 或 secrets 复制进 fleet.db。

一句话：AIWorker 把现有 AI agent 变成自托管、绑定业务 scope、可审计的业务 worker。它的竞争力不是“模型输出更强”，而是围绕客户已经在用的 executor，提供持久 Project Brain、治理边界和 fleet 运维能力。

## 谁会需要 AIWorker

当你希望 AI agent 不只是一次性聊天窗口，而是绑定真实业务对象、能长期运行、能被治理的 worker 时，AIWorker 才有价值。

- **已经在使用外部 AI executor 的团队**：希望在它们外层补上长期记忆、策略、persona 和可审阅的 brain 文件。
- **把 agent 用在真实业务 scope 上的人**：例如代码仓库、招聘管线、财务周期、客服队列、合规资料夹或运维 runbook。
- **需要先治理再自我学习的组织**：agent 可以提出 memory / brain skill 变更，但写入前必须可审阅、可批准、可审计。
- **同时运行多个 worker 的 operator**：需要统一查看在线状态、路由、日志、审批、定时任务和入网状态，但不想把私有 brain / 对话数据搬进控制面。
- **希望数据仍留在自己手里的客户**：继续使用自己信任的 executor、模型、auth 和工具生态，同时让 AIWorker 管住 scope、持久化和治理边界。

如果你只需要一次 coding session、一次聊天或一个更强模型回答，AIWorker 很可能太重。

## 拓扑

```text
Operator / Admin
  执行 `aiworker fleet ...`
        |
        | WebSocket 控制流
        | basicauth + device token
        v
+--------------------------------------------------------------------------------+
| AIWorker Gateway（可选控制面）                                                   |
|                                                                                |
| fleet.db 存：worker 指针、在线状态、入网状态、审计事件                               |
| fleet.db 不存：Project Brain、对话、worker secrets                               |
+---------------------------+----------------------------+-----------------------+
                            |                            |
                            | WS relay / routing         | WS relay / routing
                            v                            v
                 +----------------------+      +----------------------+
                 | Worker A             |      | Worker B ... N       |
                 | 自己持有自己的数据      |      | 自己持有自己的数据      |
                 +----------------------+      +----------------------+

单 worker 也可以完全不接 gateway：

+--------------------------------------------------------------------------------+
| 单个 worker 数据面                                                               |
|                                                                                |
|  Project Brain（filesystem）       worker.db                                    |
|  - SOUL / USER / MEMORY            - identity 和 config                         |
|  - memories 和治理状态              - conversations 和 messages                  |
|  - .agents / .claude 原生 skills    - 加密本地状态                                 |
|  - policy 和 capabilities                                                     |
|  - admission proposals                                                         |
|                                                                                |
|  AIWorker thin adapter                                                         |
|  - 注入 scope context 和治理边界                                                  |
|  - 观察 run / stream / cancel / resume                                          |
|  - 不替代 executor 自己的 tool loop                                              |
|                                                                                |
|  外部 executor                                                                  |
|  - Codex / Claude Code / Hermes / OpenClaw / Cursor / ACP / MCP / HTTP         |
|  - 自己持有 MCP、skills、plugins、auth、sandbox 和 native sessions                |
+--------------------------------------------------------------------------------+
```

单 worker 可直接跑——gateway 只在需要聚合多个 worker 时才用。控制面与数据面物理隔离：fleet.db 永不存 brain / conversations / secrets；worker.db 永不被 gateway 反向 fetch。完整架构与双视角图：[`docs/architecture.md`](docs/architecture.md)。投产准备度和剩余边界：[`docs/governance-node-status.md`](docs/governance-node-status.md)。

---

## 安装

```sh
bun install -g @zonease/aiworker-cli
# 或 bunx @zonease/aiworker-cli --help（已装 Bun 时）
# 或 npx / npm install -g（运行时仍需 Bun）
```

CLI 是 Bun-native。第一次初始化 worker 时会 mint master key 并写入 worker-local `.env`（project worker 使用 `<project>/.aiworker/local/.env`；显式/user home 使用 `<AIWORKER_HOME>/.env`）。**该 master key 必须组织级离线备份**——丢失 = worker.db / fleet.db 解不开，所有 worker 必须重 enroll。

完整安装与平台 binary：[`docs/deployment.md`](docs/deployment.md)。

---

## CLI 命令发现

`aiworker --help` 有意保持短小，只展示首次上手路径。完整命令索引用
`aiworker commands`；按角色查看用 scoped help：

```sh
aiworker --help
aiworker commands
aiworker worker --help
aiworker fleet --help
aiworker gateway --help
```

---

## 启动 worker（单机最简，不要 gateway）

最常见：把当前业务目录变成一个 worker 作用域，本地起 server + admin UI，用 CLI 跑对话。**不需要任何 fleet 凭证。**

```sh
cd ~/code/my-project
aiworker up --soul developer            # 一键完成 init + doctor + executor readiness + serve
```

`aiworker up` 在 `<cwd>/.aiworker/` 落 Project Brain layout（worker.db、master key、persona、policy、memories、native skill projection manifest），并把默认 skill 以 `aiworker-*` managed namespace 投影到 `.agents/skills` 与 `.claude/skills` 这类 executor 原生 project skill 目录；随后跑预检，报告 executor readiness，并启动 worker HTTP/admin（默认 `:9217`）。它不会替你选择 executor；需要用 `aiworker executor select --engine <id> --apply` 显式选择。Soul 选 `developer` / `hr-recruiting` / `finance-ops` / `qa-reviewer` / `general-assistant` 之一——它们决定 persona / 风险偏好 / 默认 brief 段；governance kernel 行为对所有 Soul 一致。

需要分步控制时：

```sh
aiworker init --soul developer                            # 仅落 layout
aiworker executor select --engine claude-code --apply     # 选 executor（见下文"配 LLM executor"）
aiworker executor doctor --engine claude-code             # 检查 engine CLI + project overlay
aiworker doctor                                            # 整体诊断（PASS / WARN / INFO）
aiworker brain status                                      # 看 brain 资产
aiworker serve --port 9217 --host 127.0.0.1               # 启动 server
aiworker run --message 'hello' --chat-id demo             # CLI 直发一轮（不开 server）
```

启动后：

- Admin UI：`http://127.0.0.1:9217/admin/`（默认 loopback；公网必须外部鉴权，下文）
- Bearer token：`<scope>/.aiworker/local/bootstrap-token.txt`，REST 调用必须带 `Authorization: Bearer <token>`
- Brain 与 conversations 都在本地，没有任何外发流量（除外 executor 自己调 LLM）

新建 worker-local `.env` 会预留 gateway enrollment 的注释示例。
`aiworker doctor` 也会报告当前是 standalone 还是已配置 gateway，并在可选但未配置时打印对应的 `aiworker env ...` 命令。

完整 CLI 参考：[`docs/cli.md`](docs/cli.md)。

---

## 启动 fleet（多 worker + gateway）

Gateway 把多个 worker 聚合成 fleet：operator 一个 CLI 控制全部 worker；worker 自己仍持 brain/对话/secrets。

### 1) 起 gateway

```sh
# 开发 / 单机：前台跑
aiworker gateway start --host 127.0.0.1 --port 9218

# 服务器长跑：systemd
aiworker gateway install systemd --user
systemctl --user start aiworker-gateway
```

绑非 loopback host 必须设：

```sh
export INTERNAL_SHARED_SECRET='<≥16 字符>'   # 远程 operator 的 bearer
# Caddy / Cloudflare Access / Logto 等外部鉴权层守 /ws 与 /admin/*（fail-closed）
```

公网部署 + Caddy basicauth 模板：[`docs/deployment-public-https.md`](docs/deployment-public-https.md)。

### 2) Worker 入网（推荐 OTP）

最常用——worker 端零 fleet 凭证，operator 看 8 字符 OTP 后批准：

```sh
# Worker 端：
aiworker init --soul developer
aiworker env gateway-url wss://your-gateway.example/
aiworker env display-name my-laptop
aiworker serve
# stdout 打印 OTP，例如  YDCR-ZD8M
```

`aiworker init` 也会在 worker-local `.env` 里留下被注释的
`AIWORKER_GATEWAY_URL` / `AIWORKER_DISPLAY_NAME` 示例；只有确实要接入
gateway 时再取消注释或使用上面的 `aiworker env ...` 命令。

```sh
# Operator 端：
aiworker fleet enroll list                  # 看 pending OTP
aiworker fleet enroll approve YDCR-ZD8M     # 批准
aiworker fleet list                         # 现在能看到这个 worker
```

其它 3 种入网路径（self-enroll 批量 / 手动 pair 高安全 / docker auto-launch）：[`docs/gateway.md`](docs/gateway.md)。

### 3) Operator 配 gateway 入口

operator 第一次需要写 `~/.aiworker/aiworker.json`：

```sh
mkdir -p ~/.aiworker && chmod 700 ~/.aiworker
cat > ~/.aiworker/aiworker.json <<EOF
{
  "gatewayUrl": "wss://operator:<basicauth-pwd>@your-gateway.example/ws",
  "deviceId": "op-$(uuidgen)",
  "deviceToken": "<INTERNAL_SHARED_SECRET>"
}
EOF
chmod 600 ~/.aiworker/aiworker.json
```

> Gateway 同机 loopback 可省 basicauth/token：用 `ws://127.0.0.1:9218/ws` 即可。

### 4) Operator 常用命令

```sh
# 状态
aiworker fleet list
aiworker fleet remove <workerId>

# 对话（流式 NDJSON）
aiworker fleet chat <workerId> 'hello'
aiworker fleet chat <workerId> '继续' --conversation-id <prev-id>

# Worker config（乐观锁）
aiworker fleet config get <workerId>                          # 读出 version + config
aiworker fleet config set <workerId> "$NEW_CFG" --if-match <version>

# Token 轮换 / 日志 / cron / per-tool approvals
aiworker fleet token rotate <workerId>
aiworker fleet logs <workerId> --follow --tail 200
aiworker fleet schedule list <workerId>
aiworker fleet schedule add <workerId> --expression '0 9 * * *' --prompt '早报' --channel web --chat-id daily
aiworker fleet approvals list
aiworker fleet approvals grant <workerId> <taskId> <toolCallId>          # allow
aiworker fleet approvals grant <workerId> <taskId> <toolCallId> --deny
```

---

## 配 LLM executor

新 worker 默认 `executor: { engine: 'http', variant: 'default' }`，需要切到真实 LLM 才能工作。

```sh
# 本机：
aiworker executor select --engine claude-code --variant default --timeout-ms 240000 --apply
aiworker executor doctor --engine claude-code

# Fleet 内远程改 worker config：
aiworker fleet config get <workerId>          # 拿 version + 当前 config
aiworker fleet config set <workerId> "$NEW" --if-match <version>
```

支持的 engine：`http`（OpenAI / DeepSeek / SiliconFlow / 任何 chat-completions）、`claude-code`、`codex`、`acp`（gemini / qwen）、`cursor`、`mcp`。

每个 engine 的 install / auth recipe（含 `claude login`、`codex auth`、apiKey vault 写入、ACP CLI 安装）：[`docs/executor-engines.md`](docs/executor-engines.md)。

`executor select --timeout-ms` 设置 executor adapter 的单轮硬超时；
`aiworker run --timeout-ms` 只控制 CLI 等待 worker turn 完成的时间。

---

## 部署形态

| 形态 | 适用 | 入口 |
|---|---|---|
| 裸跑 | 开发 / CI | `aiworker gateway start` / `aiworker serve` 前台 |
| systemd（Linux 推荐） | 服务器长跑 | `aiworker {gateway,worker} install systemd [--user\|--system]` |
| docker compose | 不愿装 bun / per-worker 隔离 | `ops/compose/docker-compose.yml`（GHCR 镜像） |

详见 [`docs/deployment.md`](docs/deployment.md)。

---

## 关键 env

| 变量 | 用途 |
|---|---|
| `AIWORKER_MASTER_KEY` | 64 hex；worker / gateway 数据库 AES 主密钥；**必须离线备份** |
| `INTERNAL_SHARED_SECRET` | gateway 公网或非 loopback 时远程 operator 的 bearer（≥16 字符） |
| `AIWORKER_GATEWAY_URL` | 可选 worker 端 gateway URL（含 path 与 basicauth）；用 `aiworker env gateway-url <url>` 写入当前 worker |
| `AIWORKER_DISPLAY_NAME` | 可选 worker 在 fleet 列表里的展示名（默认 hostname / worker id）；用 `aiworker env display-name <name>` 写入当前 worker |
| `AIWORKER_HOME` | 显式 worker 状态根；project scope 自动解析到 `<project>/.aiworker/local` |
| `AIWORKER_ADMIN_EXTERNAL_AUTH` | `1` = 已由 Caddy / Cloudflare Access / Logto 守 `/admin/*` |

完整列表：`apps/api/.env.example` + `ops/compose/.env.example`，或 [`docs/architecture.md` § Environment](docs/architecture.md)。

---

## 更多文档

- [`docs/architecture.md`](docs/architecture.md) — 系统布局、数据流、安全模型、Brain 治理边界、env 全表
- [`docs/governance-node-status.md`](docs/governance-node-status.md) — 投产准备度清单和剩余边界
- [`docs/gateway.md`](docs/gateway.md) — WS 协议（METHODS / EVENTS）+ 4 enroll path
- [`docs/deployment.md`](docs/deployment.md) — 三档部署 run book + 故障排查 + 备份清单
- [`docs/deployment-public-https.md`](docs/deployment-public-https.md) — 公网 Cloudflare + Caddy 叠加层（含 BUG-007 fail-closed）
- [`docs/executor-engines.md`](docs/executor-engines.md) — 各 executor engine 的 auth/install
- [`docs/cli.md`](docs/cli.md) — 完整 CLI 命令参考
- [`docs/changelog.md`](docs/changelog.md) — release 历史与端到端实测记录

---

## 开发

```sh
git clone https://github.com/ZonEaseTech/aiworker
cd aiworker && bun install
bun run typecheck && bun run lint && bun run test
```

本地开发时优先跑和改动范围匹配的 package 检查；发布或合并前再跑完整 gate。规划记录、实现历史和发布记录在 [`docs/plan/`](docs/plan/) / [`docs/task/`](docs/task/) / [`docs/changelog.md`](docs/changelog.md)。

---

## 状态

> 投产前请阅 [`docs/governance-node-status.md`](docs/governance-node-status.md) 的 readiness 表和剩余边界。1.0.0 以前 CLI / API / config 形态仍可能变化。

CLI npm latest：**0.10.3**。

| 模块 | 状态 |
|---|---|
| Worker 与 Fleet 运维：控制面、enrollment、executor adapters、webhooks、schedule、per-tool approvals、hot reload | ✅ Production |
| Project Brain 治理：memory 变更 review、secret scanning、provenance events、canonical memory 边界、bypass checks | ✅ GA |
| 治理回归覆盖：源码与发布 CLI 双侧 800+ checks，外加长驻 worker REST 多轮回归 | ✅ GA |
| Memory 写入自动化 | ✅ MVP（`memory-add` 可用；其它 proposal type 会被拒绝，直到实现）|
| 可选 LLM-backed Brain reviewer | 🔜 opt-in；默认是 observe-only heuristic review |
| Cross-scope runtime isolation | 🔜 当前由文件系统约定守，不是 runtime 隔离 |
| Web SPA pending UI / Multi-host HA | 🔜 Stage-2 |

---

## License

[MIT](LICENSE) © 2026 ZonEase Tech
