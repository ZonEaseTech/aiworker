# AIWorker Agent Bootstrap

默认用中文与用户交流。文档、代码注释、commit message、PR title/description 也默认中文，除非用户另有要求。

## Authority

AIWorker 当前合同只看 canonical docs：

- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`

Temporary drafts live in `tmp/`。旧 changelog、历史 E2E、旧 project-local AIWorker/PMA/BKD skills 只可作为证据，不能覆盖 canonical docs。

## Product Boundary

Worker 是自治 CLI-first 运行体，拥有 engine 启动权；Host 是可选控制面：分发 / 管理 / 权限分配 / connector 授权，并 mount worker 配置 micro-app。

AIWorker 是 worker-centric local product。默认路径：

```text
Worker -> Soul App -> workspace locator -> session -> app-owned work
Host -> distribute / manage / authorize / connector -> mount worker config micro-app
```

Worker 启动本地壳、定位 workspace/session、serve 员工 web、拥有 projection 与 engine bridge、启动并观察 native engine、暴露控制面。Host 分发、管理、分配权限、授权 connector，并 mount worker 配置 micro-app 来配置它。Host 不 spawn/观察/持有 engine 进程，也不是领域工作流、产品后端、通用 agent runtime、仓库 dashboard 或 Soul App 配置中心。

## Monorepo Boundary

- `apps/*`：可运行产品壳，例如 CLI 与 Web。
- `souls/*`：descriptor-producing Soul App 产品包。
- `packages/*`：协议、runtime、daemon、storage、projection、engine bridge、SDK、workbench、fs layout、UI 等可复用能力。

禁止创建 `core-v2` / `shared-v2`。`packages/core` 与 `packages/shared` 最终消失。`apps/api` 迁移为 `packages/worker-daemon`。

`worker-*` 包禁止 import `host-*` 包。Worker 必须能脱离 Host 独立运行。

## Protocol Boundary

Host/Soul 是 descriptor-only：Host 只消费 `dist/soul.descriptor.json`、built mounted assets 和 app-owned API proxy。Host 不读 Soul source、不 import Soul 私有模块、不解释领域字段。

Production mounted workbench 必须使用 micro-app `router-mode="search"`。Worker daemon 解析 workbench entry；Host 传 locator context 并 mount；Soul 拥有内部 routes、领域 UI 和 app-owned API。

## Runtime Boundary

Session 只保留 lifecycle：`active | archived | deleted`。Execution/process 状态属于 `engine_invocations`。

Follow-up API 是 session-level：

```text
POST /api/sessions/:sessionId/invocations
```

Native engine 采用 B+ structured bridge。Worker 管 projection、process observation、redacted raw chunks、normalized bridge events、opaque external refs、cancel、reattach、reconciler、engine 启动；native engine 自己管理模型、tool loop、approval、sandbox、auth/profile 和 native session。

Author-owned native MCP files may contain literal secrets, but AIWorker must not copy secrets into descriptor, DB, receipt, log, diagnostic output, OpenAPI example, or UI.

## Workflow

Use Superpowers for brainstorming, non-trivial planning, TDD, systematic debugging, and verification before completion.

Destructive refactor is allowed before 1.0. Keep changes scoped to the current phase. Do not change the new architecture to satisfy old E2E assumptions.

If a task depends on an accepted `tmp/refactor` decision, promote it to canonical docs or tests before implementation; tmp/refactor accepted decisions must be promoted to canonical docs or tests before implementation.

Code changes need focused contract tests appropriate to scope. Before final completion, run the smallest fresh verification that proves the touched surface. For code changes, run code-review-graph unless the change is docs-only, instruction-only, or pure formatting.

## UI

UI work must use shadcn-managed primitives and `packages/ui` as the shared UI source. Do not create ad-hoc component systems. Host must not render Soul domain UI; Soul-specific UI stays in `souls/*`.
