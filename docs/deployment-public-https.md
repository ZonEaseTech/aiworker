# AIWorker — 公网 HTTPS 暴露（可选）

> **本文档仅在你需要把 channel webhook（Telegram / WhatsApp / Lark / LINE）回调到 gateway 时才需要。**
>
> 默认部署路径（裸跑 / systemd / docker compose 三档）请见 [`deployment.md`](./deployment.md)。本文档是它的可选叠加层，承载历史的 SaaS 形态部署 run book，以及当前测试机 `gateway.example.test` 的具体配方。

---

## 何时需要本文档

- 需要 Telegram / WhatsApp / Lark / LINE / Twilio 等 channel 把消息 webhook 回调到 gateway —— webhook 必须从公网可达。
- 远程多人协作运维，希望一个域名同时给 `aim` CLI 与浏览器 web SPA 用。
- 希望走 GitHub Actions 镜像 + `scripts/deploy.ts` aissh 流程化部署到一台 Linux 主机。

如果只是单机开发或者纯本机 / 内网使用，**不需要本文档**——`aim gateway start` 前台 / `aim install systemd --user` 已经够用。需要把开发机临时暴露公网时，建议 `cloudflared tunnel` / `ngrok` / Tailscale Funnel 等更轻的方案，不需要叠这一整套。

---

## 拓扑

当前测试机配方：

```text
Cloudflare（orange-cloud, TLS 终止）
        │   https://gateway.example.test
        │   回源 http :80
        ▼
Caddy :80（纯反代）  ──►  127.0.0.1:9218  =  aiworker-gateway 容器
                                             │
                                             │ WS /ws
                                             ├─◄ operator：aim CLI + web
                                             │
                                             ├─► node：aiworker-worker-* 容器
                                             │     （同镜像，command: bun run dist/index.js）
                                             │     可选 `--gateway ws://gateway:9218/ws`
                                             │
                                             ├─ fleet.db（volume aiworker_fleet）
                                             └─（可选）docker.sock:ro + WORKER_DATA_ROOT
                                                 → FleetSupervisor：workers.launch
```

- **gateway 容器**是控制面入口（Bun.serve WS）。`/ws` 承接升级，`/health` 返回 JSON 心跳。
- 浏览器与 `aim` CLI 都走同一个 `/ws` 路径。
- TLS 在 Cloudflare 终止，回源 HTTP `:80`；Caddy 是纯 `:80 → 127.0.0.1:9218` 反代，`flush_interval -1` + `read_timeout 0` 保证 WebSocket 不被切流。

> 你可以把 Cloudflare 换成 Cloudflare Zero Trust / Tailscale Funnel / 自家 ALB，把 Caddy 换成 nginx / Traefik——只要终结 TLS 后能把 WebSocket 透到 `127.0.0.1:9218` 即可。

---

## 当前测试机

- aissh server id：`<aissh-server-id-redacted>`（hostname `aiwork`，IP `<test-server-ip-redacted>`）。覆盖：`AIWORK_SERVER_ID` 环境变量或 `--server=<id>`。
- 公网入口：`https://gateway.example.test`。
- 主机 OS：Ubuntu 24.04，≥ 25 GB 磁盘。

---

## Prerequisites

本地工作站：

- `bun`（与开发同版本）
- `aissh` CLI 已认证（`aissh status` 应成功）
- `gh` CLI 登录，携带 `workflow` + `write:packages` scope（用于触发 build workflow 并给宿主写 GHCR 凭证）
- `git`（用于派生默认镜像 tag）

目标宿主（初次部署时跑一次）：

- Ubuntu 24.04，≥ 25 GB 磁盘，docker + `docker compose` 插件
- Caddy v2 作为系统服务（`systemctl status caddy`），`/var/log/caddy/aiw.access.log` 属于 `caddy` 用户
- 目录 `/opt/aiworker-deploy/` 属 root，内含填好的 `.env`
- `/root/.docker/config.json` 有 GHCR 凭证——`scripts/deploy.ts login-ghcr` 自动写入（复用本机 `gh auth token`）

