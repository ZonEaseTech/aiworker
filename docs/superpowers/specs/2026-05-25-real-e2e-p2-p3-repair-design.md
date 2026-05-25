# 真实 E2E P2/P3 修复批次设计

## 背景

`tmp/real-e2e-audit-2026-05-25/` 记录了一轮真实 operator 路径 E2E 审计。审计使用
`/Users/ben/.aiworker-dev`，覆盖 local daemon/API、Worker Web、官方 HR/QA Soul Apps、mounted
universal workbench、Codex CLI local-cli 和 Claude Code local-cli。

该轮没有发现 P0/P1。CLI Codex 和 Web Claude Code 都完成了真实 engine turn，并在 worker workspace
中产出 artifact。但最终 findings 仍记录 5 个 P2 和 1 个 P3。本设计把它们作为一个边界分层修复批次收口：

- P2: succeeded one-turn session 的顶层 `status` 仍为 `active` 且 `endedAt=null`。
- P2: HR mounted workbench 在 stream 400 后没有恢复到 succeeded Claude session/transcript。
- P2: HR universal composer 有默认 capability，但 visible select 为空，导致 Start disabled。
- P2: Worker Configuration 390px dialog 中 entry-file editor 控件被横向裁切。
- P2: 重复 visible worker name 让 Web 选择容易指向 stale context。
- P3: dev Web boot 期间存在 legacy `/api/local/artifacts` 404。

本设计不重跑审计、不改写 E2E harness，也不把 Host 拉回领域配置中心。后续 implementation plan 应从本 spec
拆出聚焦任务、测试和验证命令。

## 目标

- 消除本轮 5 个 P2 和 1 个 P3，使下一轮真实 E2E 不再记录同类 finding。
- 保持当前产品路径：`AIWorker -> Soul App -> workspace -> session -> app-owned work`。
- 保持 Host 只拥有 start、shell、locate、mount 和 bridge。
- 让 CLI/API/Web 对 succeeded one-turn session 的顶层终态表达一致。
- 让 mounted HR universal workbench 在 stream 创建或消费失败后能恢复到已创建/已完成 session。
- 让 composer 默认 capability、visible select 和 submit readiness 使用同一状态源。
- 让 Host-owned Worker Configuration 在 390px 下控件可达。
- 让 Web worker rows 在重复名称下有稳定 Host metadata 区分信息。
- 移除或显式支持 legacy artifact probe，减少无意图 404 日志噪声。
- 为每个 finding 补聚焦测试，并用 browser-backed evidence 验证可见 UI/real flow。

## 非目标

- 不新增 Host-owned HR/QA domain renderer、profile、review、release verdict 或 artifact lifecycle。
- 不把 workspace/session 变成 Host configuration scope。
- 不让 Soul App 注册 Host left panel、header、toolbar 或 Worker Configuration slot。
- 不让 Host 解释 Soul App capability、领域状态或业务确认语义。
- 不重写 mounted universal workbench 为 Host-local renderer。
- 不实现新的 engine tool loop、approval loop、sandbox、auth/profile 或 native session 管理。
- 不把 P3 legacy artifact route 扩展成新的 Host artifact product surface。
- 不以 smoke test 作为最终验收；本轮需要聚焦测试、UI governance、边界检查和浏览器证据。

## 推荐方案

采用“一个修复批次，四条边界线同批交付”的方案。

1. `packages/core` / `apps/api`：修 session 生命周期和 API/CLI/Web 终态一致性。
2. `packages/soul-app-workbench` / `packages/soul-app-runtime`：修 mounted stream recovery 和 composer 默认 capability。
3. `apps/web`：修 Host-owned Worker Configuration 窄屏布局和 worker row 重名区分。
4. `apps/web` / `apps/api`：追踪 legacy `/api/local/artifacts` 调用，移除旧 probe 或给出明确兼容响应。

该方案一次收口真实 E2E 报告里的所有 finding，且每个改动落在 owning surface。代价是跨包验证较重，必须在实现计划中拆清任务和 gate。

备选方案是先修 session/mounted/composer，再单独修 Host Web UI 和 P3；它风险较低，但会留下已确认的真实审查尾巴。另一个备选是顺手重整 session model、workbench 数据流和 locator UX；该范围过大，不适合本轮 P2/P3 修复。

## 架构边界

### Session lifecycle

归属：`packages/core`、`apps/api`，CLI/Web 只消费结果。

