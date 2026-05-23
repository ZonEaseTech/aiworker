# apps/web Boundary Cleanup Design

## Context

AIWorker 的当前产品合同是 Local Shell + Engine Bridge for Soul Apps。Host
只拥有 start、shell、locate、mount 和 bridge。`apps/web` 应服务这个核心
Host shell：切换 Soul worker，定位 workspace/session，将 manifest 声明的
Soul-owned micro-app surface 挂载起来，并触发 worker-scoped Worker
Configuration。

当前 `apps/web` 已经不再默认渲染旧的 Host-owned session composer/chat/detail
路径，但仍有两个明显风险：

- `worker-studio.tsx` 仍然是 1200 行以上的巨型编排组件，混合了 locator
  推导、Host chrome、micro-app mounting、Worker Configuration 接线、overlay
  projection 和 fallback UI。
- 旧 Host session product UI/client 仍有残留文件，只剩自测或 barrel export，
  例如 `WorkspaceSessionComposer`、Host session turn client、session progress
  和 markdown preview。这些残留会让 Host Web 很容易再次漂回拥有 session
  product surface。

本设计以 `apps/web` 为主线清洗边界，同时审计 API/CLI/shared 中可能继续诱导
边界漂移的合同点。本轮不重写 API/CLI/shared 合同，除非 Web 清洗暴露必须同步
调整的测试或 guardrail。

## Goals

- 删除 `apps/web` 里旧 Host-owned session UI/client 残留。
- 将 `worker-studio.tsx` 拆薄为 Host shell 组装入口，降低维护成本。
- 让 `apps/web` 的职责只表达 shell、locate、mount、bridge context 和
  worker-scoped configuration。
- 用测试和静态 guardrail 证明 Host Web 不渲染 session product UI，不特判
  `universal-workbench`，不把 app-owned workbench descriptor 翻译成 Host
  product API。
- 输出 API/CLI/shared 边界风险审计清单，供后续独立收敛。

## Non-Goals

- 不重写 local daemon API、CLI scaffold 或 shared manifest schema。
- 不修改 Soul App mounted runtime、HR/QA app-owned workbench 或
  `packages/soul-app-workbench`。
- 不新增兼容 shim。
- 不把历史 PMA、changelog 或旧 Superpowers plan 作为当前架构合同来源。
- 不做纯视觉 redesign；UI 变化只服务边界收敛和文件拆分。

## Host Web Boundary

`apps/web` 可以做这些事：

- `shell`：渲染 Host header、left panel、Settings trigger、Worker
  Configuration trigger、通用 loading/error/empty/fallback 状态。
- `locate`：解析当前 Soul worker、workspace、session route，并把这些 id
  当作 locator/context。
- `mount`：读取当前 worker 的 Soul App manifest，找到 declared
  `micro-app` route，调用 surface resolve，并渲染通用 `<micro-app>` container。
- `bridge context`：把 `workerId`、`workspaceId`、`sessionId`、theme 作为窄上下文
  传给 mounted surface。
- `worker configuration`：保存 worker-scoped Host shell preference，例如
  active mounted route、worker overlay/local enablement。

`apps/web` 不可以做这些事：

- 渲染 Host-owned session composer/chat/detail/progress/markdown preview。
- 在 Host Web UI 中发起或继续 turn。
- 解释 `ui.workbench.actions/search/configuration`。
- 按 route id 特判 `universal-workbench`。
- import 或直接渲染 Soul App workbench React tree。
- 把 workspace/session 作为 Host configuration scope。

`session` 一词允许保留在 route/context/API payload 层。`sessionId` 可以传给
micro-app；`SessionComposer` 不能作为 Host 默认路径留在 `apps/web`。

## File Split

`worker-studio.tsx` 保留为组装入口，目标是只接线数据加载、顶层状态和 JSX
composition。拆分后的模块按 Host 职责命名。

### `apps/web/src/worker/studio/locator.ts`

负责从 `LocalWorkspaceData`、`WorkerRoute` 和本地选中态推导：

- `selectedWorker`；
- `selectedWorkspace`；
- `selectedSession`；
- `selectedSoulApp`；
- `filteredWorkspaces`；
- worker/workspace/session route 是否有效。

这里允许使用 `session`，但只能作为 locator 派生。不创建 turn，不解释产物，不保存
session 配置。

### `apps/web/src/worker/studio/mounted-surface.tsx`

承载 generic mounted surface：

- `MountedSoulAppRouteSurface`；
- `ensureMicroAppStarted()`；
- micro-app data channel；
- child `ready` / `error` event；
- child route memory；
- mount payload resolve 和 loading/error 状态。

这是 Host `mount` 的唯一 React 实现。它不能 import
`@zonease/aiworker-soul-app-workbench`，不能判断 `route.id ===
"universal-workbench"`，不能传 React callback 给 Soul App。

### `apps/web/src/worker/studio/mounted-route-preferences.ts`

负责 worker-scoped active mounted route：

- localStorage key；
- read / persist；
- fallback 到 manifest 中第一个 declared micro-app route；
- 无效 route id 清理或忽略。

偏好必须按 worker id 保存，不能提升为 app/global/workspace/session 配置。

### `apps/web/src/worker/studio/host-chrome.tsx`

移出 Host chrome：

- `HostTopBar`；
- `HostSidebarActions`；
- `HostSidebarFooter`。

这些组件只接受 Host-owned action props。它们不暴露 Soul App header slot、
toolbar slot 或 left-panel extension point。

### `apps/web/src/worker/studio/first-run-soul-app-home.tsx`

负责首次选择 Soul App 和创建 Soul worker 的 Host shell 入口。它只启动 worker
路径，不显示领域配置。

