# Gateway 协议

PLAN-013 引入的 WebSocket 控制面：operator（aiworker CLI / web）与 node（worker 容器）共享同一条 `ws://<host>:9218/ws` 入口，按 role 分流。协议的纯类型 + zod 运行时校验全部在 `@zonease/aiworker-gateway-proto`，供 aiworker CLI、gateway、worker、web 四侧复用。

## 概览

- 服务端实现：`packages/gateway/src/server.ts`（`Bun.serve(:9218, { websocket })`）。
- 路径：
  - `GET /health` — JSON 心跳（`{ ok, service: 'aiworker-gateway', ts }`）；loopback / Caddy / 部署脚本 readiness 探针用。
  - `GET /ws` — WebSocket 升级端点（必需 `Upgrade: websocket`）。
  - 其它路径 → 404。
- 三角色：
  - `operator` — 发起请求、订阅事件；aiworker CLI（`fleet` / `gateway` 子命令）/ web SPA 都是 operator。
  - `node` — worker 进程；通过 `aiworker serve --gateway` 作为 node 拨号。
  - `gateway` — 中枢，不对外以 client 身份连接。
- 首帧：`connect`；然后按 role + `type` 分流 `request` / `response` / `event`。

## 鉴权

`connectFrameSchema` 要求每条新连接第一帧是 connect：

```ts
{
  type: 'connect',
  role: 'operator' | 'node',
  agentId: string,          // operator 时是 deviceId 的 agent 标识；node 时是 workerId
  deviceId: string,
  auth: { token: string },  // loopback 场景可为空串
  meta?: Record<string,string>
}
```

gateway 的 `authorizeConnection` 规则：

1. 连接来源 IP 命中 loopback（`127.0.0.1` / `::1` / `::ffff:127.0.0.1` / `localhost`）→ 放行任意 token（含空串）。
2. 非 loopback → `auth.token` 必须等于 `INTERNAL_SHARED_SECRET`（`timingSafeEqualStrings` 比较）。
3. 失败 → 记 `audit_events(action='gateway.connect.rejected')` 并以 4401 关闭连接。

握手成功后：

- operator：注册进 `OperatorRegistry`；之后只能发 `request` 帧，发其它类型会被踢（4400）。
- node：注册进 `NodeRegistry`（同 `workerId` 的旧连接会被强制替换并关 1012）；之后只能发 `response` / `event`，发 `request` 会被踢。

## 帧类型（引用 `@zonease/aiworker-gateway-proto/src/messages.ts`）

### connect（见上）

### request

operator 发起的调用，id 由发起端生成，response 必须原样回填：

```ts
{
  type: 'request',
  id: string,        // 建议用 ulid / uuid
  method: string,    // 见 "方法目录"
  params?: unknown,  // 由 METHODS[method].params 校验
}
```

示例：

```json
{"type":"request","id":"01HE...","method":"workers.list","params":{}}
```

### response

成功 / 失败按 `ok` 判别，结构互斥：

```ts
// 成功
{ type: 'response', id: string, ok: true, result: unknown }

// 失败
{
  type: 'response',
  id: string,
  ok: false,
  error: { code: string, message: string, details?: unknown },
}
```

示例（失败）：

```json
{"type":"response","id":"01HE...","ok":false,
 "error":{"code":"feature_disabled","message":"gateway 未开启 launch 能力 (AIWORKER_GATEWAY_CAN_LAUNCH=false)"}}
```

### event

gateway → operator 的推送。payload 由 `EVENT_PAYLOADS` 约束：

```ts
{ type: 'event', name: string, payload: unknown, ts: number }
```

示例：

```json
{"type":"event","name":"worker.online","ts":1714000000000,
 "payload":{"workerId":"w_abc","displayName":"prod-1","deviceId":"node-...","connectedAt":1714000000000}}
```

## 方法目录

所有 method 在 `packages/gateway-proto/src/methods.ts` 的 `METHODS` 注册表里声明；每个条目带 `params` / `result` 的 zod schema 与 `routing` 判别：

