# 真实流程 E2E 修复分批计划设计

## 背景

`tmp/real-e2e-audit-2026-05-24/` 记录了一轮真实 operator 路径 E2E 审计。审计覆盖真实
`~/.aiworker-dev`、local daemon/API/Web、官方 Soul Apps、mounted micro-app surface、Codex CLI
和 Claude Code CLI。

审计结果证明 CLI 到 Codex 的真实 session 路径可写入 workspace artifact，但 Web 到 Claude Code
路径在 300 秒后失败，并暴露出 mounted workbench 失败态恢复、QA workspace locator 传递、
Worker Configuration 边界和 engine readiness API 契约问题。

本设计把这些发现收敛为可直接进入 PMA 的分批修复计划。它不做实现，不替代
`docs/architecture.md#constraint-registry`，也不把 Host 拉回通用 agent runtime 或领域工作流。

## 目标

- 优先恢复 Web 发起真实 session 后的失败态可恢复性。
- 保证 mounted Soul App surface 收到当前 worker/workspace/session 的窄 locator/context。
- 收口 Worker Configuration，使其只承载 worker-scoped Host shell preference、worker overlay/local
  enablement 和 manifest-derived 泛化选项。
- 对齐 `/api/local/settings/engines` 的文档、OpenAPI 和实现契约。
- 每批修复都有独立验收、聚焦测试和回归证据，便于 PMA 拆任务、实施和审查。

## 非目标

- 不让 Host 解释 HR/QA 领域状态、领域 artifact、profile、review 或 release verdict。
- 不在 Host Web 中重新实现 universal workbench renderer。
- 不把 workspace/session 变成 Host configuration scope。
- 不为 Claude Code 实现新的 tool loop、approval loop、sandbox 或 profile 管理。
- 不重写真实 E2E harness。本轮先修复已证实的产品阻塞和契约漂移。

## 证据来源

- 审计报告：`tmp/real-e2e-audit-2026-05-24/final-report.md`
- 缺陷台账：`tmp/real-e2e-audit-2026-05-24/findings.md`
- Claude Code 失败证据：
  - `commands/web-claude-session-show-late.txt`
  - `commands/web-claude-session-events-current.json`
  - `commands/web-claude-session-turns-current.json`
  - `browser/web-task5-failed-session-dom.json`
  - `screenshots/web-task5-failed-session-selected.png`
- mounted QA locator 证据：
  - `browser/web-qa-mounted-desktop-layout.json`
  - `commands/api-workspaces-after-web-task4.json`
- Worker Configuration 边界证据：
  - `browser/web-hr-worker-config.dom.txt`
  - `browser/web-qa-worker-config.dom.txt`
  - `screenshots/web-hr-worker-config-stable.png`
  - `screenshots/web-qa-worker-config-stable.png`
- engine readiness 404 证据：
  - `commands/engine-readiness.json`
  - `commands/engine-readiness-http.json`

## 推荐分批

### Batch 1: Claude Code session timeout 和失败态恢复

**目的**：先解除 P1。Web 发起真实 session 即使失败，也必须显示明确终态并恢复可操作输入。

**涉及面**：

- `packages/core/src/worker/executor.ts`
- `packages/core/src/worker/runtime.ts`
- `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`
- `packages/soul-app-workbench/src/universal-workbench/SessionDetail.tsx`
- `packages/soul-app-workbench/src/universal-workbench/timeline/SessionTimeline.tsx`
- `packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts`
- focused tests under `packages/core/src/worker/` and `packages/soul-app-workbench/src/universal-workbench/`

**设计要求**：

- Host 仍只拥有 engine invocation boundary。timeout 是 Host 对本地子进程调用的边界保护，不是 Host
  接管 Claude Code 的 tool loop。
- 将当前 `300_000` hard timeout 提升为明确常量或可测试的 executor option。若后续需要 operator
  可调 timeout，应作为独立设置设计；本批只消除魔法值并补可验证行为。
- API 终态已落库为 `session.status=failed`、`turn.status=failed` 时，mounted universal workbench
  必须以终态为准，不继续显示 `Session running`。
