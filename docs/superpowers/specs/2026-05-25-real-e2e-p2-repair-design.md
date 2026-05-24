# 真实 E2E P2 修复批次设计

## 背景

`tmp/real-e2e-regression-2026-05-24/` 记录了修复后的一轮真实 operator 路径 E2E 回归。该轮没有发现
P0/P1；CLI、Web、mounted locator、Worker Configuration 边界和 installed-home 抽检均可完成。但
`findings.md` 登记了四个 P2：

- HR mounted micro-app 首次加载出现 React hydration mismatch。
- HR/QA mounted workspace 和 selected session 在 390px narrow viewport 下不可用。
- Worker Configuration 390px narrow dialog 中 selected overlay editor 被挤出视口。
- Claude Code succeeded turn 的 completed transcript 仍显示历史 `Session running` / `running` chips。

本设计把这四个 P2 作为一个修复批次收口。它不扩大到新 E2E harness、release 流程、engine tool loop 或
Host/Soul 架构改造。

## 目标

- 消除本轮四个 P2 finding，使下一轮真实 E2E 不再记录相同问题。
- 保持当前产品路径：`AIWorker -> Soul App -> workspace -> session -> app-owned work`。
- 保持 Host 只拥有 start、shell、locate、mount 和 bridge。
- 让 390px narrow viewport 下 HR/QA mounted workbench、selected session 和 Worker Configuration 都可操作。
- 区分 session container 的 active 状态和 turn 的 terminal 状态，避免 completed turn 被历史 running signal 误导。
- 为每项修复补聚焦测试、UI governance、boundary check 和 browser-backed regression 证据。

## 非目标

- 不新增或重写真实 E2E harness。
- 不让 Host Web 实现 HR/QA domain renderer、profile、review、release verdict 或 workspace/session domain config。
- 不把 workspace/session 变成 Host configuration scope。
- 不新增 Host 对 universal workbench 的 route-id 特判。
- 不新增 lucide 图标、独立 UI 框架、任意 Host-owned 领域工作流或跨 Soul 编排。
- 不处理未安装 engine 的真实执行路径，也不改变 Claude Code、Codex 或其他外部 engine 的 auth/profile/plugin/sandbox 行为。

## 推荐方案

采用“一个 P2 修复批次，三条边界线并行收口”的方案。

### 方案 A：按边界分 3 条修复线，同一批交付

这是推荐方案。

- HR hydration mismatch 在 `apps/aiworker-hr` 修，保持 app-owned mounted route。
- narrow universal workbench 和 completed transcript chip 在 `packages/soul-app-workbench` 修，保持 Soul-owned micro-app surface。
- Worker Configuration narrow dialog 在 `apps/web` 修，因为 dialog shell 是 Host-owned worker-scoped chrome。

优点是边界清楚、测试聚焦、不会把 Soul App 领域 UI 拉回 Host。缺点是同一批会触及三个 package，需要较完整的 focused gate 和 browser regression。

### 方案 B：按 finding 拆 4 个独立 bug

每个 finding 单独 task/plan，审查粒度最细。但文档和验证会碎，最终仍需要共同跑 UI/browser gate。对于这轮“全部收口”来说管理成本偏高。

### 方案 C：先修 narrow layout

最快改善 390px 可用性，但 hydration mismatch 和 completed transcript chip 会继续污染真实 E2E 报告，不符合本轮收口目标。

## 架构边界

### HR hydration

归属：`apps/aiworker-hr`。

HR People Workbench 的 mounted route 是 app-owned product surface。修复必须在 HR app-owned UI 内完成，不让 Host Web 隐藏或补写 HR 文案。目标是让服务端首屏 HTML 与 client hydrate 初始树一致。如果 profile count 等动态文本在客户端才可靠，就服务端和客户端都使用同一个稳定 fallback；如果服务端已经能提供同一份初始数据，就两边使用同一份数据。

证据：

- `tmp/real-e2e-regression-2026-05-24/browser/web-desktop-console-errors.json`
- `tmp/real-e2e-regression-2026-05-24/browser/web-desktop-shell.snapshot.md`

### Universal workbench narrow layout

归属：`packages/soul-app-workbench`。

Universal workbench 是 Soul-owned mounted micro-app surface。修复应让它在 narrow viewport 下切换成可操作单列或折叠布局，而不是让 Host 调整 micro-app 内部领域布局。Host 仍只提供 mount container、theme/context data 和 locator。

390px 下应满足：

- workspace/session main work area 占满可用宽度。
- sidebar 不与 main 并排挤压，可以折叠、置顶、变成短列表或进入可滚动区域。
- detail rail 不与 chat/main 并排挤压，可以折叠、下移或保持 collapsed。
- session chat、timeline 和 composer 不被压成右侧细条。
- 文本、status chip、button、composer controls 不逃出 micro-app viewport。

