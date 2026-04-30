# PLAN-042 Fleet 统一入口管理非同 host worker

- **status**: completed
- **createdAt**: 2026-04-29 18:10
- **relatedTask**: FEAT-040

## 现状

1. **fleet 已是控制面中枢**：gateway 监听 `/ws`，operator 与 node 都连到同一个 gateway；fleet 持有 `fleet.db`，worker 持有自己的 `worker.db`。
2. **公网入口已经集中到 gateway**：当前测试路径是类似 `https://aiw.jbcnet.co.jp/admin/` 的 fleet 管理面，gateway 负责 `/admin/*` 静态托管、`/ws` WebSocket、`/health`。
3. **worker admin 仍是分离入口**：现有 worker bundle 由 worker 自己托管在 `/admin/`，Fleet UI 当前只展示 `worker.baseUrl/admin/` 跳转。首期目标是把这个公网入口改为由 `workerId` 派生的 fleet path，而不是继续要求每个 worker 配一个 public baseUrl。
4. **proto 已覆盖一部分 worker 管理能力**：`config.get/put`、`cron.*`、`approval.*`、`chat.send`、`logs.tail` 已有 operator-to-node 路由；`workers.info` / `workers.stop` 在 node side 仍有 stub；secrets、engine probe、brain/executor/channel test、tasks/conversations/messages 等 worker REST 能力还没完整映射到 gateway proto。
5. **安全边界必须维持**：`fleet.db` 不允许保存 worker 业务数据；worker bearer token 不应暴露给浏览器；公网 admin 入口必须由外部鉴权层保护。

## 目标

把 operator 的访问模型收敛为：

```text
https://<fleet-domain>/admin/          # Fleet console
https://<fleet-domain>/w/<workerId>/   # Worker console through fleet
```

并满足：

- worker 可以在任意 host，只要能 outbound 连接 fleet gateway；
- gateway 是唯一公网入口和策略执行点；
- worker 管理请求可审计、可限流、可取消；
- 不要求每个 worker 暴露独立公网端口；
- pair / enroll 成功后默认就有 `/w/<workerId>/` 代理入口；
- `baseUrl` 不参与首期对外路由，只保留为兼容字段或未来优化点。

## 方案

### 1. 路由约定

保留现有 fleet 路径：

```text
/admin/       # fleet UI
/ws           # operator/node WebSocket
/enroll-ws    # OTP enrollment
/health       # gateway health
```

新增 worker 入口：

```text
/w/:workerId/                 # worker UI shell
/w/:workerId/assets/*         # worker UI assets
/w/:workerId/api/worker/*     # worker REST-compatible gateway bridge
/w/:workerId/events/stream    # gateway-hosted worker event stream
```

这条入口直接由 `workerId` 派生，不新增 worker public baseUrl 配置。只要 worker 已 pair / enroll，gateway 就默认承接该路径；worker 离线时返回明确的 offline / unavailable 错误。

根路径 `/:workerId` 不作为主入口，只做可选 308 redirect：

```text
/:workerId -> /w/:workerId/
```

但必须满足：

- `workerId` 必须匹配 `WORKER_ID_PATTERN`；
- 不得覆盖 `/admin`、`/ws`、`/health`、`/enroll-ws`、`/docs`、未来 webhook 等保留路径；
- 不存在 worker 时返回 404，不做任意 path proxy。

### 2. Gateway-native 管理主线

主线不是把 HTTP 反代直接打到 worker host，而是把 worker 管理能力迁到 gateway proto：

```text
browser
  -> GET /w/:workerId/api/worker/config
  -> gateway HTTP bridge
  -> gateway proto request config.get
  -> node WS
  -> worker dispatcher
  -> worker.db / runtime
  -> response
```

这样 self-enrolled / OTP worker 即使没有 inbound `baseUrl`，也能被管理。

需要补齐的 proto families：

- `workers.info` / `workers.stop`：补上 BUG-013 中已有 stub。
- `secrets.list` / `secrets.put` / `secrets.delete`：只返回 key，不返回 secret value。
- `engines.list` 或 `engines.probe`：对应 worker REST `/api/worker/engines`。
- `brain.test` / `executor.test` / `channel.test`：保留请求体校验和风险标记。
- `orchestrator.tasks.list/create`、`orchestrator.conversations.list/messages`：支撑 worker chat/tasks 页面。
- `events.subscribe`：gateway 侧把 node event 转为 SSE，按 workerId 过滤。

### 3. HTTP bridge 层

在 `apps/gateway` 增加窄口径 HTTP bridge，不做任意代理：

- URL 必须以 `/w/:workerId/api/worker/` 开头。
- `workerId` 必须存在于 `registered_workers` 或当前 NodeRegistry。
- 每个 path 明确映射到一个 gateway proto method。
- 请求体有大小限制、超时和 abort 传播。
- 只透传必要 headers，不转发客户端 `Authorization`、`Cookie`、`Connection`、`Upgrade` 等 hop-by-hop 或敏感 header。
- 响应统一转为 worker REST-compatible JSON，方便复用 worker UI 的 API 层。