---

## Required host-local `.env`

把 `ops/compose/.env.example` 复制到宿主的 `/opt/aiworker-deploy/.env`，在跑 `install` **之前**填好：

- `AIWORKER_MASTER_KEY` — 32-byte hex（`openssl rand -hex 32`）。**部署前务必备份到组织级 secret store**。丢失 = gateway 里所有 `registered_workers.apiTokenEnc` 无法解密，所有 worker 都要重新 `aim pair`。
- `INTERNAL_SHARED_SECRET` — ≥ 16 字符（`openssl rand -base64 24`）。gateway 对远程 operator 的 bearer，也是 `workers.launch` 时注入子容器的共享密钥。
- `AIWORKER_IMAGE_TAG` — 上一次 known-good tag（`ghcr.io/zoneasetech/aiworker:<tag>`）。脚本 `install` 会 inline override 这个变量；宿主 `.env` 的值只在手动 `docker compose up -d` 时作为 fallback（例如重启恢复）。
- `AIWORKER_IMAGE_VARIANT_SUFFIX` — 空串（默认 slim）或 `-full`（FEAT-020 image variant）。
- `AIWORKER_GATEWAY_CAN_LAUNCH` 以及下面一组 supervisor env：只有叠加 `docker-compose.supervisor.yml` overlay 时才需要。

`scripts/deploy.ts install` 在文件或前两个 required secret 缺失时会拒绝执行。

---

## Compose topology（现状）

`ops/compose/docker-compose.yml` 定义了一个 service `gateway`（容器名 `aiworker-gateway`）：

- 镜像：`ghcr.io/zoneasetech/aiworker:${AIWORKER_IMAGE_TAG}${AIWORKER_IMAGE_VARIANT_SUFFIX}`
- 启动命令：`bun apps/gateway/src/index.ts`（覆盖 Dockerfile 默认 `bun run dist/index.js` 的 worker 入口）
- 端口：`127.0.0.1:9218:9218`（WS + `/health` 都走这个）
- 关键 env：`AIWORKER_GATEWAY_HOST=0.0.0.0` / `AIWORKER_GATEWAY_PORT=9218` / `AIWORKER_FLEET_DB_PATH=/var/lib/aiworker/fleet.db` / `AIWORKER_MASTER_KEY` / `INTERNAL_SHARED_SECRET`。如果用 `aiworker gateway start` 并默认挂载 `/admin/*`，还需要在 Caddy / Access / allowlist 生效后设置 `AIWORKER_ADMIN_EXTERNAL_AUTH=1`；当前 compose 直接跑 gateway 源码且不挂 admin bundle，不需要该确认。
- 卷：`aiworker_fleet:/var/lib/aiworker`（fleet.db 持久化）

Dockerfile 单镜像两种入口（见 `Dockerfile` 顶部注释）：

- **gateway**（控制面）：compose 显式设置 `command: ['bun', 'apps/gateway/src/index.ts']`，监听 9218/tcp（WS，FEAT-030）。
- **worker**（数据面）：`ENTRYPOINT ["/usr/bin/tini", "--", "bun", "run", "dist/index.js"]`（镜像默认），监听 9217/tcp（HTTP，FEAT-030）；由 `aim workers launch` 或独立的 worker compose 拉起。

Caddy（`ops/caddy/Caddyfile.tmpl`）反代 `:80 → 127.0.0.1:9218`，TLS 由 Cloudflare 橙云代理终止。`flush_interval -1` + `read_timeout 0` 保证 WebSocket 不被切流。**自 BUG-007 起 Caddy 必须叠 basic-auth（fail-closed）**——见下文 §"Caddy basic-auth setup（BUG-007）"。

---

## First-time deploy

在工作站的干净 checkout 里按顺序跑：

