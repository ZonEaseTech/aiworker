# Universal Soul Workbench Design

## 目标

为所有 Soul App 提供一个通用的 web 工作台，包含 session composer/chat 体验（类似原生 Codex
Desktop composer）。领域定制化的 Soul App（如 HR）通过 Host header 选项卡切换到领域工作台。

## 核心决策

| 决策 | 结论 |
| --- | --- |
| 切换方式 | Host header 选项卡，读取 manifest `ui.routes` 渲染 |
| 代码归属 | 新增 `packages/soul-app-workbench`，SDK 级共享 surface |
| 路由发现 | `defineSoulApp()` 自动注入，开发者零配置 |
| Session API | SDK 自动注入薄透传端点，Soul App 不持有 session 逻辑 |
| 现有组件 | `apps/web` 中 session chat 组件迁入 `packages/soul-app-workbench` |

## 架构原则

- **Soul App 是薄层**：不持有 session 状态，不实现 session 管理逻辑。SDK 注入的 API
  端点是透传代理，转发到 Host 的 session 管理和 engine bridge。
- **Engine 原生体验**：通用工作台的 session chat 直接对接 engine，Soul App 不在中间
  增加领域逻辑。
- **Sessions 挂在 workspace 下**：左侧树按 workspace 分组 sessions。

## 新增 Package：`packages/soul-app-workbench`

### 目录结构

```
packages/soul-app-workbench/
  src/
    universal-workbench/
      UniversalWorkbenchApp.tsx     # 顶层 layout：左侧树 + 中间 chat
      WorkspaceSessionTree.tsx      # workspace → sessions 树
      SessionChatView.tsx           # session thread + composer
      SessionDetail.tsx             # 右侧详情抽屉
      SessionTurnComposer.tsx       # turn composer 包装（附件管理）
      hooks/
        useSessionList.ts           # 调用 SDK 注入的 /api/sessions
        useCreateSession.ts         # 创建新 session
        useSessionEvents.ts         # 获取 session 事件流
      timeline/
        SessionTimeline.tsx         # turn-by-turn 事件渲染
        session-view-model.ts       # 事件归一化 + view model
        message-flow.tsx            # 消息行、工具卡片、状态 pill
        engine-readiness.ts         # engine 就绪状态检查
    index.ts                        # 导出 UniversalWorkbenchApp
```

### 依赖关系

```
packages/soul-app-workbench
  → @zonease/aiworker-ui          # SessionComposer, SessionThread, shadcn primitives
  → @zonease/aiworker-shared       # 类型定义
  → react, @tanstack/react-query  # UI 框架
```

`packages/soul-app-workbench` 不依赖 `@zonease/aiworker-core`、`@zonease/aiworker-api`
或任何 Host 私有包。它通过 Soul App 的 mounted API 获取数据。

### 迁移来源

| 新位置 | 来源 |
| --- | --- |
| `UniversalWorkbenchApp.tsx` | 新建，组合子组件 |
| `WorkspaceSessionTree.tsx` | 新建 |
| `SessionChatView.tsx` | 基于 `apps/web` 的 `WorkerSessionChat` 重构 |
| `SessionDetail.tsx` | 从 `apps/web/src/worker/session-detail.tsx` 迁入 |
| `SessionTurnComposer.tsx` | 从 `apps/web/src/worker/session-turn-composer.tsx` 迁入 |
| `SessionTimeline.tsx` | 从 `apps/web/src/features/session/session-timeline.tsx` 迁入 |
| `session-view-model.ts` | 从 `apps/web/src/features/session/session-view-model.ts` 迁入 |
| `message-flow.tsx` | 从 `apps/web/src/features/session/message-flow.tsx` 迁入 |
| `engine-readiness.ts` | 从 `apps/web/src/features/session/engine-readiness.ts` 迁入 |

## SDK 注入机制

### `defineSoulApp()` 自动注入

调用 `defineSoulApp()` 时，SDK 自动：

**1. 注入通用工作台路由**（追加到 manifest）

```typescript
// SDK 内部逻辑
manifest.ui.routes.unshift({
  id: "universal-workbench",
  label: "通用工作台",
  path: "/workbench/universal",
  surface: {
    entry: "/micro-app/workbench/universal",
    renderer: "micro-app",
    scope: "app"
  }
});
// 开发者声明的领域路由排在后面
```

**2. 注入 session API 端点**（注册到 mounted Bun server）