succeeded one-turn session 不应继续以顶层 `active` 表达“仍在执行”。本批把 successful turn 完成后的 session 顶层状态更新为 `completed`，并写入 `endedAt`。如果未来要支持显式 open conversation 或多轮 session 重新激活，应作为独立设计处理；本轮只修复当前一轮真实 CLI/Web session 成功后状态歧义。

要求：

- `LocalSession.status` 仍只允许 `active | completed | failed | cancelled`。
- `running` 继续只属于 turn、invocation 或 event 层。
- successful `runtime.startTurn` 更新 turn/invocation 为 succeeded 后，同步更新 session 为 completed。
- failed path 保持现有 `failed` + `endedAt` 语义。
- API stream 的 final `result.session` 和后续 list/detail snapshot 必须反映 completed session。
- Web timeline 可以继续显示 terminal turn，但不得依赖 `session.status=active` 推断仍在执行。

证据来源：

- `tmp/real-e2e-audit-2026-05-25/commands/cli-session-show-codex.txt`
- `tmp/real-e2e-audit-2026-05-25/api/claude-session-detail-current.json`
- `tmp/real-e2e-audit-2026-05-25/api/final-sessions.json`

### Mounted HR session recovery

归属：`packages/soul-app-workbench`、`packages/soul-app-runtime` 和 official app mounted adapter。

Universal workbench 是 Soul-owned mounted micro-app surface。Host 只负责 mount container、context data 和 mounted API proxy，不解释 HR domain output。修复应让 mounted workbench 在 `/api/sessions/stream` 请求失败或 stream 消费失败时，尽可能恢复到 Host/API 已创建的 session，并通过 app-owned mounted API 读取 session、turns、events。

要求：

- stream 创建路径继续使用 declared mounted API，不新增 Host 特判 route。
- 如果 HTTP status 非 2xx，workbench 要显示 error，并尝试按可用 session context 刷新当前 workspace 的 sessions。
- 如果 stream 已发出 `session` frame 后消费失败，UI 必须保留 created session、选中该 session，并刷新 detail。
- 刷新只 retry GET reads，不 retry POST session creation。
- succeeded turn 的 transcript/events/artifact 可通过 detail refresh 显示，不让用户停在 stale New Session。
- stream error event 可见，但不覆盖已成功完成的 session/turn 事实。

证据来源：

- `tmp/real-e2e-audit-2026-05-25/api/claude-session-detail-current.json`
- `tmp/real-e2e-audit-2026-05-25/api/claude-session-turns-current.json`
- `tmp/real-e2e-audit-2026-05-25/browser/claude-session-after-success-visible-text.json`
- `tmp/real-e2e-audit-2026-05-25/screenshots/claude-session-after-success.png`

### Composer default capability

归属：`packages/soul-app-workbench`。

Capability/template selector 是 Soul-owned universal workbench composer 的输入，不是 Host configuration。当前 hidden/native value 已有 `aiworker-hr.person-profile`，但 visible select 和 submit readiness 没有初始化到同一值。本批修复 `selectedTemplateId` 初始化。

要求：

- templates 非空且当前 selection 缺失或失效时，默认选中第一个 available template。
- visible select trigger、hidden/native form value、payload build 和 submit disabled 判断共用同一个 `selectedTemplateId`。
- template list 更新时，如果当前 selection 仍有效则保留；失效才落到新默认值。
- templates 为空时 submit disabled，并保留现有 disabled reason。
- 不在 HR app 或 Host Web 硬编码 `Person Profile`。

证据来源：

- `tmp/real-e2e-audit-2026-05-25/browser/claude-submit-disabled-controls.json`
- `tmp/real-e2e-audit-2026-05-25/browser/claude-form-validity.json`
- `tmp/real-e2e-audit-2026-05-25/browser/claude-capability-menu-dom.txt`

### Worker Configuration narrow layout

归属：`apps/web`。

Worker Configuration 是 Host-owned worker-scoped chrome。修复窄屏布局时只调整 worker overlay/local enablement shell，不新增 workspace/session/domain configuration。

390px 下应满足：

- dialog frame 仍在 viewport 内。
- overlay asset list 和 selected editor 不固定横向并排挤压。
- selected editor 使用完整可用宽度，entry-file controls 可见且可操作。
- `Enable .gitignore` 等控件不在视口外。
- autosave、create/edit/toggle/duplicate/delete 仍沿用现有 Host overlay API。
- UI 仍使用 `packages/ui` shadcn primitives 和 hugeicons preset。