### `apps/web/src/worker/studio/workspace-fallback.tsx`

负责没有 declared mounted surface 时的 fallback：

- worker identity；
- workspace list；
- no-mounted-surface empty state；
- workspace search 和 create workspace trigger。

这个 fallback 不是 Host session UI。它不能包含 session composer、turn input、
markdown preview 或 artifact interpretation。

### Existing Files

- `worker-configuration-dialog.tsx` 本轮不大拆 UI，但测试会固定其 worker-scoped
  boundary。
- `worker-workbench-tree.tsx` 可在后续改名为 `worker-switcher.tsx`，本轮不强求，
  避免无意义 churn。

完成后，`worker-studio.tsx` 应显著缩小，并且不再内联 micro-app runtime 细节、
复杂 locator 派生或大块 Host chrome JSX。

## Deletion List

直接删除旧 Host-owned session UI/client 残留：

- `apps/web/src/features/local-workspace/components/session-composer.tsx`
- `apps/web/src/features/local-workspace/components/session-composer.test.tsx`
- `apps/web/src/features/local-workspace/api/sessions.ts`
- `apps/web/src/worker/session-progress.ts`
- `apps/web/src/features/session/markdown-preview.tsx`
- `apps/web/src/features/session/markdown-preview.test.tsx`

同步清理 barrel exports：

- 从 `apps/web/src/features/local-workspace/components/index.ts` 删除
  `WorkspaceSessionComposer` export。
- 从 `apps/web/src/features/local-workspace/api/index.ts` 删除 session turn client
  exports。

如果 `apps/web/src/features/session/` 删除后为空，则删除该目录。

## Keep List

- `apps/web/src/app/router/worker-route.ts` 保留
  `/workers/:workerId/workspaces/:workspaceId/sessions/:sessionId`，因为这是 locator
  route。
- `apps/web/src/features/local-workspace/model.ts` 暂时保留
  `sessionForWorkspace` / `turnForSession`，因为 workspace card 仍可显示最近
  locator/status。若实现时发现只剩旧 UI 使用，再删除。
- 多语言文案中的 session/turn 字段本轮不做大清，除非类型检查暴露未使用字段。

## API/CLI/shared Audit

本轮记录但不默认修改这些风险点：

- `apps/api/src/modes/worker.ts` 仍有全局
  `/api/local/workspaces/:workspaceId/sessions` 和
  `/api/local/sessions/:sessionId/turns` 路径。它们可能仍作为 engine bridge 或
  app-owned mounted API proxy 的兼容入口存在，需要后续判断是否 worker-scoped 化或
  下沉。
- `packages/shared/src/soul-app/manifest.ts` 仍允许 `host-descriptor` 和
  `ui.workbench` descriptor。官方 manifest 已不使用，API/Web 测试也应证明 Host
  不把它们翻译成 product API；是否删除这些 schema 能力需要单独设计。
- `apps/cli/src/aiworker.ts` scaffold 已避免 `host-descriptor` 和
  `/protocol/actions/search`，但仍要审计生成说明是否会诱导 Host-owned workbench
  旧概念。
- `docs/plan`、`docs/task`、历史 changelog 和旧 Superpowers plan 作为审计轨迹
  保留，不能覆盖 `docs/architecture.md#constraint-registry`。

## Tests And Guardrails

### Web Tests

Worker Studio tests should prove:

- declared `micro-app` route renders as `<micro-app>`；
- `workerId`、`workspaceId`、`sessionId`、theme 作为 mount context 传入；
- Host Web does not render `SessionComposer`、follow-up turn input、markdown
  preview 或 session progress panel；
- navigating worker/workspace/session locator routes does not call Host-owned
  turn submit clients such as `/api/local/sessions/:id/turns` or
  `/api/local/workspaces/:id/sessions`；
- Worker Configuration workbench tab is worker-scoped route preference, not
  app/global/workspace/session configuration。

New focused tests should cover:

- `locator.ts` route and selected state derivation；
- `mounted-route-preferences.ts` read/persist/fallback behavior；
- `mounted-surface.tsx` child route memory and mount context behavior where it is
  practical to test without duplicating micro-app internals。

### Static Guardrail

Extend `scripts/check-soul-app-boundaries.ts --completion-audit` to reject:

- `apps/web` importing `@zonease/aiworker-soul-app-workbench`；
- 旧 Host session UI entry names such as `WorkspaceSessionComposer`、
  `session-progress` and `features/session`；
- Host-owned workbench action/search client paths in `apps/web`。

The guard must not reject plain locator/context fields such as `sessionId` or
`workspaceId`。

## Validation

Focused validation:

```bash
bun scripts/check-soul-app-boundaries.ts --completion-audit
bun run --filter '@zonease/aiworker-web' test
bun run --filter '@zonease/aiworker-web' build
bun run ui:check
git diff --check
```

Because production code will change during implementation, closeout also runs:

```bash
bun run crg:update
bun run crg:review
```

API/CLI/shared audit-only findings do not require their package tests unless the
implementation changes those surfaces.

## Acceptance Criteria

- `apps/web` no longer contains Host-owned session composer/chat/detail/progress
  or markdown preview residual code.
- `worker-studio.tsx` is a maintainable composition entrypoint rather than a
  giant Host/Soul/workspace/session/micro-app orchestrator.
- Mounted surface rendering remains manifest-driven and generic.
- Host Web never special-cases `universal-workbench`。
- Worker Configuration stores active mounted route by worker id only.
- Tests and boundary script fail if old Host session product UI is reintroduced.
- API/CLI/shared boundary risks are documented for separate follow-up work.
