# AIWorker Deployment

把 AIWorker 跑起来有三种形态。本文档把"主路径"——开发与服务器单机用户应直接走裸跑或 systemd——放在最前面，docker compose 作为可选 fast-launch 段落收在末尾。

公网 HTTPS 反代（Cloudflare + Caddy + 公开域名 + GHCR 镜像 + `scripts/deploy.ts` aissh 流程化部署）已拆成独立 [`deployment-public-https.md`](./deployment-public-https.md)。**只有在你需要把 channel webhook（Telegram / WhatsApp / Lark / LINE）暴露到公网时才需要叠加它。**

---

## Operator topology（部署前必读）

部署任何一档前先理清角色：

- **Gateway** 是 control plane，持 `fleet.db`（`registered_workers` + `audit_events`），通过 `/ws` 与 `/enroll-ws` 给 operator 与 worker 转发帧。它**不**复制 worker 的 brain、对话、配置或 secret。
- **Worker** 是 data plane，每个 worker 持自己的 `worker.db`（identity / config / conversations，AES-256-GCM）与 `<project>/.aiworker/` 下的 Project Brain 五类资产。worker 通过 WS 接 gateway，HTTP/admin 仅暴露给本机或受外部鉴权保护的反代。
- **External executor**（Codex / Claude Code / Hermes / OpenClaw / Cursor 等）只在 worker 进程内被薄 adapter 调用；engine 自己持 user/host 级 MCP / skills / plugins / auth / native sessions，AIWorker 不默认隔离这些 ambient capabilities，也不通过 gateway 触达 engine。

