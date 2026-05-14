# FEAT-063 Soul App isolation brokers and permission boundary

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-12 21:00
- **plan**: PLAN-287
- **relatesTo**: FEAT-060, FEAT-061, FEAT-062, packages/core, packages/storage-sqlite, apps/api, apps/web

## 背景

Soul App 可以贡献 UI、API、storage、connector 和 review/memory 逻辑后，Host 必须提供
明确隔离边界。否则垂直 app 会逐步获得 Host DB、secret、engine、connector token 和
跨 Soul memory 的隐式访问权，破坏 local-first 安全和多团队协作信任。

## 目标

建立 Soul App 隔离与权限 broker，使每个 app 只能在声明的 namespace、connector scope、
worker/workspace/session context 和 artifact/review/memory namespace 内工作。

具体目标：

1. Storage namespace 隔离。
2. Connector broker 授权与审计。
3. Engine broker 调度主权保留在 Host。
4. UI/API contribution scoped context。
5. Memory namespace 与跨 Soul 共享策略。
6. Permission declaration、operator approval 和 audit trail。

## 非目标

- 不提供 OS/container 级强沙箱作为第一版默认要求。
- 不允许 Soul App 自带明文 secret 或绕过 Host vault。
- 不让跨 Soul memory 默认共享。
- 不把权限模型做成企业远程控制面。

## 验收标准

- Soul App manifest 权限声明能被 Host 校验、展示和拒绝。
- App API 只能拿到 scoped storage/connector/runtime client。
- App 不能直接读取 Host secret、raw connector token 或其他 app namespace。
- Connector 调用有 appId、workerId、workspaceId、sessionId、operator action 的审计。
- Engine invocation 仍由 Host 创建和记录，Soul App 只能提供 context/rubric/schema。
- Cross-Soul memory 共享必须是显式 export/import 或 Host policy。

## 调查结论

- 当前 AIWorker 已经强调 secret 只能在 `.env`/vault/ref，真实业务文件留在 workspace，
  DB 只存 metadata。
- Soul App 化会扩大扩展面，因此需要在 Host mount 之前先设计最小权限边界。
- FEAT-060/061/062 已经提供 manifest 权限声明、Host registry、reserved app API
  namespace 和 SDK client，但还没有 Host-owned broker request path；当前 mounted app API
  仍统一返回 `SOUL_APP_API_NOT_LOADED`。
- 本轮应先落最小可执行边界：permission decision、app-scoped storage、connector
  evidence read mock、artifact/review/memory broker 和审计事件。外部 app handler 仍不在
  Host 生产路径直接执行。

## 备注

这个功能是 Host 接纳第三方或多团队 Soul App 的信任基础。

## 完成记录

- 2026-05-13 00:18: 完成 Host-owned Soul App isolation broker。新增
  app-scoped storage records、broker audit events、core broker、local daemon
  broker routes、SDK broker client、CLI/Web permission display 和 focused tests。
- Broker 允许 Soul App 通过 scoped storage、connector evidence、review/memory proposal
  等 Host-owned path 工作；跨 namespace storage、未启用 connector 和 raw engine
  invocation 会被拒绝并写 audit。
- Host mounted 生产路径仍不执行外部 UI/API handler；外部 app 只能通过 brokered
  context/client 访问 Host 能力。

## 验证

- `bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' test`
- Focused package typechecks for storage-sqlite, core, api, soul-app-sdk, cli, and web.