| method | routing | 典型场景 |
|--------|---------|----------|
| `workers.list` | operator-to-gateway | 面板首页、`aiworker fleet list` |
| `workers.info` | operator-to-node | 详情页刷新、`aiworker fleet info` |
| `workers.pair` | operator-to-gateway | `aiworker fleet pair`（手动 bootstrap token 注册） |
| `workers.launch` | operator-to-gateway | `aiworker fleet launch`（gateway supervisor 自动创建容器） |
| `workers.stop` | operator-to-node | 向 node 下停止指令 |
| `workers.remove` | operator-to-gateway | 从 fleet 摘除（deviceToken 作废） |
| `chat.send` | operator-to-node | 面板 / `aiworker fleet chat` 追加一条用户消息并触发 run |
| `config.get` | operator-to-node | 读 worker 配置 + version |
| `config.put` | operator-to-node | 乐观锁（`ifMatch`）更新配置 |
| `token.rotate` | operator-to-gateway | 轮换 deviceToken，旧 token 立即失效 |
| `logs.tail` | operator-to-node | 订阅日志尾部；后续由 `logs.line` 事件推送行 |
| `system.presence` | operator-to-gateway | operator 心跳 / 询问当前在线 node 列表 |

### 路由判别

- `operator-to-gateway`：gateway 自己处理，不转发 node。`workers.pair` / `workers.launch` / `token.rotate` / `workers.list` / `workers.remove` / `system.presence` 属于此类。
- `operator-to-node`：gateway 按 `params.workerId` 找 `NodeRegistry`，把 request 原样透传。若 node 不在线 → 直接回 `node_offline`；若转发期间 node 断开 → `ForwardTable.onExpire` 回 `node_gone`；超时 → `forward_timeout`。

### 常见错误码

- `invalid_params` — zod 校验失败；`details` 带 `.flatten()` 的详情。
- `not_found` — workerId 不在 fleet.db。
- `already_registered` — pair 时 workerId 已存在。
- `quota_exceeded` — 命中 `AIWORKER_MAX_WORKERS`。
- `feature_disabled` — `workers.launch` 在 canLaunch=false 时。
- `master_key_missing` — gateway 未配置 `AIWORKER_MASTER_KEY`。
- `worker_unreachable` / `auth_failed` / `invalid_worker_info` — pair 时调 worker `/info` 的错误分支。
- `launch_timeout` / `launch_failed` — FleetSupervisor 拉容器失败。
- `node_offline` / `node_gone` / `forward_timeout` — 转发路径异常。

## 事件目录

所有事件在 `packages/gateway-proto/src/events.ts` 的 `EVENT_PAYLOADS` 注册表里声明：

| name | 何时发射 | payload 关键字段 |
|------|----------|------------------|
| `worker.online` | node 连接握手成功 | `workerId` / `displayName?` / `deviceId` / `connectedAt` |
| `worker.offline` | node WS 关闭 | `workerId` / `deviceId` / `reason?('disconnected'\|'expired'\|'kicked')` / `disconnectedAt` |
| `chat.message` | conversation 新消息落库 | `workerId` / `conversationId` / `role` / `content` / `createdAt` |
| `agent.thinking` | executor stream delta | `workerId` / `conversationId` / `taskId?` / `chunk?` |
| `agent.tool_call` | orchestrator 开工具 / 工具回结果 | `workerId` / `conversationId` / `taskId?` / `toolCallId` / `toolName` / `status('pending'\|'running'\|'success'\|'error')` / `args?` / `result?` |
| `agent.done` | orchestrator 终态 | `workerId` / `conversationId` / `taskId?` / `finishReason('stop'\|'length'\|'tool_use'\|'error'\|'cancelled')` / `usage?` |
| `config.changed` | `config.put` 成功 reload runtime 后 | `workerId` / `version` / `changedAt` |
| `logs.line` | `logs.tail` 订阅期间，每条日志行 | `workerId` / `stream('stdout'\|'stderr')` / `line` / `ts` |

gateway 自己在 close WS 时派发 `worker.offline`（`inferOfflineReason` 把 close code 映射到枚举）。`worker.online` 在 node 握手成功后广播给所有 operator。

## Pairing 流程

### 手动 pair（aiworker fleet pair）

1. worker 容器首次启动（`aiworker init` / `aiworker serve` 首跑）在 stdout 打印一次性 bootstrap line：
   ```
   [worker] AIWORKER_BOOTSTRAP_TOKEN=wtk_xxxxxxxxxxxx
   ```
