# FEAT-062 Soul App standalone runtime and SDK

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-12 21:00
- **plan**: PLAN-286
- **relatesTo**: FEAT-060, FEAT-061, packages/core, packages/shared, apps/cli, apps/api, apps/web

## 背景

用户期望每个 Soul 都可以单独拎出来成为独立项目：`aiworker-hr` 可以独立部署为 HR
垂直应用，同时也可以挂载进 AIWorker Host。要做到这一点，Soul App 不能依赖 Host
内部实现，也不能复制一套 AIWorker runtime。它需要一个稳定 SDK 和 standalone shell，
复用 core runtime 但保留自己的领域产品入口。

## 目标

提供 Soul App SDK 和 standalone runtime，让垂直 app 可以：

1. 通过 SDK 实现 `soul-app/v1` manifest、protocol handlers 和 UI/API contributions。
2. 独立启动自己的 vertical app shell。
3. 复用 AIWorker core 的 daemon/session/engine/artifact/review/memory 能力。
4. 在 standalone 和 Host mounted 两种模式下使用同一份领域逻辑。

## 非目标

- 不让每个 Soul App 自己实现 engine adapter、connector vault 或 review/memory 主存。
- 不要求所有 Soul App 都必须 standalone。
- 不提供远程 SaaS multi-tenant host。
- 不把 standalone 模式变成 forked Host UI。

## 验收标准

- 有 `@zonease/aiworker-soul-app-sdk` 或等价 SDK 包。
- SDK 提供 typed manifest builder、protocol handler types、scoped Host client 和 test harness。
- 一个 demo Soul App 能以 standalone 模式启动并创建 worker/workspace/session/artifact/review。
- 同一个 demo Soul App 能被 Host mounted 模式加载，且不改领域代码。
- standalone shell 只展示该 Soul 的垂直工作台，不暴露 Host 多 app 管理面。

## 调查结论

- 现有 core/runtime 已承载 session、engine、artifact 和 review 的通用能力，可以成为
  standalone runtime 的内核。
- 现有 Web Shell 和 HR module 可作为 standalone shell 的参考，但不能直接要求
  Soul App 复制 Host 内部 routing。
- FEAT-060 / FEAT-061 已完成静态 manifest/protocol、Host registry persistence、
  catalog projection、CLI/API/Web app lifecycle surface 和 scoped API namespace
  reservation；FEAT-062 应消费这些结果，而不是重定义协议或 registry。
- 当前缺口是外部 app authoring SDK、app-scoped standalone bootstrap、scoped runtime
  client 和同一 demo app 在 standalone / mounted 两种模式下复用的测试 harness。
- Host mounted 生产路径在 PLAN-287 前仍不应执行外部 UI/API/runtime handler；本功能只在
  SDK/harness 层证明 handler contract，避免绕过 isolation broker。

## 备注

本功能保证 Soul App 的独立产品属性，是吸引外部/更多开发者参与垂直 app 开发的关键。

## 完成记录

- 2026-05-12 23:35: 新增 `@zonease/aiworker-soul-app-sdk` workspace package，提供
  `defineSoulApp(...)`、manifest validation helper、protocol/manifest type exports、
  scoped local daemon client、standalone runtime bootstrap 和 mounted test runtime helper。
- Standalone helper 复用 worker.db、Host registry projection 和
  `LocalWorkerRuntime`，只返回当前 app 的 scoped catalog，避免把 Host 多 app catalog
  暴露给 external vertical app。
- Mounted test helper 使用同一份 app definition 走 Host registry install/enable 和
  catalog projection，证明 standalone / mounted 两种模式不需要改领域定义。
- Runtime artifact metadata 现在会保留 `soulAppId`，使 app-scoped session 输出可追溯到
  Soul App。
- 添加 SDK authoring README，明确外部 app 只能依赖 SDK 和 public local API，不 import
  Host CLI/API 私有模块；Host 生产路径执行外部 handlers 仍留给 PLAN-287 broker。

## 验证

- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