初期 mapping 示例：

| HTTP bridge | Gateway method |
| --- | --- |
| `GET /w/:id/api/worker/info` | `workers.info` |
| `GET /w/:id/api/worker/config` | `config.get` |
| `PUT /w/:id/api/worker/config` | `config.put` |
| `GET /w/:id/api/worker/cron` | `cron.list` |
| `POST /w/:id/api/worker/cron` | `cron.add` |
| `PATCH /w/:id/api/worker/cron/:jobId` | `cron.update` |
| `DELETE /w/:id/api/worker/cron/:jobId` | `cron.remove` |
| `GET /w/:id/api/worker/approvals` | `approval.list` |
| `POST /w/:id/api/worker/approvals/:taskId/:toolCallId/grant` | `approval.grant` |

### 4. Worker UI fleet-hosted 模式

现有 worker bundle 假设：

- 生产 base path 是 `/admin/`；
- router base 是 `/admin`；
- API fetch 是同源绝对 `/api/worker/*`；
- SSE 是同源绝对 `/api/worker/events/stream`。

要让它跑在 `/w/:workerId/`，需要新增 runtime base 配置，而不是复制一套 UI：

- `resolveWebRouterBasepath()` 支持 `/w/:workerId`。
- worker API client 从运行时配置拿 `apiBase`，例如 `/w/:workerId/api/worker`。
- event stream 使用 `/w/:workerId/events/stream` 或 `/w/:workerId/api/worker/events/stream`。
- asset base 改为相对路径或由 gateway 注入 runtime config，避免硬编码 `/admin/assets/*`。
- Fleet worker detail 的 "Open worker UI" 改为 `/w/:workerId/`，不再默认跳 `baseUrl/admin/`。

### 5. HTTP proxy fallback

首期不实现基于 worker `baseUrl` 的 HTTP proxy fallback，避免把方案做重。

保留未来扩展口：

- `registered_workers.baseUrl` 继续作为兼容字段存在，用于手动 pair、诊断或未来近端优化。
- 如果以后要加 HTTP fallback，只允许使用 registry 中的 `baseUrl`，禁止用户在请求里传任意 target，避免 SSRF。
- fallback 仍不得暴露 worker bearer token 给浏览器。

### 6. 鉴权与审计

公网层：

- `/admin/*`、`/w/*`、`/ws`、`/api/*` 必须由 Cloudflare Access / Caddy auth / 等效机制保护。
- gateway 仍保留 `AIWORKER_ADMIN_EXTERNAL_AUTH=1` 这类 fail-closed acknowledgement。

应用层：

- 浏览器不保存 worker bearer token。
- gateway HTTP bridge 以 operator 身份执行请求。
- 如果外部鉴权能提供 identity header，例如 Cloudflare Access email 或 reverse proxy user header，gateway 应记录到 audit。
- 没有 identity header 时，audit actor 退回 `operator:http`.

审计字段建议：

```json
{
  "actor": "operator:http",
  "action": "gateway.worker_http_bridge.invoked",
  "workerId": "w_...",
  "detail": {
    "method": "GET",
    "path": "/api/worker/config",
    "gatewayMethod": "config.get",
    "status": "ok",
    "durationMs": 42
  }
}
```

### 7. 数据边界

保持现有不变量：

- `fleet.db` 只存 `registered_workers`、`audit_events` 等 fleet 指针和审计。
- worker config、secrets、conversations、messages、tasks 仍只在 `worker.db`。
- gateway 可以 transient 转发响应，但不缓存 worker 业务数据。
- token/secret 不进入 URL、localStorage、sessionStorage 或 audit detail。

## 推进顺序

### S1：路由、鉴权和架构文档

- 更新 architecture / deployment 文档，明确 `/w/:workerId/` 路由契约。
- 增加保留路径、workerId pattern、external auth fail-closed 规则。
- 不改运行时行为。

### S2：Gateway proto 管理能力补齐

- 补 `workers.info` / `workers.stop` node handler。
- 增加 secrets、engines、test、orchestrator list/messages 等缺失 method。
- 为每个 method 加 proto schema、dispatcher handler、gateway forwarding test。

### S3：HTTP bridge MVP

- 在 gateway 增加 `/w/:workerId/api/worker/*` bridge。
- 先覆盖 config、cron、approvals、info。
- 加路径 allowlist、body limit、timeout、audit、node offline 错误。
- pair / enroll 成功后无需额外配置，默认可访问 `/w/:workerId/`。

### S4：Worker UI fleet-hosted mode

- worker API client 支持 runtime `apiBase`。
- router base 支持 `/w/:workerId`。
- Fleet UI 改成打开 `/w/:workerId/`。
- Playwright 覆盖 `/admin/` fleet 与 `/w/:workerId/` worker 两种路径。

