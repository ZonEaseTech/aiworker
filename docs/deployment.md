# AIWorker Deployment

把 AIWorker 跑起来有三种形态。本文档把"主路径"——开发与服务器单机用户应直接走裸跑或 systemd——放在最前面，docker compose 作为可选 fast-launch 段落收在末尾。

公网 HTTPS 反代（Cloudflare + Caddy + 公开域名 + GHCR 镜像 + `scripts/deploy.ts` aissh 流程化部署）已拆成独立 [`deployment-public-https.md`](./deployment-public-https.md)。**只有在你需要把 channel webhook（Telegram / WhatsApp / Lark / LINE）暴露到公网时才需要叠加它。**

---

## 三档形态对比

| 形态 | 适用场景 | 典型命令 | docker | 公网入口 |
|------|----------|----------|--------|----------|
| **裸跑** | 开发 / 调试 / 一次性试用 | `aim gateway start` / `aiw serve` 前台 | 无 | 无 |
| **systemd 服务化** | Linux 长跑 / 服务器 | `aim install systemd [--user\|--system]` | 无 | 可选叠加 deployment-public-https |
| docker compose | 懒人快速试用 / 多 worker 容器隔离 | `docker compose up -d`（`ops/compose/`） | 有 | 必要时叠加 deployment-public-https |

> **默认就选裸跑或 systemd。** docker compose 路径的存在意义只剩两个：(1) 不愿装 bun 时一行命令试用，(2) 需要 `aim workers launch` 自动拉起 per-worker 隔离容器（必须叠 supervisor overlay）。两者都不要求公网暴露。

---

## 公共前置

无论选哪一档都需要：

