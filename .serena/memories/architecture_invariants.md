# Architecture Invariants

控制面与数据面：
- Gateway 是 WebSocket 控制面，持有 fleet.db，只保存 worker 指针、注册信息和审计事件。
- Worker 是数据面，持有 worker.db，保存 worker 身份、配置、secrets、会话、消息、任务和运行状态。
- Gateway 永不直连 worker 业务路径；fleet 操作通过 gateway WS 转发到 node。
- Fleet UI 只通过 gateway WS 访问 fleet.db/worker 指针；Worker UI 只通过 worker REST/SSE 管理本机 worker.db/runtime。

Runtime 边界：
- `packages/core` 是 transport-agnostic runtime，不依赖 Hono/Scalar/apps 层。
- apps/api 只保留 Hono 路由、middleware 和 bootstrap 装配。
- provider 扩展通过 BrainProvider、ExecutorProvider、ChannelAdapter，不把 provider-specific 分支塞入 orchestrator。
- Hot reload 必须懒取当前 runtime，reload 串行化，旧 runtime 的 `dispose()` 必须解绑长连接资源。

数据与迁移：
- Fleet 与 worker migration 分离：fleet schema/migration 不混入 worker 业务数据，worker migration 不写 fleet 指针数据。
- `worker_identity` / `worker_config` 是 singleton，pk 固定为 `'default'`，不要引入多租户假设。
- config secret 以 ref 落库，明文只经 vault hydrate 后进入运行时。

安全：
- secret 放 `.env` 或 vault，永不硬编码；新增 env 时同步 `.env.example` 或对应示例。
- `AIWORKER_MASTER_KEY` 必须离线备份，丢失会导致 fleet 中已注册 worker token 无法解密。
- Telegram、WhatsApp、Lark 等 webhook 必须验签；web channel 必须有 inbound bearer。
- 公开 admin、gateway 或 worker 入口时遵守 fail-closed 外部鉴权规则。