### S5：事件流与长连接

- gateway 为 worker events 提供 SSE bridge。
- 按 workerId 过滤 node event。
- 支持 abort、idle timeout、最大连接数和 backpressure 保护。

### S6：可选 HTTP proxy fallback

- 暂不进入首期实现。
- 仅在后续确认需要时，为有 `baseUrl` 的 worker 增加受控 fallback。
- 仍严格限制目标来自 fleet registry，不支持请求级任意 target。

## 风险

1. **公网鉴权误配**：新增 `/w/*` 后公网表面扩大。对策：复用 fail-closed 检查，把 `/w/*` 纳入部署文档和 smoke。
2. **路径冲突**：根路径 `/:workerId` 容易撞未来路由。对策：主入口固定 `/w/:workerId/`，根路径只做合法 worker id redirect。
3. **协议覆盖不全**：worker UI 依赖的 REST 面较多。对策：先 MVP 覆盖 config/cron/approvals/info，再逐步补 secrets/test/tasks/events。
4. **SSE / 长连接资源泄漏**：gateway 变成 event stream fanout 点。对策：连接数限制、idle timeout、abort propagation、按 workerId 过滤。
5. **未来 HTTP proxy SSRF**：如果后续加入 baseUrl fallback 且 target 可被用户控制，会变成 SSRF。对策：首期不做 fallback；未来只允许 registry 中的 baseUrl，禁止任意 URL，path allowlist。
6. **多引擎/多 worker 权限混淆**：operator 可能在错误 worker 上执行敏感操作。对策：workerId 全链路校验、UI 明确当前 worker、audit 全量记录。

## 范围

本计划覆盖：

- fleet 域名下的 worker 管理路由；
- gateway-native worker management bridge；
- worker UI fleet-hosted mode；
- `baseUrl` 兼容字段与未来 fallback 的安全边界；
- 鉴权、审计、部署约束。

本计划不覆盖：

- 多 fleet / HA gateway；
- worker 间任务迁移；
- channel webhook 域名重构；
- 完整应用层 SSO；
- 云端 hosted SaaS 多租户权限系统。

## 备选方案

1. **只让 Fleet UI 跳转到 `worker.baseUrl/admin/`**：实现最少，但无法管理 NAT 后 worker，也不满足 fleet 单入口。放弃作为主路径。
2. **pair 时要求填写 public baseUrl**：看似清晰，但会把非同 host/NAT worker 排除掉。首期不采用。
3. **Caddy 动态反代到每个 worker**：社区成熟，但需要所有 worker inbound 可达，且路由规则会分散到边缘代理。只可作为特殊部署手段。
4. **完整 HTTP-over-WS tunnel**：最通用，可复用 worker REST/UI，但实现复杂，涉及 streaming、上传、header、backpressure、超时。可作为后续增强，不作为首期。
5. **只重写 Fleet UI 成完整 worker admin**：最符合 control plane，但会与现有 worker UI 重复。更好的方式是让同一 worker UI 支持 fleet-hosted API adapter。

## 批注

等待用户批准。批准后建议先实施 S1 + S2：先固化路由/安全契约，并补齐 gateway-native 管理 method。这样即使 UI 还未完全切换，非同 host worker 的基础管理能力也能先闭环。

- 2026-04-29 19:39：MVP 实施已合入到本计划的早期切片：
  - S2 补齐 node-side `workers.info` / `workers.stop` handlers；
  - S3 增加 `/w/:workerId/api/worker/info`、`GET/PUT /config` 的 gateway HTTP bridge；
  - S3R 补齐 `gateway.method.invoked` 审计，覆盖成功/失败路径，且不记录浏览器
    `Authorization` / `Cookie`、worker bearer token 或 raw config body。
  这只完成 gateway bridge MVP，不代表完整 Fleet-hosted Worker UI、SSE bridge 或
  全量 worker REST 能力已经完成。
- 2026-04-30 07:44：完成完整 Fleet-hosted Worker UI 交付：
  - gateway 在 `/w/:workerId/*` 托管 worker bundle，保留 `/w/:workerId/api/worker/*`
    为 allowlisted HTTP bridge；
  - worker bundle 支持 `/w/:workerId` router base，并从当前路径派生
    `/w/:workerId/api/worker` API base；自托管 `/admin` 和 dev `/worker` 保持兼容；
  - bridge 覆盖当前 worker UI 使用的 info/config/secrets/engines/probes/cron/
    approvals/orchestrator tasks/conversations/messages；
  - `/w/:workerId/api/worker/events/stream` 提供 worker-scoped SSE bridge，包含
    abort cleanup、最大连接数和 backpressure drop 策略；
  - Fleet UI 的 worker 入口改为 same-origin `/w/:workerId/`，不再依赖
    `worker.baseUrl/admin/`。