| 端点 | 方法 | 用途 | 实现 |
| --- | --- | --- | --- |
| `/api/sessions` | GET | 列出 workspace 下的 sessions | 透传到 Host session API |
| `/api/sessions` | POST | 创建 session | 透传到 Host session API |
| `/api/sessions/:id` | GET | 获取 session 详情 | 透传到 Host session API |
| `/api/sessions/:id/turns` | POST | 提交 turn，调用 engine | 透传到 Host engine bridge |
| `/api/sessions/:id/events` | GET | 获取 session 事件流 | 透传到 Host session API |

**3. 注入 micro-app HTML 端点**

SDK 在 mounted Bun server 中注册 `/micro-app/workbench/universal`，返回包含
`UniversalWorkbenchApp` 的 HTML 页面。

### 薄透传模型

```
UniversalWorkbenchApp (UI)
  → fetch /api/sessions              # 调用 mounted service
    → SDK 注入的 handler              # 薄代理，不包含业务逻辑
      → Host API (localhost:xxxxx)    # 已有的 session 管理
        → Engine bridge               # 已有的 engine 调用
          → External engine           # 原生 engine 体验
```

Soul App 开发者在任何环节都不需要写 session 管理代码。SDK 注入的端点不持有状态，
不做领域判断，只是一个 HTTP 代理层。

## Soul App 开发者体验

开发者只需声明领域路由，通用工作台自动获得：

```typescript
// apps/my-soul-app/src/app.ts
defineSoulApp({
  manifest: { id: "my-soul-app", name: "My Soul App", ... },
  mountedService: { entry: "./host-adapter/mounted/host-mounted.ts" },
  routes: {
    // 只需要声明领域路由
    "/my-domain": MyDomainWorkbench
  }
  // 通用工作台自动注入，无需任何配置
});
```

Host header 渲染效果：
```
[通用工作台] [My 领域工作台]
```

- 默认进入通用工作台
- 用户在通用工作台中看到 workspace → sessions 树
- 点击 session → composer/chat 体验
- 切换到领域 tab → Soul App 的领域工作台

## Host 变更

仅两处修改，不动 Host session/workspace 管理、mounted container 机制、路由机制：

### 1. Host header 选项卡

Host 读取当前 Soul App manifest 的 `ui.routes`，在 header 中渲染 tab 列表。
按 `ui.routes` 声明顺序渲染（通用工作台始终在第一位）。

点击 tab → Host 通过 `pushMountedMicroAppRoute()` 切换到对应 child route。

### 2. Session 路由委托

当 URL 包含 session（`/sessions/:id`），Host 在 mount context 中传递 `sessionId`。
通用工作台 micro-app 收到后自动切换到对应 session 的 chat 视图。

### Code changes

只改 `apps/web/src/worker/worker-studio.tsx`（header 选项卡渲染 + session 委托），
不改其他 Host 文件。

## 从 `apps/web` 移除

`WorkerSessionChat`、`SessionTurnComposer`、`SessionDetail` 和
`features/session/*` 迁移到 `packages/soul-app-workbench` 后，从 `apps/web` 删除。

`apps/web` 中不再存在 session chat UI。Host Web 只保留：
- `WorkerStudio` 壳（sidebar + mounted container + header）
- header 选项卡渲染
- 基本的 worker/workspace 导航

## Workspace → Sessions 树交互

左侧树结构：

```
hr-workspace
  ├── session-001  候选人资料 review
  ├── session-002  面试反馈整理
  └── + 新建 Session
```

交互规则：

- 选中 workspace 节点 → 右侧显示"新建 Session"composer
- 选中已有 session → 右侧显示 session thread + composer（继续对话）
- "新建 Session" → composer 输入，选择 capability/template，提交后 engine 开始工作
- session 列表通过 SDK 注入的 `GET /api/sessions` 获取
- 创建 session 通过 `POST /api/sessions` 透传到 Host

## 边界条件

- **Soul App 无领域路由**：Host header 只显示"通用工作台"一个 tab（或无 tab，直接显示）
- **Engine 未配置**：通用工作台显示 engine 未就绪提示，composer 禁用
- **Workspace 下无 session**：显示空状态引导"创建第一个 Session"
- **Standalone 模式**：通用工作台也可用（standalone runtime 同样注入 SDK 端点）

## 验证

- `bun run typecheck` 全量通过
- `bun run test` 全量通过
- `aiworker app validate` 对 HR/QA/Custom 均通过
- `aiworker app smoke` 对 HR/QA 均通过
- `bun run ui:check` 通过
- `bun run crg:review` 通过
