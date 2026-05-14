# REFACTOR-055 Worker Web Soul rail and worker identity

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 23:58
- **claimedAt**: 2026-05-11 00:08
- **completedAt**: 2026-05-11 00:35
- **plan**: PLAN-232
- **relatesTo**: apps/web, apps/api, packages/shared, docs/architecture.md, GOALS.md

## 背景

当前 Worker Web 已经把首页收敛为 Soul workspace，但左侧仍更像竖向表单面板：
先显示当前 Soul，再用网格列出 Soul，再在下方列出模板。用户反馈希望左侧导航按
Open Design 式横向 Soul 选择组织：选中某个 Soul 后，直接展示该 Soul 的能力模板，
并复用现有列表样式。

同时当前 UI 通过 `soulId -> first worker` 隐式选择 worker。虽然 local daemon 已经有
`/api/local/workers` 与 worker 列表，用户在界面上无法确认自己正在使用哪个 worker，
也无法理解同一 host 下多个 worker 的运行边界。

## 目标

1. 将首页左侧 Soul 选择改成 OD-style 横向 Soul rail，不再把 Soul 作为普通表单项。
2. 选中 Soul 后，在其下直接展示该 Soul 的 capability template list，复用现有 template
   list 与 review rubric 展示。
3. 在首页和 workspace/session route 都显式展示当前 worker identity：worker name、
   `workerId`、status、default engine、所属 Soul。
4. 保持当前 worker/workspace/session 数据契约，不把 Soul 退化成 project metadata。
5. 用测试和浏览器验证证明用户能看清当前 Soul worker，并能切换 Soul 后看到对应模板和
   worker 上下文。

## 验收标准

- 首页左侧顶部是横向可滚动 Soul 选择，不再是竖向 Soul card grid。
- 每个 available Soul 关联的 worker 状态可见；coming soon Soul 仍不可执行且视觉弱化。
- 选中 Soul 下方直接展示该 Soul 的能力模板列表，现有 template list 交互继续可用。
- 创建 workspace 时仍调用对应 `workerId` 的
  `/api/local/workers/:workerId/workspaces`，并写入选中 `soulId` 与模板 metadata。
- Workspace/session route 的上下文 rail 显示当前 worker，而不是只显示 Soul/domain。
- Focused Web tests、Web typecheck/lint/test/build、browser smoke 和 code-review-graph 通过。

## 调查结论

- `GOALS.md` 和 `docs/architecture.md` 都要求 `1 host -> 1 local daemon -> N Soul workers`，
  选择 Soul 的产品动作应落为进入或创建对应 Soul worker。
- `apps/api/src/modes/worker.ts` 已在启动时为 available Souls 初始化 `hr-worker`、
  `pm-worker`、`qa-worker`、`devops-worker`，并暴露 `/api/local/workers` 与
  `/api/local/workers/:workerId`。
- `apps/web/src/worker/api.ts` 已加载 `workers`、`souls`、`templates`、`workspaces` 等完整
  首页数据。
- `apps/web/src/worker/worker-studio.tsx` 当前通过
  `data.workers.find(worker => worker.soulId === selectedSoul?.id)` 隐式解析
  `selectedWorker`，但渲染层没有显式 worker 管理区域。
- 当前 Soul UI 位于 `soul-catalog-panel` 内的 `.soul-picker-list` 竖向网格；模板 UI 位于
  `.capability-panel .template-picker-list`，可以保留模板 list 并调整上层布局。

## 风险

- 如果把 worker 管理做成 fleet/admin 表格，会违反当前 Worker Web 的首屏目标；本任务只做
  local daemon 内的 Soul worker identity 和选择可见性。
- 后端目前是每个 available Soul 一个 deterministic worker。若未来支持同一 Soul 多个
  worker，本任务应保留展示 `workerId` 的空间，但不提前设计复杂 worker 创建/删除流。
- 横向 Soul rail 需要处理窄屏溢出，不能造成首页或 session route 水平滚动。

## Resolution

- Replaced the home-route vertical Soul grid with a horizontally scrolling
  OD-style Soul rail.
- Kept the existing capability template list under the selected Soul context so
  switching Souls immediately swaps the available templates and review rubric.
- Added a reusable Worker identity block that shows worker name, `workerId`,
  status, default engine, and Soul binding.
- Rendered the same Worker identity block in workspace/session route
  navigation, so the operator can see which Soul worker owns the current
  workspace.
- Kept the backend and storage contracts unchanged; workspace creation still
  targets `/api/local/workers/:workerId/workspaces`.

## Verification

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser validation at `http://127.0.0.1:5173/`:
  - home route showed the horizontal Soul rail and `hr-worker`;
  - HR -> PM switch updated worker identity to `pm-worker` and showed PM
    templates;
  - session route showed `hr-worker` in workspace navigation and hid the
    creation panel;
  - 390px viewport check reported `scrollWidth=390` and `clientWidth=390`.
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
- CRG MCP `get_minimal_context`, `detect_changes`, `get_affected_flows`, and
  `get_impact_radius`