证据：

- `tmp/real-e2e-regression-2026-05-24/screenshots/web-qa-mounted-narrow.png`
- `tmp/real-e2e-regression-2026-05-24/browser/web-qa-mounted-narrow-deep-overflow-analysis.json`
- `tmp/real-e2e-regression-2026-05-24/screenshots/web-hr-mounted-narrow.png`
- `tmp/real-e2e-regression-2026-05-24/screenshots/web-session-detail-narrow.png`
- `tmp/real-e2e-regression-2026-05-24/browser/web-session-detail-narrow.layout.json`

### Completed transcript status

归属：`packages/soul-app-workbench`。

Timeline 以 turn 状态为准显示历史 transcript。`session.status=active` 仍可以表示 conversation container 可继续 follow-up；但当 turn 已经 `succeeded`、`failed`、`completed` 或其他 terminal 状态时，历史 running/status signal 不能继续显示成 `Session running` 或 `running` chip。

数据流要求：

- `LocalSessionEvent` 仍原样来自 mounted API。
- `normalizeSessionEvents` 和 `createSessionTimelineViewModel` 负责把 event + turn 合成 view model。
- terminal turn 的 stale non-terminal signal 应被过滤或降级，不影响真实 terminal status。
- running placeholder 只出现在实际 running turn 或本地正在 submit 的状态。

证据：

- `tmp/real-e2e-regression-2026-05-24/browser/web-claude-completed-session.snapshot.md`
- `tmp/real-e2e-regression-2026-05-24/screenshots/web-claude-completed-session.png`
- `tmp/real-e2e-regression-2026-05-24/commands/web-claude-session-summary.json`

### Worker Configuration narrow dialog

归属：`apps/web`。

Worker Configuration 是 Host-owned chrome，scope 只到当前 Soul worker。修复 narrow layout 时只能调整 worker-scoped overlay/configuration shell，不新增 workspace/session configuration 入口，不恢复 projection panel，不让 Soul App 注册 Host chrome slot。

390px 下应满足：

- dialog frame 保持 viewport 内。
- overlay asset list 和 selected editor 不再固定并排挤压。
- selected editor 使用完整可用宽度显示。
- create/edit/toggle/duplicate/delete 等 worker overlay 操作仍可达。
- workbench route preference 仍按 worker scope 存储，且不同 worker 隔离。

证据：

- `tmp/real-e2e-regression-2026-05-24/screenshots/web-worker-config-narrow.png`
- `tmp/real-e2e-regression-2026-05-24/browser/web-worker-config-narrow.layout.json`
- `tmp/real-e2e-regression-2026-05-24/browser/web-worker-config-narrow-dialog-overflow.json`

## 组件设计

### HR People Workbench

检查 `apps/aiworker-hr/product/web/people-workbench` 的 server render 与 client entry 初始化路径。首选做法是复用同一份 initial model/copy，而不是对 console warning 做 suppress。测试应证明 static render 和 hydrated client 首屏标题/detail 文案一致。

### UniversalWorkbenchApp

调整 root layout 的 responsive behavior：

- desktop 保留 sidebar + main + optional detail rail 的工作台布局。
- narrow 切成 `max-md:flex-col` 或等价结构，sidebar/detail 不再作为横向固定宽度 sibling 挤压 main。
- sidebar collapsed/expanded state 在 narrow 下不应造成 main 只剩很窄宽度。
- selected session 时 chat view 优先可读，detail rail 默认不占横向空间。

### SessionChatView / SessionDetail

SessionChatView 的 header、badge、timeline、composer 需要在 narrow 下保持 `min-w-0`、wrap/truncate 和完整宽度。SessionDetail 在 narrow 下可以作为下方 section 或 collapsed rail，但不能作为固定 sibling 挤压 main。

### Timeline view model

在 view-model 层处理 terminal turn 的 stale running signal，避免纯 render 层条件分散。已存在 failed terminal 的测试思路可以扩展到 succeeded terminal：如果同一 turn 包含 `running` / `requesting` / `streaming` 等历史 event，但 turn 终态为 `succeeded`，最终 timeline 不应渲染 `Session running` 或 running chip。

### WorkerConfigurationDialog

调整 dialog body：

- desktop 保持左侧 asset list、右侧 editor。
- narrow 使用单列布局；asset list 在上方且高度受控，editor 在下方完整宽度。
- `worker-overlay-asset-list` 的 orientation/test marker 反映 responsive 行为，便于 Web test 断言。
- 保持现有 Dialog、Sidebar、Item、ScrollArea、Textarea 等 shared primitives，不新增手写 focus trap、scroll lock 或键盘导航。