2. 操作员抓取这一行（`docker logs <worker-container>`）。
3. 运行 aiworker CLI：
   ```sh
   aiworker fleet pair --url ws://127.0.0.1:9218/ws \
                 --worker-url http://aiworker-worker:9217 \
                 --bootstrap-token wtk_xxxxxxxxxxxx \
                 --display-name test
   ```
4. gateway 的 `workers.pair` handler：
   - 校验 `AIWORKER_MASTER_KEY` 就绪；
   - 按 `maxWorkers` 短路；
   - 调 worker `/info` 验 token（auth / network / schema 各自独立错误码）；
   - `registered_workers` 已存在 → `already_registered`；
   - 否则把 `(workerId, baseUrl, apiToken, displayName, addedBy='manual')` AES-GCM 加密落库；
   - 把 bootstrap token 作为 deviceToken 返回。
5. aiworker CLI 把 deviceToken + defaultWorkerId 回写 `~/.aiworker/aiworker.json`（0600）。

### 自动 launch（workers.launch）

1. 前置开关：`AIWORKER_GATEWAY_CAN_LAUNCH=true`（compose overlay `docker-compose.supervisor.yml`）；同时需要 `INTERNAL_SHARED_SECRET` / `AIWORKER_IMAGE` / `WORKER_DATA_ROOT` / `WORKER_MEMORY_LIMIT` / `WORKER_CPU_LIMIT` 就绪（`gateway/src/config.ts` `superRefine` 保证）。
2. operator 发 `workers.launch` 方法：
   ```sh
   aiworker fleet launch --display-name demo
   ```
3. gateway `FleetSupervisor` 走 docker daemon：
   - pull 镜像（若不在本机）；
   - 用 `bridge` 网络或 `AIWORKER_NETWORK` 创建容器；
   - 注入 env（`INTERNAL_SHARED_SECRET` / `AIWORKER_MASTER_KEY` / `WORKER_DB_PATH` / 可选 `AIWORKER_FORCE_ID`）；
   - start + 阻塞读 stdout，scrape bootstrap 行，超时 → `launch_timeout`；
   - 返回 `{ workerId, baseUrl, apiToken, containerId, containerName }`。
4. gateway 把 deviceToken 加密落 `registered_workers(addedBy='launch-local')` + 写 `audit_events(action='gateway.worker.launched')`。
5. aiworker CLI 侧写回 deviceToken + defaultWorkerId。

## 故障恢复

- **`AIWORKER_MASTER_KEY` 丢失** = 所有 `registered_workers.apiTokenEnc` 无法解密 → 必须对每个 worker 重新 `aiworker fleet pair`。
- **单个 node 掉线**：gateway `handleClose` 把它从 `NodeRegistry` 摘掉，广播 `worker.offline`，写 `audit_events(action='gateway.node.disconnected')`；已发到该 worker 但未收到 response 的 request 由 `ForwardTable.onExpire('node_gone')` 给 operator 回一条 `response(ok=false, error.code='node_gone')`，避免 aiworker CLI 永久挂起。
- **gateway 重启**：所有 in-flight forward 在 `ForwardTable.dispose()` 里取消；operator 会看到补偿错误响应；node 侧的 `startGatewayNode` 默认开启自动重连（`--no-reconnect` 可关），连回来后 subscriber 重新挂 bus。
- **操作员 aiworker.json 失密**：deviceToken 等价于 operator 的 bearer，任何能读到 `~/.aiworker/aiworker.json` 的本机用户都能冒充 operator。文件保存时强制 `0600`；疑似泄露时走 `aiworker fleet token rotate` 或 `aiworker fleet remove` + `aiworker fleet pair` 重建。

## Backup 清单

- `AIWORKER_MASTER_KEY` — 离线保管（组织级 secret store）。丢失不可恢复。
- `fleet.db` — gateway 卷 `aiworker_fleet:/var/lib/aiworker/fleet.db`。
- 每个 worker 的 `worker.db` — worker 自己的卷。
- `INTERNAL_SHARED_SECRET` — 运维 env 文件，`/opt/aiworker-deploy/.env`。
- `~/.aiworker/aiworker.json` 可重建（重新 pair 即可），无需备份。