证据来源：

- `tmp/real-e2e-audit-2026-05-25/screenshots/worker-configuration-narrow.png`
- `tmp/real-e2e-audit-2026-05-25/browser/worker-configuration-narrow-analysis.json`
- `tmp/real-e2e-audit-2026-05-25/browser/worker-configuration-narrow-layout.json`

### Duplicate worker identity

归属：`apps/web` Host locator chrome。

Worker rows 是 Host Web 的 locator UI。重复 visible name 时，Host 可以展示稳定平台 metadata 帮助 operator 区分，例如 short worker id、created date、status 或 workspace count。Host 不应解释 HR/QA domain meaning，也不应把 workspace/session 变成 configuration scope。

要求：

- 重名 worker rows 显示稳定 differentiator；非重名也可以显示简短 metadata，避免视觉跳动。
- `aria-label` / title 包含 worker id 或等价稳定身份，便于 audit/browser 选择。
- initial/persisted selection 遇到 route worker/workspace/session 时，以 explicit route/env locator 优先，不静默落回 stale selected worker。
- 现有按 Soul App 分组仍保留。
- 不新增领域字段，不读取 app-owned artifact/profile/review。

证据来源：

- `tmp/real-e2e-audit-2026-05-25/browser/duplicate-worker-selection-risk.json`
- `tmp/real-e2e-audit-2026-05-25/api/final-workers.json`
- `tmp/real-e2e-audit-2026-05-25/browser/web-desktop-layout.json`

### Legacy artifact 404

归属：先追踪调用方，再判定 `apps/web` 或 `apps/api`。

`GET /api/local/artifacts 404` 是 non-blocking P3，但它会污染真实 E2E 日志。当前架构下真实 business artifacts 属于 app-owned workspace 或 mounted app-owned API，不应被 Host Web 当成默认 product primitive。

要求：

- 若 Web 中存在旧 Host artifact probe，应移除或改走当前 app-owned surface，不再请求 `/api/local/artifacts`。
- 若该 route 仍是兼容 contract，应在 API 中返回明确只读兼容响应，并写入 OpenAPI/test。
- 不把 legacy route 扩展成新的 Host artifact 管理面。
- dev boot focused scan 不再出现无意图 404。

证据来源：

- `tmp/real-e2e-audit-2026-05-25/commands/dev-start.txt`
- `tmp/real-e2e-audit-2026-05-25/logs/final-runtime-state.txt`

## Component Library Preflight

本批包含可见 UI 修复。实现前后都要检查 `packages/ui` primitives，并在 closeout 记录 app-local UI 归属。

继续使用的 shared primitives：

- `Dialog`
- `Sidebar`
- `Item`
- `Button`
- `Badge`
- `Switch`
- `ScrollArea`
- `Textarea`
- `ManagedSessionComposer`
- `Empty`
- `Collapsible`

图标继续使用 `@hugeicons/core-free-icons` + `HugeiconsIcon`。不新增 `lucide-react`。

app-local UI 归属：

- `packages/soul-app-workbench`：Soul-owned universal mounted workbench composer/session UI。
- `apps/web`：Host-owned locator chrome、Worker Configuration shell 和 worker overlay editor。
- official HR/QA app adapter 只暴露 declared mounted API/manifest surface，不让 Host import app `src`。

样式约束：

- 使用 shadcn semantic CSS variables、Tailwind v4 utilities 或 package-owned tokens。
- 不新增 hex 字面量、arbitrary color value、nested cards 或异常大圆角。
- 390px 和 desktop 都要证明控件可达；light/dark 需要至少通过 UI governance 或截图证据检查。

## 数据流

### Successful session

```text
CLI/Web submit
  -> API create session / start turn
  -> LocalWorkerRuntime.startTurn
  -> executor succeeds
  -> turn.status=succeeded
  -> invocation.status=succeeded
  -> session.status=completed, endedAt=now
  -> stream result / list/detail snapshots expose terminal session
  -> Web/mounted UI render completed session and transcript
```

### Mounted stream recovery

```text
Mounted composer submit
  -> POST app-owned /api/sessions/stream via mounted proxy
  -> if session frame arrives: upsert and select session immediately
  -> consume stream frames into turns/events
  -> if stream fails: append visible stream error, preserve selected session
  -> refresh selected session detail via GET sessions/turns/events
  -> render recovered succeeded or failed terminal state
```

