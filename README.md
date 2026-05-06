# AIWorker

轻量自托管 **Project Brain + Worker/Fleet aggregation runtime**。

- **Worker** 持 Project Brain（filesystem 权威）、worker.db 和 conversations；外部 executor（Codex / Claude Code / Hermes / OpenClaw / Cursor 等）只通过薄 adapter 调用。
- **Gateway 是可选的 control plane**：单 worker 不需要 gateway 就能用；多 worker 时 gateway 聚合 presence、routing、audit，不持有任何 brain / 对话数据。

完整架构：[`docs/architecture.md`](docs/architecture.md)。当前是否符合 Project Brain governance node 目标：[`docs/governance-node-status.md`](docs/governance-node-status.md)。

---

## Install

```sh
bun install -g @zonease/aiworker-cli
# 或 bunx @zonease/aiworker-cli --help（已装 Bun 时）
# 或 npx / npm install -g（运行时仍需 Bun）
```

CLI 是 Bun-native。第一次跑任意命令时自动 mint master key 写到 `~/.aiworker/.env`（chmod 0600）。**该 master key 必须组织级离线备份**——丢失 = worker.db / fleet.db 解不开，所有 worker 必须重 enroll。

完整安装与平台 binary：[`docs/deployment.md`](docs/deployment.md)。

---

## 启动 worker（单机最简，不要 gateway）

最常见：把当前业务目录变成一个 worker 作用域，本地起 server + admin UI，用 CLI 跑对话。**不需要任何 fleet 凭证。**

```sh
cd ~/code/my-project
aiworker up --soul developer            # 一键完成 init + executor select + doctor + serve
```

`aiworker up` 在 `<cwd>/.aiworker/` 落 Project Brain layout（worker.db、master key、persona、brain skills），跑预检，并启动 worker HTTP/admin（默认 `:9217`）。Soul 选 `developer` / `hr-recruiting` / `finance-ops` / `qa-reviewer` / `general-assistant` 之一——它们决定 persona / 风险偏好 / 默认 brief 段；governance kernel 行为对所有 Soul 一致。

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
export AIWORKER_GATEWAY_URL='wss://your-gateway.example/'
export AIWORKER_DISPLAY_NAME='my-laptop'    # 可选，默认 hostname
aiworker serve
# stdout 打印 OTP，例如  YDCR-ZD8M
```

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
aiworker executor select --engine claude-code --variant default --apply
aiworker executor doctor --engine claude-code

# Fleet 内远程改 worker config：
aiworker fleet config get <workerId>          # 拿 version + 当前 config
aiworker fleet config set <workerId> "$NEW" --if-match <version>
```

支持的 engine：`http`（OpenAI / DeepSeek / SiliconFlow / 任何 chat-completions）、`claude-code`、`codex`、`acp`（gemini / qwen）、`cursor`、`mcp`。

每个 engine 的 install / auth recipe（含 `claude login`、`codex auth`、apiKey vault 写入、ACP CLI 安装）：[`docs/executor-engines.md`](docs/executor-engines.md)。

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
| `AIWORKER_GATEWAY_URL` | worker 端连入 gateway（含 path 与 basicauth）|
| `AIWORKER_DISPLAY_NAME` | worker 在 fleet 列表里的展示名（默认 hostname）|
| `AIWORKER_HOME` | 默认 `~/.aiworker`；project scope 下走 `<scope>/.aiworker/` |
| `AIWORKER_ADMIN_EXTERNAL_AUTH` | `1` = 已由 Caddy / Cloudflare Access / Logto 守 `/admin/*` |

完整列表：`apps/api/.env.example` + `ops/compose/.env.example`，或 [`docs/architecture.md` § Environment](docs/architecture.md)。

---

## More

- [`docs/architecture.md`](docs/architecture.md) — monorepo 布局、数据流、安全模型、Brain Governance Kernel 决策、env 全表
- [`docs/governance-node-status.md`](docs/governance-node-status.md) — 当前是否符合 Project Brain governance node 目标的 source-backed 评估
- [`docs/gateway.md`](docs/gateway.md) — WS 协议（METHODS / EVENTS）+ 4 enroll path
- [`docs/deployment.md`](docs/deployment.md) — 三档部署 run book + 故障排查 + 备份清单
- [`docs/deployment-public-https.md`](docs/deployment-public-https.md) — 公网 Cloudflare + Caddy 叠加层（含 BUG-007 fail-closed）
- [`docs/executor-engines.md`](docs/executor-engines.md) — 每 LLM engine 的 auth/install
- [`docs/cli.md`](docs/cli.md) — 完整 CLI 命令参考
- [`scripts/governance-kernel-harness.ts`](scripts/governance-kernel-harness.ts) — Brain Governance Kernel 回归 harness（compact / full × source-local / cli-release-local）
- [`docs/changelog.md`](docs/changelog.md) — release 历史与端到端实测记录

---

## Development

```sh
git clone https://github.com/ZonEaseTech/aiworker
cd aiworker && bun install
bun run typecheck && bun run lint && bun run test
```

新功能按 `/pma` skill 走 investigate → proposal → implement 三阶段；后端用 `/pma-bun`，前端用 `/pma-web`，代码评审用 `/pma-cr`。文档：[`docs/plan/`](docs/plan/) / [`docs/task/`](docs/task/) / [`docs/changelog.md`](docs/changelog.md)。

---

## Status

> 投产前请阅 [`docs/governance-node-status.md`](docs/governance-node-status.md) 的 conformance 表 + 残留边界。1.0.0 以前 CLI / API / config 不保证向后兼容（AGENTS.md 显式承诺）。

CLI npm latest：**0.9.2**。

| Module | Status |
|---|---|
| Worker / Fleet 控制面 / 4 enrollment paths / 6 LLM engines / 5 channel webhooks / cron / per-tool approvals / hot-reload | ✅ Production |
| Brain Governance Kernel（admission 三态 + secret-scan + canonical memory 边界 + truthful decision events + bypass detection） | ✅ GA |
| Governance Kernel regression harness（5×2 source + cli-release-local 双侧 600+ checks）+ long-running serve 多轮 REST 回归 | ✅ GA |
| Brain admission `memory-add` materializer | ✅ MVP（其它 kind 走 `unsupported`；apply 后 rollback 仍待实现）|
| Heavy LLM-backed Brain decider | 🔜 opt-in；默认 `evaluator=heuristic` `mode=observe_only` |
| Cross-scope hard isolation（runtime 强制） | 🔜 当前由文件系统约定守，不是 runtime 隔离 |
| Web SPA pending UI / Multi-host HA | 🔜 Stage-2 |

---

## License

[MIT](LICENSE) © 2026 ZonEase Tech