完整 mermaid topology 见 [`architecture.md` § Product Positioning](./architecture.md#product-positioning)；README 顶部 ASCII 简版与本文同源。下面三档部署只是把这套 topology 用不同的进程拓扑/系统服务/容器编排表达出来；fleet.db 与 worker.db 的边界在每一档都不变。

---

## 三档形态对比

| 形态 | 适用场景 | 典型命令 | docker | 公网入口 |
|------|----------|----------|--------|----------|
| **裸跑** | 开发 / 调试 / 一次性试用 | `aiworker gateway start` / `aiworker serve` 前台 | 无 | 无 |
| **systemd 服务化** | Linux 长跑 / 服务器 | `aiworker install systemd [--user\|--system]` | 无 | 可选叠加 deployment-public-https |
| docker compose | 懒人快速试用 / 多 worker 容器隔离 | `docker compose up -d`（`ops/compose/`） | 有 | 必要时叠加 deployment-public-https |

> **默认就选裸跑或 systemd。** docker compose 路径的存在意义只剩两个：(1) 不愿装 bun 时一行命令试用，(2) 需要 `aiworker fleet launch` 自动拉起 per-worker 隔离容器（必须叠 supervisor overlay）。两者都不要求公网暴露。

---

## 公共前置

无论选哪一档都需要：

- [`bun`](https://bun.sh) ≥ 1.1（裸跑 / systemd 必备；docker 形态由镜像内置）。
- 一段 64 字符 hex 的 `AIWORKER_MASTER_KEY`：`openssl rand -hex 32`。**部署前务必离线备份**——丢失 = fleet.db 里所有 `registered_workers.apiTokenEnc` 无法解密，所有 worker 都要重新 `aiworker pair`。
- 一段 ≥ 16 字符的 `INTERNAL_SHARED_SECRET`：`openssl rand -base64 24`。远程 operator 的 bearer，loopback 自动放行。

约定 `~/.aiworker/` 为运行时主目录（`AIWORKER_HOME` 可改）。fleet.db 默认落到这里；worker.db 落到每个 worker 自己的 `~/.aiworker/workers/<workerId>/worker.db`。完整文件布局见 [`architecture.md` § Filesystem source of truth](./architecture.md#filesystem-source-of-truth-plan-012)。

---

## Admin public exposure fail-closed

`/admin/*` 是静态管理 UI，不自带应用内登录。公网部署必须在 AIWorker 前面放 Caddy basic-auth、Cloudflare Access、IP allowlist、Logto 等外部鉴权层。当前实现的保护目标是防止误把 admin bundle 直接绑到公网：

| 绑定 / admin 状态 | 结果 |
|---|---|
| `127.0.0.1` / `localhost` + admin enabled | 允许，适合本机浏览器或受保护反代回源 |
| 非 loopback + `--no-serve-web` | 允许，`/admin/*` 返回 404 |
| 非 loopback + admin enabled + `AIWORKER_ADMIN_EXTERNAL_AUTH=1` | 允许，表示 operator 已确认外部鉴权覆盖 `/admin/*` |
| 非 loopback + admin enabled + 未确认外部鉴权 | 启动失败 |

`AIWORKER_ADMIN_EXTERNAL_AUTH=1` 不是应用内鉴权开关，也不会保护 gateway `/ws` 或 worker `/api/worker/*`。它只是一个显式确认：公开入口已经在 AIWorker 之前被外部身份层挡住。公网 smoke 至少应验证未认证访问 `/admin/` 返回 `401` / `403`，或在禁用 admin 时返回 `404`。

---

## 形态一：裸跑（main path）

适合开发机、单机用户、CI 临时。无 docker、无公网、无 Caddy。

```sh
# 1. 装 CLI（Stage A 直接走源码 `bun apps/cli/src/aiworker.ts`，见 docs/cli.md；
#     Stage B / FEAT-027 完成后改为 `bun install -g @zonease/aiworker-cli`）。
bun install -g @zonease/aiworker-cli

# 2. 准备主密钥与共享密钥（写到 shell 启动脚本或 ~/.aiworker/.env）。
export AIWORKER_MASTER_KEY=$(openssl rand -hex 32)
export INTERNAL_SHARED_SECRET=$(openssl rand -base64 24)

# 3. 终端 A：拉起 gateway 前台（fleet.db 自动落 ~/.aiworker/fleet.db）。
aiworker gateway start --port 9218

# 4. 终端 B：拉起 worker 前台（HTTP :9217 + 同机注册到 gateway）。
aiworker init --soul developer # 首次：选择 Soul，mint identity + bootstrap token（输出一次）
aiworker serve --port 9217 --gateway ws://127.0.0.1:9218/ws

# 5. 终端 C：从 worker stdout 抓 wtk_... 后 pair。
aiworker pair --url ws://127.0.0.1:9218/ws \
              --worker-url http://127.0.0.1:9217 \
              --bootstrap-token wtk_xxxxxxxxxxxx \
              --display-name dev-1
aiworker fleet list
```

退出：Ctrl-C 双方进程即可。状态在 `~/.aiworker/` 下持久化，下次直接 `aiworker gateway start` + `aiworker serve` 重新拉起就好。

---

## 形态二：systemd 服务化（推荐 Linux 服务器）

适合 Linux 长跑、远程服务器、希望开机自启。

### 安装 unit

```sh
# 用户实例（默认；写到 ~/.config/systemd/user/aiworker-gateway.service）：
aiworker install systemd --user

# 系统实例（root；写到 /etc/systemd/system/aiworker-gateway.service）：
sudo aiworker install systemd --system

# 仅打印 unit 内容，不写盘 / 不 enable：
aiworker install systemd --dry-run

# 自定义输出路径（异常布局或 packaging 用）：
aiworker install systemd --out /tmp/aiworker-gateway.service --no-enable

# 高级：手动固定 ExecStart（一般不需要）：
aiworker install systemd --exec-start '/opt/aiworker/bin/aiworker gateway start'
```

`aiworker install systemd` 写完 unit 后默认会调 `systemctl daemon-reload + enable --now`；带 `--no-enable` 让运维手动 enable。`enable --now` 会启动未运行的服务，但不会让已运行服务自动重启进新的 unit；重装/升级时按命令输出在维护窗口执行 `systemctl [--user] restart aiworker-gateway`。完整 flag 列表见 [`docs/cli.md` § `aiworker install systemd`](./cli.md#aiworker-install-systemd-plan-016)。

### 首次 secrets

unit 使用 `EnvironmentFile` 注入 secret，避免把 secret 写进 unit 本体：

```sh
# 用户实例：
install -d -m 0700 ~/.config/aiworker
sh -c 'umask 077; printf "AIWORKER_MASTER_KEY=%s\nINTERNAL_SHARED_SECRET=%s\n" "$(openssl rand -hex 32)" "$(openssl rand -base64 24)" > ~/.config/aiworker/gateway.env'
chmod 600 ~/.config/aiworker/gateway.env

# 系统实例：
sudo install -d -m 0700 -o root -g root /etc/aiworker
sudo sh -c 'umask 077; printf "AIWORKER_MASTER_KEY=%s\nINTERNAL_SHARED_SECRET=%s\n" "$(openssl rand -hex 32)" "$(openssl rand -base64 24)" > /etc/aiworker/gateway.env'
sudo chown root:root /etc/aiworker/gateway.env
sudo chmod 600 /etc/aiworker/gateway.env
```

### 验证

```sh
# 用户实例：
systemctl --user status aiworker-gateway
journalctl --user -u aiworker-gateway -f

# 系统实例：
systemctl status aiworker-gateway
journalctl -u aiworker-gateway -f

# /health（无论哪种实例）：
curl -fsS http://127.0.0.1:9218/health
# => {"ok":true,"service":"aiworker-gateway","ts":...}
```

### 远程 PATH / 版本诊断

远程 `ssh` / `aissh exec` 通常是非交互 shell，不一定加载
`~/.bashrc`、`~/.profile` 或 bun 的 PATH 初始化。因此：

- `which aiworker` / `command -v aiworker` 只能说明当前远程 shell 的
  PATH，不能证明 systemd unit 实际运行的是哪个 binary。
- 不要为了查版本而打印 `/etc/aiworker/gateway.env`、`~/.aiworker/.env`、
  `systemctl show -p Environment ...` 等环境内容；这些路径可能包含
  `AIWORKER_MASTER_KEY` / `INTERNAL_SHARED_SECRET`。

安全的诊断方式是只读取 unit 的 `ExecStart`，再按 unit 实际命令查版本：

```sh
# 用户实例：
systemctl --user show aiworker-gateway --property=ExecStart --value

# 系统实例：
systemctl show aiworker-gateway --property=ExecStart --value
```

当前 main 分支的 unit 通常是直接执行 `.../.bun/bin/aiworker gateway start`。
这种形态可以只取 `path=` 并运行同一个 binary 的 `--version`：

```sh
# 用户实例：
unit_bin="$(systemctl --user show aiworker-gateway --property=ExecStart --value | sed -n 's/.*path=\([^ ;]*\).*/\1/p')"
test -n "$unit_bin" && "$unit_bin" --version

# 系统实例：
unit_bin="$(systemctl show aiworker-gateway --property=ExecStart --value | sed -n 's/.*path=\([^ ;]*\).*/\1/p')"
test -n "$unit_bin" && sudo "$unit_bin" --version
```

Portable `ExecStart` may render as `bun <aiworker.js> gateway start`
或 standalone `aiworker gateway start`。这时不要只运行 `path=` 的
`--version`，因为 `path=` 可能是 `bun` 本身；应以 `argv[]` 里的完整命令为
准，把末尾 `gateway start` 替换成 `--version`，或使用下面的稳定 symlink。

如果运维脚本需要一个稳定命令路径，建议把 AIWorker CLI 本身（不是 `bun`
解释器）显式 symlink 到 `/usr/local/bin/aiworker`，再用该绝对路径做远程
检查：

```sh
sudo ln -sfn /root/.bun/bin/aiworker /usr/local/bin/aiworker
/usr/local/bin/aiworker --version
```

升级 CLI 后重新跑一次 `aiworker install systemd ...` 或更新 symlink，确保
unit 与远程诊断看到的是同一个 AIWorker CLI。

### 注意

- unit 模板会从当前运行的 CLI 解析 `ExecStart`，不假设 `/root/.bun/bin/aiworker`。如果你确实要固定某个旧路径，用 `--exec-start` 显式指定完整命令。
- `--user` 形态的数据目录由 systemd `StateDirectory=aiworker` 管理，通常是 `~/.local/state/aiworker`；`--system` 形态是 `/var/lib/aiworker`。
- `--system` 形态需要明确知道在做什么——服务以 root 跑、数据写到 `/var/lib/aiworker`。新手优先 `--user`。
- worker 进程目前不提供 systemd 模板。常见做法：让 gateway 跑 systemd（长驻），worker 按需手工 `aiworker serve` 或走 docker fast-launch。

---

## 形态三：docker compose（可选 fast-launch）

> **如果你不需要 docker 隔离，跳过本节。**

适合：

- 一行命令试用 AIWorker，不想装 bun。
- 需要 `aiworker fleet launch` 自动拉起 per-worker 容器（必须叠加 supervisor overlay）。
- 多人共享主机、希望容器化进程边界。

镜像由 GitHub Actions 在 `.github/workflows/build-image.yml` 构建并发布到私有 GHCR `ghcr.io/zoneasetech/aiworker:<tag>`。本地 / 服务器**不**自行 build。

### 最小起步

```sh
# 1. 准备 .env（同公共前置；ops/compose/.env.example 是模板）。
cp ops/compose/.env.example ops/compose/.env
$EDITOR ops/compose/.env   # 至少填 AIWORKER_MASTER_KEY + INTERNAL_SHARED_SECRET + AIWORKER_IMAGE_TAG

# 2. docker login ghcr.io（私有镜像 pull 权限）。
echo "$GH_TOKEN" | docker login ghcr.io -u <user> --password-stdin

# 3. 拉镜像 + 起 gateway。
cd ops/compose
docker compose pull
docker compose up -d

# 4. /health。
curl -fsS http://127.0.0.1:9218/health
```

操作员侧的 pair / launch 流程同形态一、二（`aiworker pair` / `aiworker fleet launch`）。

### `scripts/deploy.ts`（可选远程 aissh 流程）

`scripts/deploy.ts` 是配套 docker 形态的远程部署脚本（aissh 驱动 GHCR pull）。**它是可选的**，不是主流程。只在你需要：

- 在指定 GitHub Actions runner 上触发 build 并发布镜像 tag；
- 把 compose / Caddyfile / .env 推到一台已有 docker 的 Linux 主机；
- 走 aissh approval 做受控部署；

时才需要。完整 run book + Cloudflare/Caddy 公网入口请见 [`deployment-public-https.md`](./deployment-public-https.md)。

`bun run scripts/deploy.ts --help` 列全部子命令。

### `aiworker fleet launch` 与 supervisor overlay

要让 gateway 自动拉起 worker 容器，必须叠加 `ops/compose/docker-compose.supervisor.yml`，并启用 `AIWORKER_GATEWAY_CAN_LAUNCH=true`。详细配方在 [`deployment-public-https.md` § `aiworker fleet launch` 与 supervisor overlay](./deployment-public-https.md#aim-workers-launch-与-supervisor-overlay)（与公网 SaaS 部署方式同源，因为 supervisor 通常只在远程服务器上启用；目标 anchor 仍沿用旧名 `aim-workers-launch-…` 以避免破坏历史链接）。

### Slim vs Full 镜像

每次 build 都会发 `<sha>`（slim，~150 MB，无预装 agentic CLI）与 `<sha>-full`（~320 MB，预装 claude-code / codex / gemini-cli / qwen-code / cursor-agent）两个 tag。详见 [`deployment-public-https.md` § Slim vs Full image (FEAT-020)](./deployment-public-https.md#slim-vs-full-image-feat-020)。

---

## 公网 HTTPS / channel webhook 暴露

Telegram / WhatsApp / Lark / LINE webhook 必须能从公网回调到 gateway 才能收消息。把这一层（Cloudflare orange-cloud + Caddy `:80 → 127.0.0.1:9218` 反代 + 公开域名）单独拆到 [`deployment-public-https.md`](./deployment-public-https.md)，按需叠加到形态二或形态三上。

> **如果你打算自己加 Caddy / nginx 反代到 gateway**：必须先读 [`deployment-public-https.md` § Caddy basic-auth setup (BUG-007)](./deployment-public-https.md#caddy-basic-auth-setup-bug-007)。Gateway 的 loopback authN 在反代后会失效——任何能 hit 反代的请求都会被识别为 loopback 通过认证。Caddy 必须自己叠 basic-auth / IP allowlist / Cloudflare Access 等手段。

形态一（裸跑）通常不需要公网入口——开发机用 `cloudflared tunnel` / `ngrok` / Tailscale Funnel 即可临时暴露。

---

## Worker 注册（pair）通用流程

PLAN-013 之后 dashboard REST 已下线，注册一个 worker 进 fleet 有四条路径：

1. **手动 pair**（任意形态都通用）：worker 首启时 stdout 打一次性 `AIWORKER_BOOTSTRAP_TOKEN=wtk_...`；操作员抓取后调
   ```sh
   aiworker pair --url ws://<gateway>:9218/ws \
                 --worker-url http://<worker-host>:9217 \
                 --bootstrap-token wtk_xxxxxxxxxxxx \
                 --display-name <name>
   ```
   > 此路径需要 gateway 能 HTTP 回拨 worker `/info`——worker 在 NAT/防火墙后会失败。
2. **自动 launch**（仅 docker 形态 + supervisor overlay）：`aiworker fleet launch --display-name foo`；gateway supervisor 拉容器、scrape stdout、自动 pair。
3. **自助 enroll**（PLAN-018 / FEAT-024）：worker outbound 拨 gateway `/ws`，第一帧 `connect` 携带 `enroll` 块（`joinToken` + `apiToken` + 可选 `displayName`）；gateway 验签后直接落 fleet.db。详见下文 § Worker self-enroll quick start。
4. **OTP-attended enroll**（PLAN-019 / FEAT-026）：worker outbound 拨 gateway `/enroll-ws`（**不**复用 self-enroll 的 `/ws`），第一帧 `connect.enroll.mode='otp'` 不带任何 fleet 凭证；gateway 给 worker 派一个 8 字符 OTP，operator 用 `aiworker enroll approve <otp>` 决定放行。worker 部署方完全不需要 fleet 共享密钥。详见下文 § Worker OTP-attended enroll quick start。

worker baseUrl 是 worker HTTP 根（scheme + host/port，无 path）：

| 拓扑 | 示例 baseUrl |
|------|--------------|
| 同机裸跑 | `http://127.0.0.1:9217` |
| 同 compose 网络 | `http://aiworker-worker:9217` |
| 跨主机直暴端口 | `http://<test-server-ip-redacted>:9217` |
| 跨主机 HTTPS 反代 | `https://worker-1.example.com` |

完整命令选项见 [`docs/cli.md`](./cli.md)。

---

## Worker self-enroll quick start（PLAN-018 / FEAT-024）

适用：worker 在 NAT/防火墙后只能 outbound、批量部署、无 operator 介入。

### 1. Gateway 侧开启 join token

`AIWORKER_JOIN_TOKEN` 是 fleet 级共享密钥（gateway env 校验 ≥ 16 字符），写到 gateway 进程环境（裸跑 / systemd `Environment=` / docker compose `.env`）：

```sh
# 生成一段 fleet 级共享密钥（≥ 16 字符；推荐 32 hex）。
openssl rand -hex 32
# 写到 gateway 启动环境（systemd / 裸跑 / compose 三选一）。
export AIWORKER_JOIN_TOKEN=<上面那串>
# 同时确保 gateway 已配置 AIWORKER_MASTER_KEY；缺它会拒所有 enroll
# (audit 写 master_key_missing，close 4401 auth:master_key_missing)。
```

未设 → self-enroll 完全禁用，所有带 `connect.enroll` 的 node 帧 close `4401 auth:join_token_disabled`，`gateway.connect.rejected` audit 留底。

### 2. Worker 侧入网启动项

```sh
aiworker init --soul developer
cat >> .aiworker/local/.env <<'EOF'
AIWORKER_GATEWAY_URL=ws://gateway-host:9218/ws
AIWORKER_JOIN_TOKEN=<同上 gateway 侧>
AIWORKER_DISPLAY_NAME=prod-1
EOF
```

project worker 推荐写 `<project>/.aiworker/local/.env`（chmod 0600，gitignored），这样同一主机多个 worker 不会共享 shell 级 `AIWORKER_GATEWAY_URL` / `AIWORKER_DISPLAY_NAME`。systemd / docker 仍可使用各自 unit / compose 的 `Environment=` 或 env file。若先用 shell `export` 启动一次，CLI bootstrap 会把上述 worker 入网启动项合并回当前 scope 的 `.env`。

只设 `AIWORKER_JOIN_TOKEN` 而无 `AIWORKER_GATEWAY_URL` → `aiworker serve` 启动时 `consola.warn` 跳过 self-enroll，**不**自动起 gateway-client。`--gateway` flag 与 env 三件套同时存在时，`--gateway` 显式覆盖（走原 operator-pull 路径）。

### 3. 拉起 worker

```sh
# 任何形态：裸跑、systemd、docker。
aiworker serve --port 9217
# 等价 systemd unit 片段：
# [Service]
# Environment=AIWORKER_MASTER_KEY=...
# Environment=AIWORKER_GATEWAY_URL=wss://aiw.example.com/ws
# Environment=AIWORKER_JOIN_TOKEN=<shared>
# Environment=AIWORKER_DISPLAY_NAME=prod-1
# ExecStart=/usr/local/bin/aiworker serve --port 9217
```

5 秒内从 gateway 侧 `aiworker fleet list` 应见到该 worker：`online: true`、`addedBy: 'self-enroll'`、`displayName` 与 env 一致。

### 4. 安全模型与运维

- **Join token 是 fleet 级共享**——任何持有它的进程都能以任意 `workerId` 入网。Mitigations：
  - `AIWORKER_MAX_WORKERS` 配额仍生效（已注册 workerId reconnect 不占配额，超额 → close `4401 auth:quota_exceeded` + audit `quota_exceeded`）；
  - 操作员 `aiworker fleet remove <id>` 立即吊销该 worker（fleet 行删除 + 在线连接踢下线）；
  - 旋转 token：改 gateway env 后重启 gateway——已自助入网的 worker 用既有 fleet 行 reconnect 不带 enroll 块、不受影响；新 worker / 重新带 enroll 的连接必须用新 token，否则 `4401 auth:join_token_mismatch`。
- **Worker 端 apiToken 仍由 worker 容器自身 mint**（不变量同手动 pair 路径）；enroll 块只是把这枚已 mint 的 apiToken 传给 gateway 做 fleet 行加密落库的输入，bootstrap stdout 行不再被任何 operator 抓取。
- **`displayName` 变更不旋转 apiToken**——同 workerId 重新带 enroll、`displayName` 不同：fleet 行只改名 + `lastSeenAt`，apiToken 密文保留；同名 reconnect 走 `unchanged` 路径，**不**写 `gateway.worker.enrolled` audit（仅 created / updated 才写，避免 reconnect 风暴）。
- **公网部署**：BUG-007 起 Caddy basic-auth 是必备一层，self-enroll 流量同样 `:80 → :9218` 经过 Caddy；worker 端 `AIWORKER_GATEWAY_URL` 必须按 `wss://operator:<pwd>@host/ws` 形式携带 basicauth。详见 [`deployment-public-https.md` § Caddy basic-auth setup (BUG-007)](./deployment-public-https.md#caddy-basic-auth-setup-bug-007)。

### 5. 常见排错

- `aiworker fleet list` 看不到 worker：worker 端 stderr 看 `consola.info [aiworker serve] self-enrolling to ...`，再去 gateway 端 fleet.db 的 `audit_events` 查 `gateway.connect.rejected` 行的 `detail.reason`。
- `auth:master_key_missing`：gateway 没设 `AIWORKER_MASTER_KEY`；任何路径下 fleet.db 加密都依赖它，必须配齐。
- `auth:quota_exceeded`：`AIWORKER_MAX_WORKERS` 已满；用 `aiworker fleet remove` 摘除旧 worker 或调高上限。

---

## Worker OTP-attended enroll quick start（PLAN-019 / FEAT-026）

适用：worker 部署方是客户 / 朋友 / CI runner 等不该持有 fleet 凭证的人；operator 希望对每次新 worker 入网保留一次"人审"机会，等同 GitHub Device Flow / `gh auth login`。

> 命令形态：本节示例统一用 `aiworker enroll …` 单二进制 form（PLAN-020 / FEAT-028 起）。Stage A 时直接跑 `bun apps/cli/src/aiworker.ts enroll …`，Stage B（FEAT-027 npm publish）后改成 `bun install -g @zonease/aiworker-cli && aiworker enroll …`。

self-enroll（path 3）虽然把 worker 端 inbound 端口需求消掉了，但 worker 部署方仍要持有 fleet 级共享 `AIWORKER_JOIN_TOKEN`——一旦泄露任何持有者都能以任意 workerId 入网；OTP 路径把这个 anti-pattern 一并消掉。

### 1. Gateway 侧只需 OTP TTL（可选，默认 300s）

OTP 路径不依赖任何 fleet 共享密钥；只要 gateway 已配 `AIWORKER_MASTER_KEY`（fleet.db apiToken 加密）即可工作。可选：

```sh
# 默认 300 秒（5 分钟）；范围 [30, 3600]。worker 从 connect 到 operator approve 的 hard deadline。
export AIWORKER_ENROLL_OTP_TTL_SEC=300
```

未配 `AIWORKER_MASTER_KEY` → operator approve 时 `master_key_missing`，submit 阶段不会拒（OTP 已派给 worker）；运维必须确保启动时已配齐。

### 2. Worker 侧入网启动项

```sh
aiworker init --soul developer
cat >> .aiworker/local/.env <<'EOF'
AIWORKER_GATEWAY_URL=ws://gateway-host:9218/ws
AIWORKER_DISPLAY_NAME=ben-laptop
# AIWORKER_JOIN_TOKEN 不设 → 自动落 OTP 模式；
# 若同时设了 JOIN_TOKEN 又想强制 OTP（attended）：
AIWORKER_ENROLL_MODE=otp
EOF
```

systemd / docker 形态继续把这些变量放在对应进程环境或 env file；裸跑 / project worker 优先放 `.aiworker/local/.env`，避免多 worker 场景串配置。

> `aiworker serve` 内部会把 `AIWORKER_GATEWAY_URL` 的 path 段强制改写为 `/enroll-ws`，无需 deployer 自己改。Path-split 由 Caddy 端完成（见下文 § Caddy `/enroll-ws` path split）。

`aiworker serve` 触发表（与 PLAN-019 §"Worker side" 一致；详见 [`docs/cli.md` § `aiworker serve`](./cli.md)）：

| `--gateway` flag | env URL | env JOIN_TOKEN | env ENROLL_MODE | 行为 |
|---|---|---|---|---|
| 设 | 任意 | 任意 | 任意 | legacy（operator-pull 后 deviceToken 已下发，flag 显式覆盖 env） |
| 未设 | 设 | 设 | ≠`otp` | self-enroll（path `/ws`，PLAN-018 不变） |
| 未设 | 设 | 未设 | 任意 | **OTP enroll**（path `/enroll-ws`，PLAN-019 新增） |
| 未设 | 设 | 设 | `otp` | **强制 OTP enroll**（忽略 JOIN_TOKEN） |
| 未设 | 未设 | — | — | 不连 gateway / consola.warn |

### 3. 拉起 worker（deployer 侧）

```sh
# 任何形态：裸跑 / systemd / docker。
aiworker serve --port 9217
```

stdout 第一时间会打方框形 OTP，附 expires-in 倒计时：

```text
[aiworker serve] OTP enrolling to ws://gateway-host:9218/enroll-ws; awaiting operator approval

┌──────────────────────────┐
│  OTP:  BX7P-K39M         │
│  expires in 300s         │
└──────────────────────────┘

[aiworker serve] OTP BX7P-K39M 已签发，请用 `aiworker enroll approve BX7P-K39M` 准入；expires in 300s
```

deployer 把这串 OTP 通过任意带外通道（语音 / 邮件 / IM）发给 operator 即可，**无须**给 deployer 任何 fleet 凭证。

### 4. Operator 流程（operator 侧）

```sh
# 列待批
aiworker enroll list
# {
#   "pending": [
#     { "otp": "BX7P-K39M", "workerId": "w_xxx", "displayName": "ben-laptop", "submittedAt": ..., "expiresAt": ... }
#   ]
# }

# 准入（worker 立即收到 enrollment.approved，fleet 行写 addedBy='otp'）
aiworker enroll approve BX7P-K39M
# ✔ 已批准 OTP BX7P-K39M，workerId=w_xxx
# { "workerId": "w_xxx", "deviceToken": "wtk_..." }

# 或拒绝（worker 收到 close 4403 enroll:rejected）
aiworker enroll reject BX7P-K39M
```

approve 后 worker 端会打 `[aiworker serve] approved as w_xxx; deviceToken=wtk_...，已加入 fleet`，并由 gateway 把它升级为 NodeRegistry 里的正式 node、广播 `worker.online`。后续 reconnect 走原 `/enroll-ws` ws（worker 自身缓存 `enrolledViaOtp=true`，client.ts 直接复用），不再触发 OTP 流。

### 5. 安全模型

- **Worker deployer 不持有任何 fleet 凭证**——`/enroll-ws` 端 Caddy 不挂 basicauth，OTP submit 在 operator approve 前不会落 fleet.db；任何 attacker 拿不到 OTP，从外部 spam 该 path 不会污染 fleet。
- **OTP 单次有效 + 短 TTL**：`AIWORKER_ENROLL_OTP_TTL_SEC` 默认 300 秒；过期由 setTimeout 触发 `gateway.enrollment.expired` audit + close 4408；approve / reject 走的 entry 立即从 pending Map 中删除。OTP 不可重放（in-memory，gateway 重启即丢；所有持久化都在 approve 时才发生）。
- **OTP 不进 audit 明文**：所有 audit detail 仅落 `sha256(otp).slice(0, 8)`（`gateway.enrollment.requested` / `.rejected` / `.abandoned` 都走这个路径，由 `apps/gateway/src/server.ts::hashOtpForAudit` 与 `apps/gateway/src/router/methods/enroll.ts::hashOtp` 实现）；明文 OTP 只在 worker stdout / `aiworker enroll list` 输出里出现。运维 fleet.db 拷贝出去后无法据此批准已过期 / 已 reject 的请求。
- **Path-aware 拒绝**：在 `/ws` 上发 `enroll.mode='otp'` → close 4400 `wrong_path:otp_must_use_enroll_ws`；在 `/enroll-ws` 上发 operator connect / 普通 node connect → close 4400 `wrong_path:expected_enroll_otp`。两条 close code 由 `apps/gateway/src/auth/token.ts::authorizeConnection` 集中产出。
- **`enroll.approve` 在 `/ws` operator 侧**——attacker 即使知道 OTP，也必须先穿透 Caddy basicauth 才能调 approve。无新攻击面 vs PLAN-018。
- **Pending state 重启即丢**：UX acceptable—worker 自动重连重新拿一个新 OTP。**不要**指望 OTP 跨 gateway 重启。
- **配额仍生效**：approve 时再查一次 `AIWORKER_MAX_WORKERS`（已注册 workerId 重批不占新配额）；超额 → `quota_exceeded`，pending entry 已被 pop，worker 端拿不到 approved 事件，需重新发起。

### 6. 排错

| close code / wire code | 含义 | 排查 |
|---|---|---|
| `4400 wrong_path:expected_enroll_otp` | 在 `/enroll-ws` 上发了非 OTP 帧（operator connect 或普通 node connect） | 检查 worker / operator 是否拨错 path；reconnect 后已批 worker 的端到端流应回到 `/enroll-ws` 但带 OTP=approved 后由 gateway 接管 |
| `4400 wrong_path:otp_must_use_enroll_ws` | 在 `/ws` 上发了 `enroll.mode='otp'` | worker 端 trigger table 走错分支；改 env 让 `aiworker serve` 重走 |
| `4401 auth:master_key_missing`（approve 阶段返回的 `master_key_missing`） | gateway 未配 `AIWORKER_MASTER_KEY` | 配齐主密钥后重启 gateway，让 worker 重新发起 |
| `4401 quota_exceeded`（approve 时） | 配额已满 | `aiworker fleet remove <id>` 摘除旧 worker 或调高 `AIWORKER_MAX_WORKERS` |
| `4403 enroll:rejected` | operator `aiworker enroll reject` | 部署方与 operator 沟通后再发起 |
| `4408 enroll:expired` | 超过 `AIWORKER_ENROLL_OTP_TTL_SEC`（默认 300s） | 部署方重新 `aiworker serve`，让 gateway 派新 OTP |
| `4500 enroll_unavailable` / `enroll_otp_send_failed` | gateway 内部异常（pending registry 未注入 / 推送 OTP 失败） | 看 gateway 日志，重启即可 |

`gateway.enrollment.requested` 写入即视为"OTP 派发成功"；后续 `.approved` / `.rejected` / `.expired` / `.abandoned` 是终态。任何漏掉这条 audit 的，都说明 connect 帧根本没到 gateway——先排 Caddy 反代和网络。

### 7. Caddy `/enroll-ws` path split

公网部署必须把 `/enroll-ws` 单独切出来，不挂 basic-auth，否则 deployer 还是要持有 operator 凭证就回到 self-enroll 的 anti-pattern。模板 `ops/caddy/Caddyfile.tmpl` 已落地：

```caddy
:80 {
  encode zstd gzip
  log { ... }

  handle /ws {
    import /etc/caddy/auth.snippet           # operator + 已配对 worker reconnect
    reverse_proxy 127.0.0.1:9218 { ... }
  }

  handle /enroll-ws {
    # PLAN-019 OTP-attended enrollment 通道，无 basicauth。
    # gateway 路径感知 authN 拒绝任何非 OTP connect 帧（4400 wrong_path）。
    reverse_proxy 127.0.0.1:9218 { ... }
  }

  handle /health { import /etc/caddy/auth.snippet; reverse_proxy 127.0.0.1:9218 }
  handle { respond 404 }
}
```

`auth.snippet` 仍由宿主提供（不入 git，缺失 → fail-closed，BUG-007 不变），只挂在 `/ws` 与 `/health` 上；`/enroll-ws` 在 trust boundary 上专门做 path-aware authN——攻击者即使能 hit 该路径，gateway 的 `authorizeConnection` 仍要求 connect 帧带 `enroll.mode='otp'`，不带就 close 4400 不留下 fleet 行，更不会 broadcast worker.online。

部署变更：宿主 `:80` 站点的 Caddyfile 替换为新模板后 `caddy reload` 即可；旧版本不存在该 path 段，所以**不能**直接 ssh 上去叠 patch——必须整体替换为新 template，由 `scripts/deploy.ts upload` + `reload-caddy` 完成。

---

## 备份清单

无论形态，备份都必须涵盖：

- **`AIWORKER_MASTER_KEY`** — 离线保管。丢失 = fleet 里所有 worker 的 token 全部失效，必须重新 `aiworker pair`。
- **fleet.db** — 裸跑默认在 `~/.aiworker/fleet.db`；systemd `--user` 默认在 `~/.local/state/aiworker/fleet.db`；systemd `--system` 在 `/var/lib/aiworker/fleet.db`；docker 在卷 `aiworker_fleet`（默认 `/var/lib/docker/volumes/aiworker_fleet/_data/fleet.db`）。
- **每个 worker 的 worker.db** — 裸跑默认在 `~/.aiworker/workers/<workerId>/worker.db`；systemd 跟随对应 `AIWORKER_HOME`；docker launch 形态在 `WORKER_DATA_ROOT/<workerId>/worker.db`。

---

## Troubleshooting

- **`aiworker` 报 `auth: shared_secret_mismatch`**：通常是从容器外部直连 gateway 的 `127.0.0.1`，但 Bun 看到的 `requestIP` 是 docker network 地址（不在 loopback 白名单）。解决：经 Caddy 反代（loopback）进入，或者显式 export `INTERNAL_SHARED_SECRET` 当 token。
- **`aiworker` 等响应超时**：`aiworker fleet list` 看 node 是否在线；若短时间内频繁断连，看 `fleet.db` 的 `audit_events` 里 `gateway.node.disconnected` 的 close code。
- **gateway `/health` 不通**：检查 gateway 进程是否真的起了；`AIWORKER_MASTER_KEY` 是否有效（解 fleet.db 失败会立即退出）。
- **systemd unit 启动失败**：`journalctl --user -u aiworker-gateway -e` 看错误；常见是 `gateway.env` 缺 `AIWORKER_MASTER_KEY` / `INTERNAL_SHARED_SECRET`、`ExecStart` 指向的 CLI 被卸载、或 state 目录权限异常。
- **docker 形态 verify 失败**：`docker logs aiworker-gateway --tail 200`。

公网 HTTPS / aissh / Caddy 相关问题见 [`deployment-public-https.md` § Troubleshooting](./deployment-public-https.md#troubleshooting)。

---

## 历史 deploy 记录

PLAN-013 之前的 dashboard 部署时间线在 `docs/task/FEAT-009.md` 的 "Deploy records" 表，作为历史存档保留。当前推荐部署形态以本文档（裸跑 / systemd）为主；GHCR + Cloudflare + aissh 流程化部署的具体配方见 [`deployment-public-https.md`](./deployment-public-https.md)。