```sh
# 1. 给宿主装 docker，触发 aissh approval。
bun run scripts/deploy.ts install-docker

# 2. 把 GHCR 凭证写进 /root/.docker/config.json。
bun run scripts/deploy.ts login-ghcr

# 3. dry-run 看脚本将要干什么。
bun run scripts/deploy.ts deploy --dry-run

# 4. 触发 build workflow → 上传 compose/Caddyfile/.env → compose pull + up -d →
#    校验 /health → 重载 Caddy。
bun run scripts/deploy.ts deploy

# 5. 只有在 /health 通过后才拆旧运行时（若有）。IRREVERSIBLE，必须 --confirm。
bun run scripts/deploy.ts teardown-legacy --confirm
```

步骤 4 成功后，编辑宿主 `/opt/aiworker-deploy/.env` 把 `AIWORKER_IMAGE_TAG` 改成脚本打印的 tag，这样之后宿主 `systemctl` 重启 / `docker compose up -d` 时也能拿到正确镜像。

---

## Routine deploy

```sh
bun run scripts/deploy.ts deploy
```

等价于：

1. **build** — `gh workflow run build-image.yml --ref main -f tag=<tag>` + `gh run watch` 直到 exit 0。workflow 产出 `ghcr.io/zoneasetech/aiworker:<tag>`（外加 `:latest`）。
2. **upload** — `aissh file upload` 把 `docker-compose.yml` / `Caddyfile.tmpl` / `.env` 传到 `/opt/aiworker-deploy/`（每个显式指定目标文件名；aissh sftp PUT 拒绝 trailing-slash 目标）。
3. **install** — `aissh exec` 在宿主跑 `AIWORKER_IMAGE_TAG=<tag> AIWORKER_IMAGE_VARIANT_SUFFIX=<suffix> docker compose --env-file .env pull && up -d`。
4. **verify** — `curl -fsS http://127.0.0.1:9218/health` 期望 HTTP 200，body 含 `"ok":true`。PLAN-013 的 gateway `/health` 返回 `{"ok":true,"service":"aiworker-gateway","ts":...}`。
5. **reload-caddy** — `caddy validate` + `systemctl reload caddy`。

可加 `--tag=<tag>` 固定 tag；默认 `<git-sha>-<UTC yyyymmddhhmm>`。

---

## 部署后 smoke

```sh
# 1) /health 直连：
curl -sf http://127.0.0.1:9218/health
# => {"ok":true,"service":"aiworker-gateway","ts":...}

# 2) 公网：
curl -sf https://gateway.example.test/health
# => 同上（Cloudflare → Caddy → gateway）

# 3) 操作员登录 gateway + pair 一个测试 worker：
export AIWORKER_MASTER_KEY=$(grep ^AIWORKER_MASTER_KEY= /opt/aiworker-deploy/.env | cut -d= -f2)
# 本机 loopback 放行空 token，可以直接跑：
bun apps/cli/src/aim.ts workers list   # {"workers":[]}

# 4) 若开启 launch：
bun apps/cli/src/aim.ts workers launch --display-name smoke
bun apps/cli/src/aim.ts workers list
bun apps/cli/src/aim.ts workers remove <workerId>
```

远程（非 loopback）操作员需在连接时携带 `INTERNAL_SHARED_SECRET` 作为 bearer。

> **重要（BUG-007）**：浏览器 / aim CLI 经 Caddy 反代时，gateway 看到的 `requestIP()` 是 `127.0.0.1`——会被识别为 loopback **绕过 token 校验**。这意味着仅靠 gateway authN，**任何能 hit Caddy :80 的流量都自动通过**。Cloudflare 橙云只做 TLS 终止，**不是 authN 层**。
>
> 因此，公网 Caddy **必须叠一层 basic-auth**（或 Cloudflare Access / Zero Trust / IP allowlist 等等效手段）。BUG-007 修复后 `Caddyfile.tmpl` 用 `import auth.snippet` 强制要求宿主侧准备 basicauth 段；snippet 缺失时 Caddy 拒启动（**fail-closed**），杜绝意外裸跑。

### Caddy basic-auth setup（BUG-007）

首次启用或 BUG-007 之前已部署的宿主，按下面步骤补 snippet。

