# PLAN-044 Fleet Audit log 内部表格滚动

- **status**: completed
- **createdAt**: 2026-04-29 18:50
- **approvedAt**: 2026-04-29 18:50
- **relatedTask**: BUG-037
- **reviewReadyAt**: 2026-04-29 18:55

## 现状

1. `apps/web/src/fleet/features/audit/components/audit-list.tsx` 一次展示
   `PAGE_LIMIT = 50` 条 audit 记录。
2. Audit 表格外层只有 `overflow-hidden rounded-md border bg-card`，没有
   垂直高度约束；共享 `Table` wrapper 自带 `overflow-auto`，但高度由内容撑开。
3. Fleet root 的 `<main>` 是 `flex-1 overflow-auto`，因此长表格会让整个 route
   内容滚动，筛选条件和分页按钮也一起离开视口。
4. 其他 Fleet 页面也使用共享 `Table`，所以共享 table 改动必须保持默认行为不变。

## 方案

1. 将 Fleet shell 收紧为 viewport-bound flex 布局：外层隐藏页面级 overflow，
   内容列和 `main` 增加 `min-h-0`，保留 `main overflow-auto` 作为非 Audit 页 fallback。
2. 将 `AuditList` 改为 `h-full min-h-0` 的 flex column；非表格状态继续使用原有空态 /
   错误态 / skeleton。
3. 审计表格存在数据时，让表格区域 `min-h-0 flex-1`，由 `Table` 的 wrapper 承担
   `overflow-auto`，使滚动发生在表格内部。
4. 给共享 `Table` 增加可选 `containerClassName`，默认值不变；Audit 页面用它设置内部滚动和
   sticky table header。
5. 更新 Fleet responsive shell 测试，构造非空 audit 数据，断言 Audit 页使用内部滚动布局。

## 风险

1. `h-dvh overflow-hidden` 可能影响其他 Fleet 页面长内容。对策：`main` 仍保留
   `overflow-auto`，只有 Audit route 进一步把表格区域收进内部滚动。
2. 共享 `Table` 改动可能影响所有表格。对策：仅新增可选 prop，默认 class 与行为保持兼容。
3. Sticky header 需要表头背景不透明。当前 `TableHead` 已有 `bg-surface-dark`，可直接复用。

## 范围

预期改动：

- `apps/web/src/fleet/routes/__root.tsx`
- `apps/web/src/fleet/features/audit/components/audit-list.tsx`
- `apps/web/src/shared/components/ui/table.tsx`
- `apps/web/src/fleet/__tests__/responsive-shell.test.tsx`
- `docs/task/BUG-037.md`
- `docs/task/index.md`
- `docs/plan/PLAN-044.md`
- `docs/plan/index.md`

## 验证

- 通过：`PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-web' test`
- 通过：`PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-web' typecheck`
- 通过：`PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-web' build`
- 通过：`PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-web' lint`
- 通过：`git diff --check`

## 批注

- 2026-04-29 18:50：用户批准 proposal，进入实现。
- 2026-04-29 18:55：实现与验证证据已存在。Audit route 的长表格滚动被限制到表格
  wrapper 内，Fleet shell 保持 viewport-bound；共享 `Table` 默认行为保持兼容。
  由于变更仍留在 dirty main worktree，尚未 commit 或显式验收，本计划保持 pending review。
- 2026-04-29 19:38：已完成复验并随 Web UI 改动收口，状态更新为 completed。