- `composerBusy` 只能由本地提交中状态或真实 running turn 决定。failed/completed turn 不应让 follow-up
  composer 进入 `Sending...` 或 disabled。
- 同一 backend error event 和 `turn.error` fallback 不应重复渲染成两条相同错误，也不能产生重复
  React key。
- 失败态应保留错误细节，但用户可在 engine readiness 仍为 ready 时继续输入下一轮或创建新 session。

**验收标准**：

- 使用审计中的 failed session fixture 能渲染 `failed`，不显示 `Session running`。
- 失败详情中 timeout 错误只出现一次。
- React console 不再出现 duplicate key `371`。
- failed session 的 follow-up composer 在 selected engine ready 时恢复可提交。
- Core executor/runtime 测试覆盖 timeout failure 的 session/turn/invocation/event 终态。

### Batch 2: mounted surface workspace locator 传递

**目的**：修复 QA Web 创建 workspace 后 mounted URL/data 缺少 `workspaceId` 的 P2。

**涉及面**：

- `apps/web/src/worker/studio/locator.ts`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/studio/mounted-surface.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`

**设计要求**：

- `/workers/:workerId/workspaces/:workspaceId` 仍只是 Host locator route，不是 Host workspace
  configuration。
- Web 创建 workspace 成功后，`selectedWorkspaceId`、route state 和刷新后的 locator 推导必须稳定指向
  新 workspace。
- `MountedSoulAppRouteSurface` 的 `workspaceId` prop、micro-app URL query、micro-app host data 三者保持一致。
- 对没有 workspace 的 worker home route，可以继续只传 `workerId`；但当 selected workspace 存在时不得丢失。
- 不在 Host Web 中为 QA 或 universal workbench 增加 route-id 特判。

**验收标准**：

- Web test 模拟创建 QA workspace 后，`micro-app[name="aiworker-qa--universal-workbench"]` 的 `url`
  包含新 `workspaceId`。
- micro-app element data 包含同一个 `workspaceId`。
- HR 已有 workspace mounted URL 回归保持通过。
- `scripts/check-soul-app-boundaries.ts --completion-audit` 不发现 Host import Soul workbench 或 special-case。

### Batch 3: Worker Configuration 边界收口

**目的**：修复 Worker Configuration 暴露 workspace projection 语义的 P2，使 Host chrome 符合 CONFIG-001。

**涉及面**：

- `apps/web/src/worker/worker-configuration-dialog.tsx`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- 如需保存新的 worker-scoped preference，才触及 local storage helper 或现有 preference helper。

**设计要求**：

- Worker Configuration 只面向当前 Soul worker。
- 保留 worker overlay assets 管理，因为它是 worker-owned local enablement。
- 保留 worker-scoped workbench route preference，因为它只保存 declared micro-app route id，且 keyed by worker id。
- 移除或迁出 Host-owned configuration chrome 中的 workspace `Projection` 面板、workspace name、`No workspace
  selected` 和 workspace projection 操作。
- 如果仍需要手动 workspace asset projection，应放在 workspace context surface、Soul-owned micro-app 或后续单独设计的诊断入口中，不挂在 Worker Configuration。
- 不让 Soul App 向 Host left panel、header、toolbar 或 Worker Configuration slot 注册自定义 UI。

**Component Library Preflight**：

- 继续使用 `packages/ui` 的 `Dialog`、`Sidebar`、`Item`、`Badge`、`Button`、`Switch`、`ScrollArea`。
- 不新增 lucide 图标；图标继续使用当前 hugeicons preset。
- app-local UI 归属仅限 Host-owned Worker Configuration shell 和 worker overlay 编辑体验。
- 本批有可见 UI 变更，完成时必须运行 `bun run ui:check`。

**验收标准**：

- Worker Configuration dialog 不再出现 `Projection`、`Workspace: ...`、`No workspace selected`、
  `Run projection` 或 workspace projection 说明文案。
- overlay asset enable/create/duplicate/delete/edit 仍可用。
- 多 workbench route 的 worker 仍可在 worker scope 下选择 active route；不同 worker 的选择互不影响。
- Web tests 覆盖 HR/QA configuration dialog 的边界文案和 worker-scoped preference。

### Batch 4: engine readiness API 和文档契约对齐

**目的**：修复 `/api/local/settings/engines` 404 和 docs/审计预期漂移。

**涉及面**：

- `apps/api/src/modes/worker.ts`
- `apps/api/src/modes/worker/openapi.ts`
- `apps/api/src/modes/worker.local.test.ts`
- `docs/executor-engines.md`
- 必要时同步 `docs/deployment.md` 中关于 settings scan/test 的描述。

**设计要求**：

- 推荐补 `GET /api/local/settings/engines`，返回与 `/api/local/settings` 中 `settings.engines` 一致的非 secret engine status，
  以及当前 `engineId`、`executionMode`。
- endpoint 只读，不 spawn CLI，不读取 secret 内容，不保证外部 engine runtime 权限隔离。
- `POST /api/local/settings/engines/rescan` 和 `/test` 保持原行为。
- OpenAPI 文档必须包含该 route，避免后续真实 E2E 再把 404 记录成产品缺陷。

**验收标准**：

- `GET /api/local/settings/engines` 返回 200。
- body 至少包含 `engines`、`engineId`、`executionMode`。
- focused API test 覆盖 endpoint 和 OpenAPI path。
- `docs/executor-engines.md` 明确 readiness 不等于 Host 接管 engine auth/profile/plugin/sandbox。

## 执行顺序

1. Batch 1 先做。它解除真实 Web session 的 P1 阻塞，也减少后续 E2E 的状态污染。
2. Batch 2 第二。workspace locator 是 mounted Soul surface 的基础上下文，影响所有 workspace-scoped
   app-owned work。
3. Batch 3 第三。它是边界收口和 UI 变更，适合在 P1/P2 数据流稳定后处理。
4. Batch 4 最后。它最小、独立，但会影响文档和 OpenAPI，可以与前三批分开审查。

## 测试策略

每批先加失败测试，再实现。最终至少运行：

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-web' test
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun scripts/check-soul-app-boundaries.ts --completion-audit
bun run ui:check
```