```sh
# 1) 工作站上生成 bcrypt hash（不含明文落盘）：
caddy hash-password --plaintext '<your-strong-secret>'
# → $2a$14$abcdef...（复制下来，下面要贴到宿主）

# 2) ssh 上宿主创建 snippet（不入 git）：
sudo tee /etc/caddy/auth.snippet >/dev/null <<EOF
basicauth {
  operator $2a$14$abcdef...
}
EOF
sudo chown caddy:caddy /etc/caddy/auth.snippet
sudo chmod 0640 /etc/caddy/auth.snippet

# 3) reload Caddy（脚本会先 caddy validate）：
bun run scripts/deploy.ts reload-caddy

# 4) 公网验证（未认证应得 401，包含 /admin/）：
curl -i https://gateway.example.test/health
# → HTTP/2 401, WWW-Authenticate: Basic realm="restricted"
curl -i https://gateway.example.test/admin/
# → HTTP/2 401, WWW-Authenticate: Basic realm="restricted"

# 5) 带凭证再试（应得 200）：
curl -i -u operator:'<your-strong-secret>' https://gateway.example.test/health
# → HTTP/2 200, body {"ok":true,...}
```

凭证分发给操作员；aim CLI 走公网时把凭证 / `INTERNAL_SHARED_SECRET` 都带上：

```sh
# aim 通过 wss URL form 携带 basicauth 凭证：
aim ... --url 'wss://operator:<your-strong-secret>@gateway.example.test/ws'
```

> 浏览器 / web SPA 的 basicauth 兼容性较差（modern Chromium 对 `wss://user:pass@host/...` URL 限制趋严）；如果运维需要长期 web 控制台访问，建议改用 Cloudflare Access（前端 SSO）或 IP allowlist 替代。本 BUG-007 的目标是**关闭裸开口**；web SPA 的人因身份层后续按需扩展。

凭证轮换：直接覆盖 `/etc/caddy/auth.snippet` + `systemctl reload caddy` 即可；fleet.db / worker token 都不受影响。

---

## Rollback

列出可选 tag：

```sh
gh api /orgs/zoneasetech/packages/container/aiworker/versions | jq '.[].metadata.container.tags[]?' | head
# 或在宿主：
aissh exec <server> 'docker image ls ghcr.io/zoneasetech/aiworker'
```

回滚：

```sh
bun run scripts/deploy.ts install --tag=<previous-tag>
bun run scripts/deploy.ts verify
```

若先前镜像在宿主仍有缓存，`install` 近乎即时。回滚验证通过后把 `AIWORKER_IMAGE_TAG` 同步写回宿主 `.env`。

---

## Slim vs Full image (FEAT-020)

每次 `build-image` workflow 都会给 `ghcr.io/zoneasetech/aiworker` 发布两个 tag：

| Tag | Size | 内容 |
|---|---|---|
| `<sha>`（slim，默认） | ~150 MB | 不打包任何 agentic CLI。worker 首次调用时走 `npx -y ...` fallback（30–60 秒冷启动）。 |
| `<sha>-full` | ~320 MB | slim + `@anthropic-ai/claude-code` / `@openai/codex` / `@google/gemini-cli` / `@qwen-code/qwen-code` 按 `DEFAULT_*_CLI_VERSION` 钉版本 `npm install -g`；外加 `cursor-agent`（官方 curl 脚本安装，`/usr/local/bin/cursor-agent` 软链）。每个 CLI 的 `--version` 是构建期 sanity gate。 |

按 deploy 选：

```bash
# 默认 slim。
bun scripts/deploy.ts deploy --tag=$TAG

# Full（避免首轮 npx 冷启动）。
bun scripts/deploy.ts deploy --tag=$TAG --image-variant=full
```

不重新 build 也可切换：改宿主 `.env` 的 `AIWORKER_IMAGE_VARIANT_SUFFIX=`（slim）或 `=-full`，再跑 `scripts/deploy.ts install --tag=<same tag>`。

