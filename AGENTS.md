# AIWorker Agent Bootstrap

默认用中文与用户交流。文档、代码注释、commit message、PR title/description 也默认中文，除非用户另有要求。

## Authority

AIWorker 当前合同只看 canonical docs：

- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`

Temporary drafts live in `tmp/`。旧 changelog、历史 E2E、旧 project-local skills 只可作为证据，不能覆盖 canonical docs。tmp/refactor accepted decisions must be promoted to canonical docs or tests before implementation。

## Product Boundary

AIWorker 的核心 = 让一个懂行的人，把一套专业能力做成 Soul、快速迭代，再低成本复制给一群不懂技术的员工；每个员工因此拥有一个开箱即用的专属 AI 工作者。

Soul = 能力载体；Host = 迭代 + 复制的杠杆；Worker = 员工侧开箱即用的终端。一个人的能力 → 全员的产能。

Worker 是自治 CLI-first 运行体，拥有 engine 启动权；Host 是可选控制面：Soul 发布 / 分发 / 管理 / 权限分配 / connector 授权 / Worker provisioning（Phase 2）。

v1 只发 standalone Worker：Host 与 control-protocol 全是 Phase 2，永不在运行热路径上。Worker 创建时绑定一个 Soul（终生不变），拥有并直接渲染自己的 Workbench。默认路径：

```text
Worker -> Workbench -> workspace -> session (chat) -> native engine
```

Workbench 管 workspace、workspace 下的 session（= chat composer + view）、以及 worker 自配置。Soul 是 template：descriptor-only 的 skills / mcp / entry-file（如 AGENTS.md、CLAUDE.md）资产束，没有 UI、没有 app-owned API、没有 capability。

## Monorepo Boundary

- `apps/*`：可运行产品壳（worker-cli、worker-web；host-* 为 Phase 2 休眠桩）。
- `souls/*`：descriptor-producing Soul template 包。
- `packages/*`：协议、runtime、daemon、storage、projection、engine bridge、SDK、fs layout、UI 等可复用能力。

禁止创建 `core-v2` / `shared-v2`。`packages/core` 与 `packages/shared` 最终消失。`apps/api` 迁移为 `packages/worker-daemon`。

`worker-*` 包禁止 import `host-*` 包。Worker 必须能脱离 Host 独立运行。Workbench 并入 `apps/worker-web`，不再有 soul-workbench / soul-app-runtime 包。

## Protocol Boundary

Host/Soul 是 descriptor-only：Host 与 Workbench 只消费 `dist/soul.descriptor.json`，不读 Soul source、不 import Soul 私有模块、不解释领域字段。

Worker 拥有并直接渲染 Workbench；v1 没有 micro-app、没有 mounted-workbench、没有 Soul 提供的 UI。Phase 2 Host 不 mount / frame / render Worker Workbench。Phase 2 允许 Worker 主动 check-in Host 并建立 Worker Access reverse tunnel；这些只属于分发/访问闭环，不让 Host 进入 Worker runtime 热路径。Descriptor v1 极简：`protocol / identity / engine` 资产束，无 workbench / api / capability。

## Runtime Boundary

Session 只保留 lifecycle：`active | archived | deleted`。Execution/process 状态属于 `engine_invocations`。Follow-up API 是 session-level：

```text
POST /api/sessions/:sessionId/invocations
```

Engine target 默认 worker、可 session 覆盖。Native engine 采用 B+ structured bridge。Worker 管 projection、process observation、redacted raw chunks、normalized bridge events、opaque external refs、cancel、reattach、reconciler、engine 启动；native engine 自己管理模型、tool loop、approval、sandbox、auth/profile 和 native session。

Author-owned native MCP files may contain literal secrets, but AIWorker must not copy secrets into descriptor, DB, receipt, log, diagnostic output, OpenAPI example, or UI.

## Workflow

Use Superpowers for brainstorming, non-trivial planning, TDD, systematic debugging, and verification before completion.

Destructive refactor is allowed before 1.0. Keep changes scoped to the current phase. Do not change the new architecture to satisfy old E2E assumptions.

Code changes need focused contract tests appropriate to scope. Before final completion, run the smallest fresh verification that proves the touched surface. For code changes, run code-review-graph unless the change is docs-only, instruction-only, or pure formatting.

## UI

UI work must use shadcn-managed primitives and `packages/ui` as the shared UI source. Do not create ad-hoc component systems. Soul provides no UI; the Worker owns and renders the Workbench. Host must not render Soul domain UI.