代码变更完成后运行：

```bash
bun run crg:update
bun run crg:review
```

若 Batch 1 或 Batch 2 修改 shared protocol/schema，再补：

```bash
bun run --filter '@zonease/aiworker-shared' test
bun run --filter '@zonease/aiworker-soul-app-runtime' test
```

## PMA 落地建议

进入 implementation planning 时创建或更新 4 个 PMA task/plan：

- `BUG`: Web Claude Code session timeout/recovery。
- `BUG`: mounted QA workspace locator missing from micro-app context。
- `BUG`: Worker Configuration leaks workspace projection scope。
- `BUG` 或 `DOC`: local settings engines endpoint contract drift。

每个 PMA task 应包含：

- 真实 E2E 证据路径。
- 对应 Constraint Registry ID。
- 涉及文件。
- focused test 命令。
- 通过后是否需要重新运行真实 E2E 子路径。

## 风险与缓解

- **真实 Claude Code 仍可能因为外部模型或账号状态失败**：Batch 1 不承诺让外部 engine 总成功，只承诺失败清楚、可恢复、不会卡 UI。
- **timeout 可调性扩大范围**：本批只命名和测试现有 hard timeout 行为；operator 可配置 timeout 另立设计。
- **Worker Configuration 移除 projection 后用户少一个显式入口**：这是边界修复。若手动 projection 仍是产品需要，应在 workspace/Soul-owned surface 中重新设计。
- **settings endpoint 与 `/api/local/settings` 重复**：重复只限只读 projection，目的是稳定公开契约和文档，不新增第二套保存逻辑。

## 完成定义

- 4 个 batch 都有 PMA task/plan 或明确拆分依据。
- P1 failed session fixture 不再阻塞 follow-up 输入。
- QA mounted surface 在 selected workspace 存在时收到 `workspaceId`。
- Worker Configuration 不展示 workspace projection configuration 语义。
- `/api/local/settings/engines` 不再 404，或如果实施时决策为删除该 endpoint，则文档、审计计划和测试全部同步删除预期。
- 真实 E2E 后续复测至少覆盖 Batch 1 和 Batch 2 的原复现路径。
