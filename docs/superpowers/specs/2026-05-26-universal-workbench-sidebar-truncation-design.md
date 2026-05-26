# Universal Workbench Sidebar Truncation Design

## 背景

Universal workbench 的左侧 workspace/session tree 在显示很长的 workspace name 时，会把 left panel 横向撑开，破坏 Host mounted surface 内部布局。该 surface 属于 Soul-owned universal workbench；Host 只负责 mount container、locator context 和 bridge，不应在 Host left panel、Worker Configuration 或 Host shell 中解释或修复该领域 UI。

## 目标

- 桌面布局中，universal workbench 左侧 sidebar 保持固定宽度，不被 workspace/session label 撑开。
- 超长 workspace name、session label、session detail 均单行省略。
- 移动端继续保持当前 `max-md:w-full` 行为，不引入新的横向滚动。
- 保留完整 label 的可访问性提示，用户仍能通过原始文本识别被省略的名称。
- 不改变 workspace/session 的选择、创建 session、折叠 sidebar 等交互语义。

## 非目标

- 不修改 Host Web shell、Host left panel、Worker Configuration 或 mounted container。
- 不修改 `packages/ui` 的 `Item` primitive 默认行为，避免影响其它产品界面。
- 不调整 universal workbench 的信息架构、排序、分组或 session 状态模型。
- 不引入新的 responsive breakpoint、主题 token 或 app-local 视觉系统。

## 方案

采用使用点收敛方案：只修改 `packages/soul-app-workbench/src/universal-workbench` 下的 universal workbench 组件。

1. 在 `UniversalWorkbenchApp` 的 `workbench-sidebar` 上补齐桌面固定宽度约束。保留现有 `w-56`，增加 `basis-56` 与 `max-w-56`，并保留 `flex-shrink-0`、`min-w-0`、`overflow-y-auto` 和移动端 `max-md:w-full` / `max-md:flex-none`。
2. 在 `WorkspaceSessionTree` 的可点击 `Item`、`button`、`ItemContent` 和 title/description 使用点补齐 `w-full min-w-0 overflow-hidden` 链路，让 flex 子项可以在 fixed sidebar 内收缩。
3. workspace title、session title、session detail 使用单行省略。为 workspace/session 可点击节点设置 `title={label}`，session detail 有值时也保留完整 `title`。
4. `New Session` 行保持现有 icon + text 组合，仅补必要的收缩类，避免它在窄宽度下影响 tree 布局。

该方案的边界最小：它修复 Soul-owned mounted UI 的内部布局，不把 workspace name 变成 Host 配置，也不改变 shared UI primitive 的全局 contract。

## 组件归属

- `UniversalWorkbenchApp`：拥有 workbench 外层 layout 和 sidebar 固定宽度。
- `WorkspaceSessionTree`：拥有 workspace/session tree 的文字收缩、省略和完整 label 提示。
- `packages/ui`：保持不变；继续作为 shadcn-managed primitive 来源。

## 数据流与状态

无需改变数据流。`UniversalWorkbenchApp` 仍把 workspace/session 映射为 `WorkspaceSessionTreeNode[]`，`WorkspaceSessionTree` 仍通过 `onSelectNode` 与 `onCreateSession` 回调把选择和创建意图传回上层。新增的 `title` 仅来自现有 label/detail，不写入状态，不触发 API。

## 错误处理

该修复不新增异步路径或错误分支。空 label、缺失 session detail、无 workspace、无 session 的现有渲染路径保持不变。过长连续字符串通过 CSS 省略处理，不做 JS 截断，避免破坏真实 workspace/session 名称。

## 测试与验证

- 补充 focused render regression：构造超长 workspace name 和 session label，断言 `workbench-sidebar` 具有固定宽度约束类，tree 节点 title/description 具有 `min-w-0`、`w-full`、`overflow-hidden`、`truncate` 等关键类，并包含完整 `title`。
- 运行 focused test：universal workbench 相关测试。
- 运行 UI 组件治理检查：`bun run ui:check`。
- 代码变更后运行 `bun run crg:update` 与 `bun run crg:review`；若只停留在本文档阶段则不需要 code-review-graph。

## 交付边界

实现阶段只允许修改 universal workbench 组件和对应 focused tests。若发现根因来自 `packages/ui` primitive，需要先暂停并重新设计，因为那会扩大影响范围。