## Component Library Preflight

本批是可见 UI 修复，完成时必须运行 UI governance。

已检查并继续使用的 shared primitives：

- `Dialog`
- `Sidebar`
- `Item`
- `Button`
- `Badge`
- `Switch`
- `ScrollArea`
- `Textarea`
- `ManagedSessionComposer`
- `Card`
- `Empty`
- `Collapsible`

图标继续使用当前 shadcn preset 的 hugeicons：`@hugeicons/core-free-icons` + `HugeiconsIcon`。不新增 `lucide-react`。

app-local UI 归属：

- `apps/aiworker-hr`：HR app-owned People Workbench 领域 UI。
- `packages/soul-app-workbench`：Soul-owned universal mounted workbench。
- `apps/web`：Host-owned Worker Configuration shell 和 worker overlay editor。

样式约束：

- 使用 shadcn semantic variables、Tailwind v4 utilities 和 package-owned tokens。
- 不新增 hex 字面量或 arbitrary color value。
- 不新增 nested cards、异常大圆角、多层边框或 landing-page style 装饰。
- 390px、desktop、light/dark 均要检查可读性和控件可达性。

## 错误处理

- Hydration mismatch 修复后，不应通过 console suppression 隐藏真实 mismatch。
- Universal workbench narrow layout 不改变 mounted API error 行为；只保证 error/status/composer 在 narrow 下可见。
- Completed transcript status 修复不删除原始 events，只改变 view model 对 terminal turn 的展示。
- Worker Configuration narrow 修复不改变 worker overlay save/delete API；autosave failed 仍显示既有 error alert。

## 测试策略

### Focused tests

优先补或调整以下测试：

- `apps/aiworker-hr/product/web/component-proof.test.tsx` 或相关 HR host-adapter test：证明首屏 profile list 文案稳定，不产生 server/client 初始文本漂移。
- `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`：覆盖 narrow layout structure/class、terminal succeeded turn stale running signal 过滤。
- `packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model` 相关测试：覆盖 succeeded/failed terminal turn 不保留 stale running signal。
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`：覆盖 Worker Configuration narrow layout orientation/class 与 overlay editor 可达结构。

### Verification commands

聚焦 gate：

```bash
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-web' test
```

UI 与边界 gate：

```bash
bun run ui:check
bun scripts/check-soul-app-boundaries.ts --completion-audit
```

代码审查：

```bash
bun run crg:update
bun run crg:review
```

若实现触及 shared protocol、runtime harness 或 mounted service contract，再追加对应 package test/typecheck。

### Browser-backed regression

实现后启动本地 dev，用 desktop 和 390px 复查：

- HR mounted route 首次加载 console 不再出现 hydration mismatch。
- HR/QA mounted workspace 在 390px 下 main work area 不再被压缩成细条。
- selected completed session 在 390px 下 chat/timeline/composer 可读可操作。
- completed Claude Code turn 不再显示历史 `Session running` / `running` chip。
- Worker Configuration 390px 下 selected overlay editor 完整可见。
- 不出现 document-level horizontal overflow、dialog descendant 大量 clipped overflow、micro-app 空白或 mount error。

复查证据应保存到新的 `tmp/` 子目录，命名可沿用本轮 evidence pattern。

## PMA 落地建议

进入 implementation planning 时创建一个 PMA task 和一个 PMA plan，名称建议：

- Task：`BUG-156 Real E2E P2 regression repair batch`
- Plan：`PLAN-413 Real E2E P2 regression repair batch`

该 task/plan 覆盖四个 P2 finding，并在 checklist 中分四个实现单元：

1. HR hydration mismatch。
2. Universal workbench narrow layout。
3. Completed transcript stale running chip。
4. Worker Configuration narrow overlay editor。

实施时按 TDD 顺序推进：每个单元先补 failing/regression test，再做最小实现，再跑对应 focused test。最后跑 UI/boundary/browser/code-review graph gates 并同步 `docs/changelog.md`。

## 验收标准

- 四个 P2 finding 都有修复前证据、修复实现、自动化覆盖和修复后 browser evidence。
- 390px viewport 下 HR/QA mounted workspace、selected completed session、Worker Configuration 均可操作。
- HR mounted route 首屏加载无 React hydration mismatch。
- Completed Claude Code turn 不再出现历史 `Session running` / `running` chip。
- Worker Configuration 仍只面向当前 Soul worker，不恢复 workspace projection 语义。
- Host Web 不 import Soul App `src`，不特判 universal workbench route id。
- `bun run ui:check` 和 `bun scripts/check-soul-app-boundaries.ts --completion-audit` 通过，或任何失败都有明确阻塞说明。
- 代码变更后完成 `bun run crg:update` 和 `bun run crg:review`。
