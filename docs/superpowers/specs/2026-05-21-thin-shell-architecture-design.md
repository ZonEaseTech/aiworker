# Thin Shell Architecture Design

## 目标

将 AIWorker 从当前四层治理型平台架构精简为 **Local Shell + Engine Bridge for Soul Apps**，
使代码实现与 `docs/architecture.md` 的 Constraint Registry 完全对齐。

核心原则：

- Host 只拥有 start / shell / locate / mount / bridge 五个职责
- Soul App 是领域主权方，通过 micro-app 作为子应用挂载到 Host
- Host 不存储业务数据、不解释领域语义、不提供通用治理
- Brain Kernel、artifact registry、review/profile/lesson 全部移出 Host

## 架构对比

### 当前（四层平台）

```
Brain Kernel → Host Runtime → Worker Runtime → Engine Bridge
```

Brain Kernel 包含 admission governance、artifact registry、brief compiler、secret scanner、
13 个 skill pack。Host Runtime 管理 Soul App 全生命周期、Worker 工厂、模板 enrichment。
Worker Runtime 编排 session/turn/artifact、管理 profile ledger。

### 目标（Thin Shell）

```
Host Shell → micro-app boundary → Soul App
                                 External Engine
```

Host Shell 是主应用，Soul App 是子应用，通过 `@micro-zoe/micro-app` 通信。
Host 只做路由定位和 engine bridge，Soul App 拥有全部领域逻辑。

## Host 保留的五个职责

| 职责 | 说明 |
|------|------|
| start | 发现、安装、启用 Soul App；启动/停止 app 进程 |
| shell | 本地 Web/CLI/daemon 入口；统一 layout + header；theme/context 注入 |
| locate | 维护 worker → workspace → session 的路径和当前上下文定位 |
| mount | 通过 micro-app 挂载 Soul App 的 UI 子应用和 API 代理 |
| bridge | 为 session 准备 cwd、context file、engine 入口；透传 engine 结果 |

## 逐包裁剪范围

### packages/shared

**保留（Layer 0 + Layer 1 结构合约）：**

- `local-workspace.ts` — worker/workspace/session/turn/invocation/overlay 的 metadata schema，移除 LocalArtifact
- `soul-app/manifest.ts` — Soul App manifest 结构合约，移除 SoulAppArtifactType、SoulAppMemoryAdmissionPolicy、review/memory permission
- `soul-app/protocol.ts` — 运行时接口，移除 SoulAppReviewProtocol、SoulAppArtifactProtocol
- `soul-app/micro-app.ts` — mount 协议
- `providers/` — engine executor provider、agent event、availability
- `executor-capabilities.ts` — 废弃删除
- `lib/ids.ts`、`types.ts`、`errors.ts`

**移除（Layer 2 治理 + Layer 3 领域内容）：**

- `brain/` 整目录 — admission.ts、artifact.ts、brief.ts、skill-pack.ts、scan-body.ts、skills/
- `vertical-soul.ts` — 35 个内置 capability template
- `worker-pack.ts` — 4 个内置 worker pack
- `soul-workbench.ts`、`soul-workbench-catalog.ts`
- `soul/` 整目录 — module.ts、pack.ts、registry.ts、modules/、packs/
- `scope/` 整目录 — manifest.ts、index.ts
- `profile-promotion.ts`
- `capabilities.ts` — policy manifest

### packages/core

**保留：**

- `host/runtime.ts` — 精简为 start/locate/mount，移除 enrichTemplateMetadata
- `host/identity-provider.ts` — local auth
- `worker/engine-bridge.ts` — 保留
- `worker/engine-stream.ts` — 保留
- `worker/engine-assets.ts` — engine asset projection 保留
- `worker/files.ts` — workspace file IO 保留
- `worker/events.ts` — 精简事件类型（移除 artifact event kind）
- `soul-app/registry.ts` — install/enable/disable/healthcheck
- `soul-app/official.ts` — 官方 app bootstrap
- `config/`、`adapters/`

**移除/精简：**