### Worker locator

```text
Route worker/workspace/session id
  -> derive locator state
  -> explicit route worker wins over persisted selected worker
  -> WorkerSwitcher displays worker name plus stable Host metadata
  -> MountedSoulAppRouteSurface receives selected worker/workspace/session locator
```

## 错误处理

- Session success path 不吞掉 executor partial metadata；只改变 session terminal metadata。
- stream recovery 不 retry POST，避免 duplicate session 或 duplicate engine turn。
- stream error 和 terminal succeeded turn 可以同时存在；UI 要清楚表达“stream 出错，但 session 已完成并可查看”。
- templates 为空时继续禁用 submit，并显示现有 disabled reason。
- Worker Configuration 窄屏只改布局，不改变 overlay save/delete error handling。
- legacy artifact route 如果保留为 compatibility endpoint，响应必须清楚标识为空/unsupported，而不是静默伪造 app-owned artifact。

## 测试策略

### Focused tests

- `packages/core/src/worker/runtime.test.ts`：successful turn 后 session `completed` 且 `endedAt` 非空。
- `apps/api/src/modes/worker.local.test.ts`：non-stream 和 stream session creation 的 final session snapshot 为 completed；OpenAPI 如涉及 legacy route 同步覆盖。
- `packages/soul-app-workbench/src/universal-workbench/client-entry*.test.tsx`：stream frame 到达后 failure 仍保留 selected session，并触发/允许 detail refresh。
- `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`：templates 非空默认选中第一个 template，Start 可用；templates 为空仍 disabled。
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`：Worker Configuration narrow 结构可达；重复 worker rows 显示 stable differentiator；explicit route selection 优先于 stale selected worker。
- 若移除 legacy artifact probe，补 Web test 证明 boot/data fetch 不再请求 `/api/local/artifacts`；若保留 API 兼容，则补 API test。

### Verification commands

聚焦 gate：

```bash
bun run --filter '@zonease/aiworker-core' test
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-web' test
```

UI/boundary gate：

```bash
bun run ui:check
bun scripts/check-soul-app-boundaries.ts --completion-audit
```

mounted browser evidence 前必须重建 official mounted client bundle：

```bash
bun run --filter '@zonease/aiworker-hr' build:client
bun run --filter '@zonease/aiworker-qa' build:client
```

代码变更后 closeout：

```bash
bun run crg:update
bun run crg:review
git diff --check
```

如实现触及 shared schema、storage migration、public protocol 或 release surface，再升级到 `bun run check`。

### Browser regression

使用 `tmp/real-e2e-audit-2026-05-25` 的 evidence scripts/selector 思路，另建修复证据目录，例如
`tmp/real-e2e-p2-p3-repair-2026-05-25/`。至少证明：

- CLI/API 或 controlled API fixture 中 succeeded session 顶层为 completed。
- HR mounted fresh workspace 直接输入 prompt 时 visible capability 为 `Person Profile`，Start 可用。
- stream failure/recovery fixture 中 selected session detail 可见，不停在 stale New Session。
- Worker Configuration 390px entry-file controls 可见可达。
- 重名 worker rows 在 desktop/narrow 下有 stable differentiator，target worker/workspace mounted URL 正确。
- dev boot focused scan 不再有 legacy `/api/local/artifacts` 404。

## PMA 同步

实现计划应创建或更新 `docs/task/` 和 `docs/plan/` 条目，并在完成后同步 `docs/changelog.md`。建议拆成一个总计划和以下子任务：

- session lifecycle terminal status
- mounted universal workbench recovery
- composer default capability
- Host Web locator and Worker Configuration UI
- legacy artifact probe cleanup

每个子任务都要写清 Host/Soul ownership、涉及文件、测试命令和 evidence path。

## 验收标准

- 本轮 6 个 finding 都有对应测试或浏览器证据。
- Host 没有 import Soul App `src`，也没有新增 Host-owned domain renderer。
- Worker Configuration 仍只到 Soul worker scope。
- workspace/session 仍只作为 locator/context 传给 mounted Soul surface 或 engine bridge。
- app-owned artifacts 仍留在 Soul App workspace 或 app-owned API，不被 Host product surface 接管。
- `bun run ui:check`、boundary check、focused package tests 和 code-review-graph 通过，或明确记录无法运行原因。
- 最终报告引用新的修复证据目录，而不是只引用旧 audit findings。