**Auth 文件永远不打进镜像**——预装 CLI 只省 binary fetch，首次 login 仍在容器 runtime（`docker exec claude login` 或 host auth dir mount）。每个 engine 的 login 路径和 mount 配方见 `docs/executor-engines.md`。

---

## Worker 注册（公网形态特有部分）

通用 pair 流程见 [`deployment.md` § Worker 注册](./deployment.md#worker-注册pair通用流程)。本节仅覆盖跨主机 / 跨 compose 网络的拓扑差异。

### 手动 pair（跨主机）

1. Worker 容器首启（`aiw init` / `aiw serve --gateway ...`）在 stdout 打一次性 `AIWORKER_BOOTSTRAP_TOKEN=wtk_...`。
2. `docker logs <worker-container>` 抓取这一行。
3. 在运维工作站：
   ```sh
   aim pair \
     --url ws://127.0.0.1:9218/ws \
     --worker-url http://aiworker-worker:9217 \
     --bootstrap-token wtk_xxxx \
     --display-name prod-1
   ```
4. 成功后 `aim workers list` 应能看到它，`online=true`（如果 worker 同时用 `aiw serve --gateway ws://gateway:9218/ws` 作为 node 接入）。

Worker baseUrl 仍是 HTTP 根（scheme + host/port，不带 path）。典型形态：

| Topology | 示例 baseUrl |
|---|---|
| gateway 与 worker 同一 compose 网络 | `http://aiworker-worker:9217` |
| worker 在另一宿主，有 HTTPS 反代 | `https://worker-1.example.com` |
| worker 在另一宿主，直暴端口 | `http://<test-server-ip-redacted>:9217` |

### `aim workers launch` 与 supervisor overlay

启用后，`aim workers launch` 让 gateway supervisor 本机拉起 worker 容器、scrape bootstrap、自动 pair。需要的环境全部在 overlay 里：

```sh
# 一次性：把 overlay 上传。
aissh file upload ops/compose/docker-compose.supervisor.yml \
                  /opt/aiworker-deploy/docker-compose.supervisor.yml

# 组合启动：
aissh exec <server> \
  "cd /opt/aiworker-deploy && docker compose \
     -f docker-compose.yml \
     -f docker-compose.supervisor.yml \
     --env-file .env \
     pull && docker compose \
     -f docker-compose.yml \
     -f docker-compose.supervisor.yml \
     --env-file .env \
     up -d"
```

Prerequisites：

1. `AIWORKER_GATEWAY_CAN_LAUNCH=true` 必须先在宿主 `.env` 打开。overlay 会把 `/var/run/docker.sock:ro` 挂进 gateway 容器——等价于 host root，必须有反代或 Zero Trust 保护。
2. `INTERNAL_SHARED_SECRET` 必须就绪（gateway 把它注入到 launch 的 worker 容器 env）。
3. 宿主上的 worker 数据目录：
   ```sh
   sudo install -d -o root -g root -m 0755 /opt/aiworker-workers
   ```
   容器内外路径必须一致（docker daemon 认宿主路径）。

可选 env：

| 变量 | 默认 | 含义 |
|---|---|---|
| `AIWORKER_MAX_WORKERS` | 不设（无上限） | fleet 行数硬上限，对 `workers.pair` / `workers.launch` 都生效 |
| `WORKER_MEMORY_LIMIT` | `512m` | 每个 launch 的 worker 容器 `--memory` |
| `WORKER_CPU_LIMIT` | `1.0` | 每个 launch 的 worker 容器 CPU（fractional cores） |
| `AIWORKER_LAUNCH_BASE_URL_TEMPLATE` | `http://{containerName}:9217` | 网络拓扑不匹配时覆盖 |

Smoke：

```sh
# loopback 放行空 token。
bun apps/cli/src/aim.ts workers launch --display-name smoke
# ✔ 已 launch worker w_xxxxxxxxxxxx
bun apps/cli/src/aim.ts workers list
bun apps/cli/src/aim.ts workers remove <workerId>
```

回滚（撤 overlay）：

```sh
aissh exec <server> \
  "cd /opt/aiworker-deploy && docker compose \
     -f docker-compose.yml \
     --env-file .env \
     up -d"
```

踩坑：

- **忘记网络**：overlay 把 `AIWORKER_NETWORK=aiworker_default` 作为默认；如果宿主 compose 网络名不同，`workers.launch` 的 URL template（`http://{containerName}:9217`）就解析不到，`aim chat` 会拿到 `worker_unreachable`。补丁是在 `.env` 里覆盖 `AIWORKER_LAUNCH_BASE_URL_TEMPLATE`。
- **数据路径不对等**：`WORKER_DATA_ROOT` 必须在宿主和 gateway 容器里一字不差——docker daemon 拿到的是宿主路径。overlay 两侧都用 `/opt/aiworker-workers`。
- **Master key 丢失**：与基础部署相同。Master key 必须离线备份；每个 launched worker 有自己的 per-worker master key（由 gateway 在容器内 mint 并写 `worker.db`），gateway 不保留明文。

---

## Troubleshooting

- `aissh exec` 打印 `approval required`：在另一个终端跑 `aissh approval wait <op-id>`，然后重跑失败的子命令。
- `verify` 失败：`aissh exec <server> "docker logs aiworker-gateway --tail 200"`——看 gateway 是否真的起了，`.env` 里 `AIWORKER_MASTER_KEY` 是否有效。
- `reload-caddy` 失败 `caddy validate`：本地改 `ops/caddy/Caddyfile.tmpl`，重跑 `bun run scripts/deploy.ts deploy`（或 `upload` + `reload-caddy`，若镜像未变）。**特别注意（BUG-007）**：`Caddyfile.tmpl` `import auth.snippet` 要求宿主侧已存在 `/etc/caddy/auth.snippet`；缺失时 caddy validate 会报 `import: file not found`——按上文 §"Caddy basic-auth setup（BUG-007）"补 snippet 后再 reload。
- `aim` 命令失败 `auth: shared_secret_mismatch`：loopback 检测不命中（通常是从容器外部直连 gateway 的 `127.0.0.1`，但 Bun 看到的 `requestIP` 是 docker network 地址）。解决：显式在 aim 里 export `INTERNAL_SHARED_SECRET` 当 token，或经 Caddy 反代进入并带上 basicauth 凭证（BUG-007 修复后两层都会校验）。
- `aim` 等响应超时：检查 node 是否在线（`aim workers list`）；若 node 短时间内频繁断连，看 `fleet.db` 的 `audit_events` 里 `gateway.node.disconnected` 的 close code。

---

## 历史 Deploy 记录

PLAN-013 之前的 dashboard 部署时间线记录在 `docs/task/FEAT-009.md` 的 "Deploy records" 表。该表保留作为历史存档；PLAN-013 之后的新部署方式（gateway 容器入口）以本文档为准。

---

## 与原始 FEAT-009 草案的偏离

原 FEAT-009 task 在 PLAN-004 前写成。本 run book 有意偏离：

1. health 端点 `GET /health`，不是 `GET /api/system/health`。
2. Caddyfile 不剥 `{workerId}` 前缀——worker 自行广告外部可达 URL。
3. 首跑只拉 gateway；worker 由 operator 在 gateway 健康后 pair / launch。
4. 镜像由 `.github/workflows/build-image.yml` 在 GitHub Actions 构建，发布到 `ghcr.io/zoneasetech/aiworker`（private）。宿主只 `docker compose pull`，不 `docker load` 工作站打的 tarball。
5. Dashboard 容器（PLAN-004 时代）托管 `/app/web` 静态资源。**PLAN-013 起**：web SPA 已切到 WS 协议，静态资源仍存在镜像里但不再被入口 serve（滚动回退遗留）；后续版本会把静态资源下线，入口纯走 WS。
6. 入口容器从 `aiworker-dashboard`（Hono + REST + SPA）改名为 `aiworker-gateway`（Bun.serve + WS）——service name、ENTRYPOINT override、验证字段全部需要与 PLAN-013 对齐。
