# Ops Runbook — Managed-Access RC（首个真实员工开通）

> ⚠️ **2026-06-07 REALITY CHECK：以下部分步骤被实测推翻，待共存决策后改写。**
> aissh 实测 `172.105.219.50`：该机**已在跑另一套 live 系统**（`127.0.0.1:9218` 一个 bun gateway，Caddy `:80` catch-all 服务 `aiw.jbcnet.co.jp`，`auto_https off` + Cloudflare 终结 TLS，basic-auth fail-closed）。`aiworker.zonease.org` 解析到 **Cloudflare**（非直连源站）。
> 因此被推翻的假设：① Caddy ACME 自动 TLS（实为 CF 终结 + 裸 :80）；② 独占 `/etc/caddy/Caddyfile`（实为承重 catch-all，禁止 clobber）；③ `/etc/aiworker/host.env`（该目录已被 `gateway.env` 占用）。
> 步骤 3 的 Caddy/TLS 部分待「共存模型 + Cloudflare 路径」决策后改写；`deploy/Caddyfile` 模板同样 superseded。

> 运维 runbook（**不是** canonical 合同文档；`docs/` 被 docs:check 锁定为 architecture/protocol/runtime/soul-authoring/testing + superpowers，故 runbook 落在 `deploy/` 下与配置同处）。
> 决策依据见 `.omc/specs/deep-interview-ws2-decisions.md`；计划见 `.omc/plans/ralplan-phase2-managed-access-rc.md`。
> 同目录模板：`Caddyfile` · `aiworker-host.service` · `host.env.example`。

标记：`[done]` 已完成 · `[auto]` agent 可做 · `[ops]` 真服务器操作 · `[human]` 只有你能定/做。

## 决策基线（已定）
- **D1** 反代 = Caddy 长驻 + systemd。
- **D2** Host = 独立机 `172.105.219.50`（`aiworker.zonease.org` 解析过去）；Workers = 8 台 vm-node 中选；**绝不同机**。
- **D3** ops 资产入仓 `deploy/`；真 `.env` 600 off-repo。
- **D4** `AIWORKER_HOST_ALLOWED_EMAIL_DOMAINS=zonease.org,ttpos.org,jbcnet.co.jp`。
- **DP1=B** 引擎在 box 上手动登录一次（零新代码）。**DP2=Caddy**。**DP3** real-loopback 并发 gate 已替 fake（US-002 done）。

## 步骤

### 1. [human] DNS + aissh 接入
- 更新 aissh token；让 `172.105.219.50` 进入可操作目标。
- DNS：`aiworker.zonease.org` A 记录 → `172.105.219.50`。`:80`/`:443` 对公网开放（Caddy ACME 需要）。

### 2. [auto/done] deploy/ 三份模板
- `deploy/Caddyfile`、`deploy/aiworker-host.service`、`deploy/host.env.example` 已起草入仓（本轮）。
- 部署时按各文件头部注释拷贝到目标机。

### 3. [ops] 装 Caddy + Host systemd（D1）
```sh
# Caddy（官方 apt 源或二进制），把仓库 Caddyfile 放到 /etc/caddy/Caddyfile
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl enable --now caddy

# Host 服务用户 + 600 env + unit
sudo useradd -r -s /usr/sbin/nologin aiworker || true
sudo install -d -m 700 -o aiworker -g aiworker /etc/aiworker
sudo install -m 600 -o aiworker -g aiworker deploy/host.env.example /etc/aiworker/host.env
sudo cp deploy/aiworker-host.service /etc/systemd/system/aiworker-host.service
sudo systemd-analyze verify /etc/systemd/system/aiworker-host.service
# (先别 start —— 等第 5 步填齐六键，否则 fail-closed 启动失败)
```
- 验：从某台 worker vm-node `curl -I https://aiworker.zonease.org/host`（证 TLS + 非-loopback 可达，AC2）。

### 4. [human/C3] Logto 真租户配回调
- 在真 Logto 租户的 OIDC app 把 redirect_uri 设为 `https://aiworker.zonease.org/auth/callback`（host-server.ts:271）。
- pre-mortem 场景 B 头号坑：redirect_uri mismatch / 六键半填。

### 5. [human/C2] 注入六键 + 起 Host
- 编辑 `/etc/aiworker/host.env`，填 `AIWORKER_HOST_SESSION_SECRET` / `LOGTO_CLIENT_ID` / `LOGTO_CLIENT_SECRET` / `LOGTO_ENDPOINT` / `LOGTO_ISSUER`（`ALLOWED_EMAIL_DOMAINS` 模板已含 D4）。**一次填齐**。
```sh
sudo systemctl enable --now aiworker-host
sudo systemctl status aiworker-host        # 起不来=六键半填，看日志
```
- 自检：浏览器走 `/auth/login`→Logto→`/auth/callback`；非允许域账号被 email 门拒（AC4）。

### 6. [ops/human] aissh 开通 ≥2 真 Worker（DP1=B）
- 经真 aissh exec 在 **不同 vm-node**〔假设，可改〕各开通 1 个真 Worker，各绑 freeform。
- 每个 box 上 native engine **手动登录一次**（local-cli 路径，executor.ts:196-244）。
- 各 Worker check-in，Host 控制台显示「Worker 已报到」（AC6）。

### 7. [human/M3 前置门] engine-auth 证据（拱顶石硬前置）
- 拱顶石**前**，每 box 每引擎产一份证据落 `tmp/`：**时间戳 + 证已登录（发一次最小真回合或显式登录态检查，`--version` 不算）+ 账号标识**。
- 防「跑的是上个账号残留登录态却观察到绿」（pre-mortem 场景 C）。AC5 子项。

### 8. [human] 拱顶石：≥2 并发真员工被观察
- **H1**：你（`@jbcnet.co.jp`）+ 同事（D4 三域内）真 Logto 并发登录；排期两人同时在场。
- 各看到各自活 Workbench → 各发一次真 chat → 各自 native engine 真跑完一回合（观察 summary 非空 + invocation log + exit code）。
- **制造 idle ≥ 阈值**（keepalive 25s 托底）后并发对 `/workers/:A`、`/workers/:B` 各发请求，经 Caddy 证各归各、WS 未掐断。
- 三角证据：Caddy access log（101 + 状态码）+ Host 转发日志（US-001：`{workerId,requestId,localPath,responseStatus}`）。证据落 `tmp/`。
- **任何一条用 fake / 绿 CI / 200 / dev-static 冒充 = NOT done**（AC10）。

## 剩余确认 / 动作清单
- **C1** Caddy idle：无需特配，keepalive 25s 托底（已在 Caddyfile 注释说明）。
- **C2** 六键值/持有者：你注入（步骤 5）。
- **C3** redirect_uri 注册：你做（步骤 4）。
- **H1** 第二员工选定 + 排期：你定（步骤 8）。
- **H2** push WS1（ahead 10）+ WS2 执行授权：你定。
- **V1/V2**（G4-guard / host-single-serve 400）：按 release-check-green 判已闭；客观确认 = 重跑 `bun run release:check`（非必需）。
- **worker→vm-node 映射**：runbook 默认「不同 vm-node」是假设，未经你裁定，可改。