- `worker/executor.ts` — 移除 LocalExecutorArtifact/Review/Lesson，精简为纯 engine 调用
- `worker/runtime.ts` — 移除 buildInvocationPrompt 中的 review rubric/hints/profile 注入，移除 artifact discovery
- `worker/profile-ledger.ts` — 整文件删除
- `soul-app/search-index.ts` — 删除
- `soul-app/storage-provider.ts` — 删除（KV 存储下沉到 Soul App）

### packages/storage-sqlite

**保留的表（14 张）：**
workers、worker_overlay_assets、workspaces、sessions、turns、
engine_invocations、worker_engine_invocations、session_events、files、
soul_apps、settings、worker_identity、worker_config、worker_secrets

**通过新 migration 0005 drop 的表（5 张）：**
artifacts、reviews、lessons、soul_app_audit_events、soul_app_storage_records

### apps/web

**移除的 UI/状态：**
- ArtifactPreviewFrame / ArtifactPreviewContent
- ReviewPanelShell
- submitReview() + changeLessonStatus()
- session-progress.ts 中的 artifact_finalizing / review_ready / review_failed / reviewed 阶段
- Worker 主页中的 capability template 徽章/搜索
- `features/local-workspace/api/` 中的 reviews.ts、lessons.ts、profile-revisions.ts

**保留：**
- Host header + sidebar + 导航树
- MountedSoulAppRouteSurface（micro-app 挂载容器）
- SessionChat（精简版，不解析 artifact）
- WorkerConfigurationDialog
- settings/i18n/theme 基础设施

### apps/api

**移除的端点组：**
- `GET/POST /api/local/artifacts/*`
- `GET/PUT /api/local/files/*`、`/workspaces/*/files/*`
- `GET /api/local/souls/*`
- `GET /api/local/templates/*`
- `GET /api/local/events`（session events 保留）

### packages/soul-app-sdk

保留：Manifest 类型定义、micro-app 挂载协议、Host API typed client、Engine Bridge 调用接口、
theme/i18n context 类型。

不再依赖 shared 中的 Layer 2/3 类型。

### packages/soul-app-runtime

保留 standalone + Host mounted 双模式 harness。依赖链精简为：
`soul-app-runtime → shared（仅 Layer 0/1）+ soul-app-sdk`，不再直接依赖 core 和 storage-sqlite。

## API 面（保留端点）

- Health + Info：`GET /health`、`GET /api/local/info`
- Apps：list/get/install/enable/disable/healthcheck + micro-app surfaces proxy
- Workers：list/create/get/update + overlay get/put + engine invocations
- Workspaces：list/create/get/update + projection
- Sessions：list/create/get + events + messages (turn) + stream SSE
- Settings：get/patch + engines rescan/test

## Engine Bridge 职责

Host 在 session 层准备：
- cwd（workspace 路径）
- engine 选择 + 元信息
- context file：cwd.txt、engine.json、soul-app.json
- invocation boundary（stdin/stdout 管道）
- 结果透传（raw stdout/stderr，不解析 artifact/review）

Soul App 负责：
- 领域 prompt 和指令
- 输出解析（从 engine 原始输出中提取业务 artifact）
- review/确认流程（app 自己的 UI + API）
- profile 管理和记忆

## micro-app 通信协议

### Host → Soul App（data 注入）
theme（light/dark）、locale、workspace context（路径、类型）、session context（cwd、engine 引用）、mount token（API 代理鉴权）

### Soul App → Host（lifecycle events）
ready（挂载完成）、error（运行时错误）、resize（尺寸变化）、navigate（请求 Host 路由跳转）

## Session Context 目录

精简后结构：
```
.aiworker/sessions/{id}/context/
  ├── cwd.txt
  ├── engine.json
  └── soul-app.json
```

## 迁移策略

Big-bang 一次性删除。一次 PR 完成所有移除和精简。

## 验证项

- `bun run typecheck` 通过
- `bun run test` 通过（更新/删除受影响的测试）
- `bun run check` 通过（lint + boundary check）
- `scripts/check-soul-app-boundaries.ts` 通过
- `scripts/check-web-ui-components.ts --all --audit` 通过
- `bun run ui:check` 通过
- 官方 Soul App（aiworker-hr、aiworker-qa）standalone 和 Host mounted 模式正常