- [`bun`](https://bun.sh) ≥ 1.1（裸跑 / systemd 必备；docker 形态由镜像内置）。
- 一段 64 字符 hex 的 `AIWORKER_MASTER_KEY`：`openssl rand -hex 32`。**部署前务必离线备份**——丢失 = fleet.db 里所有 `registered_workers.apiTokenEnc` 无法解密，所有 worker 都要重新 `aim pair`。
- 一段 ≥ 16 字符的 `INTERNAL_SHARED_SECRET`：`openssl rand -base64 24`。远程 operator 的 bearer，loopback 自动放行。

约定 `~/.aiworker/` 为运行时主目录（`AIWORKER_HOME` 可改）。fleet.db 默认落到这里；worker.db 落到每个 worker 自己的 `~/.aiworker/workers/<workerId>/worker.db`。完整文件布局见 [`architecture.md` § Filesystem source of truth](./architecture.md#filesystem-source-of-truth-plan-012)。

---

## 形态一：裸跑（main path）

适合开发机、单机用户、CI 临时。无 docker、无公网、无 Caddy。

```sh
# 1. 装 CLI（开发期直接走源码也行，见 docs/cli.md）。
bun install -g @aiworker/cli

# 2. 准备主密钥与共享密钥（写到 shell 启动脚本或 ~/.aiworker/.env）。
export AIWORKER_MASTER_KEY=$(openssl rand -hex 32)
export INTERNAL_SHARED_SECRET=$(openssl rand -base64 24)

# 3. 终端 A：拉起 gateway 前台（fleet.db 自动落 ~/.aiworker/fleet.db）。
aim gateway start --port 3000

# 4. 终端 B：拉起 worker 前台（HTTP :3001 + 同机注册到 gateway）。
aiw init                 # 首次：mint identity + bootstrap token（输出一次）
aiw serve --port 3001 --gateway ws://127.0.0.1:3000/ws

# 5. 终端 C：从 worker stdout 抓 wtk_... 后 pair。
aim pair --url ws://127.0.0.1:3000/ws \
         --worker-url http://127.0.0.1:3001 \
         --bootstrap-token wtk_xxxxxxxxxxxx \
         --display-name dev-1
aim workers list
```

退出：Ctrl-C 双方进程即可。状态在 `~/.aiworker/` 下持久化，下次直接 `aim gateway start` + `aiw serve` 重新拉起就好。

---

## 形态二：systemd 服务化（推荐 Linux 服务器）

适合 Linux 长跑、远程服务器、希望开机自启。

### 安装 unit

```sh
# 用户实例（默认；写到 ~/.config/systemd/user/aiworker-gateway.service）：
aim install systemd --user

# 系统实例（root；写到 /etc/systemd/system/aiworker-gateway.service）：
sudo aim install systemd --system

# 仅打印 unit 内容，不写盘 / 不 enable：
aim install systemd --dry-run

# 自定义输出路径（异常布局或 packaging 用）：
aim install systemd --out /tmp/aiworker-gateway.service --no-enable
```

`aim install systemd` 写完 unit 后默认会调 `systemctl daemon-reload + enable --now`；带 `--no-enable` 让运维手动 enable。完整 flag 列表见 [`docs/cli.md` § `aim install`](./cli.md#aim-install-systemd)。

### 验证

```sh
# 用户实例：
systemctl --user status aiworker-gateway
journalctl --user -u aiworker-gateway -f

# 系统实例：
systemctl status aiworker-gateway
journalctl -u aiworker-gateway -f

# /health（无论哪种实例）：
curl -fsS http://127.0.0.1:3000/health
# => {"ok":true,"service":"aiworker-gateway","ts":...}
```

### 注意

- unit 模板里的 `ExecStart` 假设 `aim` 已位于 `~/.bun/bin/aim`（`bun install -g` 默认路径）。binary 形态（PLAN-017+）一旦发布，`aim install systemd` 会改写为绝对路径。
- `--system` 形态需要明确知道在做什么——服务以 root 跑、数据写到 root home（除非自定义 `Environment=AIWORKER_HOME=...`）。新手优先 `--user`。
- worker 进程目前不提供 systemd 模板。常见做法：让 gateway 跑 systemd（长驻），worker 按需手工 `aiw serve` 或走 docker fast-launch。

---

## 形态三：docker compose（可选 fast-launch）

> **如果你不需要 docker 隔离，跳过本节。**

适合：

- 一行命令试用 AIWorker，不想装 bun。
- 需要 `aim workers launch` 自动拉起 per-worker 容器（必须叠加 supervisor overlay）。
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
curl -fsS http://127.0.0.1:3000/health
```

操作员侧的 pair / launch 流程同形态一、二（`aim pair` / `aim workers launch`）。

### `scripts/deploy.ts`（可选远程 aissh 流程）

`scripts/deploy.ts` 是配套 docker 形态的远程部署脚本（aissh 驱动 GHCR pull）。**它是可选的**，不是主流程。只在你需要：

- 在指定 GitHub Actions runner 上触发 build 并发布镜像 tag；
- 把 compose / Caddyfile / .env 推到一台已有 docker 的 Linux 主机；
- 走 aissh approval 做受控部署；

时才需要。完整 run book + Cloudflare/Caddy 公网入口请见 [`deployment-public-https.md`](./deployment-public-https.md)。

`bun run scripts/deploy.ts --help` 列全部子命令。

### `aim workers launch` 与 supervisor overlay

要让 gateway 自动拉起 worker 容器，必须叠加 `ops/compose/docker-compose.supervisor.yml`，并启用 `AIWORKER_GATEWAY_CAN_LAUNCH=true`。详细配方在 [`deployment-public-https.md` § `aim workers launch` 与 supervisor overlay](./deployment-public-https.md#aim-workers-launch-与-supervisor-overlay)（与公网 SaaS 部署方式同源，因为 supervisor 通常只在远程服务器上启用）。

### Slim vs Full 镜像

每次 build 都会发 `<sha>`（slim，~150 MB，无预装 agentic CLI）与 `<sha>-full`（~320 MB，预装 claude-code / codex / gemini-cli / qwen-code / cursor-agent）两个 tag。详见 [`deployment-public-https.md` § Slim vs Full image (FEAT-020)](./deployment-public-https.md#slim-vs-full-image-feat-020)。

---

## 公网 HTTPS / channel webhook 暴露

Telegram / WhatsApp / Lark / LINE webhook 必须能从公网回调到 gateway 才能收消息。把这一层（Cloudflare orange-cloud + Caddy `:80 → 127.0.0.1:3000` 反代 + 公开域名）单独拆到 [`deployment-public-https.md`](./deployment-public-https.md)，按需叠加到形态二或形态三上。

> **如果你打算自己加 Caddy / nginx 反代到 gateway**：必须先读 [`deployment-public-https.md` § Caddy basic-auth setup (BUG-007)](./deployment-public-https.md#caddy-basic-auth-setup-bug-007)。Gateway 的 loopback authN 在反代后会失效——任何能 hit 反代的请求都会被识别为 loopback 通过认证。Caddy 必须自己叠 basic-auth / IP allowlist / Cloudflare Access 等手段。

形态一（裸跑）通常不需要公网入口——开发机用 `cloudflared tunnel` / `ngrok` / Tailscale Funnel 即可临时暴露。

---

## Worker 注册（pair）通用流程

PLAN-013 之后 dashboard REST 已下线，注册一个 worker 进 fleet 有三条路径：

1. **手动 pair**（任意形态都通用）：worker 首启时 stdout 打一次性 `AIWORKER_BOOTSTRAP_TOKEN=wtk_...`；操作员抓取后调
   ```sh
   aim pair --url ws://<gateway>:3000/ws \
            --worker-url http://<worker-host>:3001 \
            --bootstrap-token wtk_xxxxxxxxxxxx \
            --display-name <name>
   ```
   > 此路径需要 gateway 能 HTTP 回拨 worker `/info`——worker 在 NAT/防火墙后会失败。
2. **自动 launch**（仅 docker 形态 + supervisor overlay）：`aim workers launch --display-name foo`；gateway supervisor 拉容器、scrape stdout、自动 pair。
3. **自助 enroll**（PLAN-018 / FEAT-024）：worker outbound 拨 gateway，第一帧 `connect` 携带 `enroll` 块（`joinToken` + `apiToken` + 可选 `displayName`）；gateway 验签后直接落 fleet.db。详见下文 § Worker self-enroll quick start。

worker baseUrl 是 worker HTTP 根（scheme + host/port，无 path）：

| 拓扑 | 示例 baseUrl |
|------|--------------|
| 同机裸跑 | `http://127.0.0.1:3001` |
| 同 compose 网络 | `http://aiworker-worker:3001` |
| 跨主机直暴端口 | `http://<test-server-ip-redacted>:3001` |
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

### 2. Worker 侧三件套 env

```sh
AIWORKER_GATEWAY_URL=ws://gateway-host:3000/ws        # 或 wss://...
AIWORKER_JOIN_TOKEN=<同上 gateway 侧>
AIWORKER_DISPLAY_NAME=prod-1                          # 可选；缺省回落 workerId
```

只设 `AIWORKER_JOIN_TOKEN` 而无 `AIWORKER_GATEWAY_URL` → `aiw serve` 启动时 `consola.warn` 跳过 self-enroll，**不**自动起 gateway-client。`--gateway` flag 与 env 三件套同时存在时，`--gateway` 显式覆盖（走原 operator-pull 路径）。

### 3. 拉起 worker

```sh
# 任何形态：裸跑、systemd、docker。
aiw serve --port 3001
# 等价 systemd unit 片段：
# [Service]
# Environment=AIWORKER_MASTER_KEY=...
# Environment=AIWORKER_GATEWAY_URL=wss://aiw.example.com/ws
# Environment=AIWORKER_JOIN_TOKEN=<shared>
# Environment=AIWORKER_DISPLAY_NAME=prod-1
# ExecStart=/usr/local/bin/aiw serve --port 3001
```

5 秒内从 gateway 侧 `aim workers list` 应见到该 worker：`online: true`、`addedBy: 'self-enroll'`、`displayName` 与 env 一致。

### 4. 安全模型与运维

- **Join token 是 fleet 级共享**——任何持有它的进程都能以任意 `workerId` 入网。Mitigations：
  - `AIWORKER_MAX_WORKERS` 配额仍生效（已注册 workerId reconnect 不占配额，超额 → close `4401 auth:quota_exceeded` + audit `quota_exceeded`）；
  - 操作员 `aim workers remove <id>` 立即吊销该 worker（fleet 行删除 + 在线连接踢下线）；
  - 旋转 token：改 gateway env 后重启 gateway——已自助入网的 worker 用既有 fleet 行 reconnect 不带 enroll 块、不受影响；新 worker / 重新带 enroll 的连接必须用新 token，否则 `4401 auth:join_token_mismatch`。
- **Worker 端 apiToken 仍由 worker 容器自身 mint**（不变量同手动 pair 路径）；enroll 块只是把这枚已 mint 的 apiToken 传给 gateway 做 fleet 行加密落库的输入，bootstrap stdout 行不再被任何 operator 抓取。
- **`displayName` 变更不旋转 apiToken**——同 workerId 重新带 enroll、`displayName` 不同：fleet 行只改名 + `lastSeenAt`，apiToken 密文保留；同名 reconnect 走 `unchanged` 路径，**不**写 `gateway.worker.enrolled` audit（仅 created / updated 才写，避免 reconnect 风暴）。
- **公网部署**：BUG-007 起 Caddy basic-auth 是必备一层，self-enroll 流量同样 `:80 → :3000` 经过 Caddy；worker 端 `AIWORKER_GATEWAY_URL` 必须按 `wss://operator:<pwd>@host/ws` 形式携带 basicauth。详见 [`deployment-public-https.md` § Caddy basic-auth setup (BUG-007)](./deployment-public-https.md#caddy-basic-auth-setup-bug-007)。

### 5. 常见排错

- `aim workers list` 看不到 worker：worker 端 stderr 看 `consola.info [aiw serve] self-enrolling to ...`，再去 gateway 端 fleet.db 的 `audit_events` 查 `gateway.connect.rejected` 行的 `detail.reason`。
- `auth:master_key_missing`：gateway 没设 `AIWORKER_MASTER_KEY`；任何路径下 fleet.db 加密都依赖它，必须配齐。
- `auth:quota_exceeded`：`AIWORKER_MAX_WORKERS` 已满；用 `aim workers remove` 摘除旧 worker 或调高上限。

---

## 备份清单

无论形态，备份都必须涵盖：

- **`AIWORKER_MASTER_KEY`** — 离线保管。丢失 = fleet 里所有 worker 的 token 全部失效，必须重新 `aim pair`。
- **fleet.db** — 裸跑/systemd 在 `~/.aiworker/fleet.db`；docker 在卷 `aiworker_fleet`（默认 `/var/lib/docker/volumes/aiworker_fleet/_data/fleet.db`）。
- **每个 worker 的 worker.db** — 裸跑/systemd 在 `~/.aiworker/workers/<workerId>/worker.db`；docker launch 形态在 `WORKER_DATA_ROOT/<workerId>/worker.db`。

---

## Troubleshooting

- **`aim` 报 `auth: shared_secret_mismatch`**：通常是从容器外部直连 gateway 的 `127.0.0.1`，但 Bun 看到的 `requestIP` 是 docker network 地址（不在 loopback 白名单）。解决：经 Caddy 反代（loopback）进入，或者显式 export `INTERNAL_SHARED_SECRET` 当 token。
- **`aim` 等响应超时**：`aim workers list` 看 node 是否在线；若短时间内频繁断连，看 `fleet.db` 的 `audit_events` 里 `gateway.node.disconnected` 的 close code。
- **gateway `/health` 不通**：检查 gateway 进程是否真的起了；`AIWORKER_MASTER_KEY` 是否有效（解 fleet.db 失败会立即退出）。
- **systemd unit 启动失败**：`journalctl --user -u aiworker-gateway -e` 看错误；常见是 `aim` 不在 `$PATH`（unit `Environment=PATH=...` 缺）或 `~/.aiworker/` 权限错。
- **docker 形态 verify 失败**：`docker logs aiworker-gateway --tail 200`。

公网 HTTPS / aissh / Caddy 相关问题见 [`deployment-public-https.md` § Troubleshooting](./deployment-public-https.md#troubleshooting)。

---

## 历史 deploy 记录

PLAN-013 之前的 dashboard 部署时间线在 `docs/task/FEAT-009.md` 的 "Deploy records" 表，作为历史存档保留。当前推荐部署形态以本文档（裸跑 / systemd）为主；GHCR + Cloudflare + aissh 流程化部署的具体配方见 [`deployment-public-https.md`](./deployment-public-https.md)。
