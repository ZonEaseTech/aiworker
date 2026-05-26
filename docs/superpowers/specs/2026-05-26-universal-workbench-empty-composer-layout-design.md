# Universal Workbench 空态 Composer 布局设计

## 目标

选中 workspace 但尚未选中 session 时，通用 workbench 的新会话 composer
应该显得安静、聚焦、有意图。它不应视觉上铺满整个 main 区域，而应采用类似
Codex 的居中列：水平居中、垂直居中，并保持一个和谐的最大宽度。

## 范围

本设计只修改 Soul-owned universal workbench 内部的空 workspace 状态：

- 已存在并选中 workspace；
- 未选中 session；
- 页面展示新会话 `ManagedSessionComposer`。

以下内容不在本轮范围内：active session follow-up composer、session timeline
布局、`SessionDetail`、Host Web shell、Host mounted container、Worker
Configuration、micro-app routing。

## 边界

改动归属 `packages/soul-app-workbench`，不进入 `apps/web`。Universal workbench
是 Soul-owned mounted micro-app surface。Host 仍只负责挂载声明的 surface，并传入
locator/context data；Host 不解释、不保存、不渲染 universal workbench 的产品状态。

## 方案

沿用 `UniversalWorkbenchApp` 里 selected-workspace/no-session 分支，只调整布局
class：

- 分支继续作为 `workbench-main` 内垂直居中的空态块；
- workspace 标题、说明和 composer 保持一组内容；
- composer 使用 balanced 宽度，上限约 `720-768px`，例如通过现有
  Tailwind/shadcn class `w-full max-w-3xl` 表达；
- 窄屏下 composer 继续填满可用 padding 内宽度，不产生横向滚动；
- 不新增 custom CSS、hex 颜色、arbitrary value 或 Host-owned layout hook。

不新增 shared `ManagedSessionComposer` API，因为这次只是单个 consuming surface 的
布局收口，不是可复用 primitive 的新能力。

## 备选方案

1. 只限制 empty workspace composer 宽度并居中。采用此方案，因为它正好对应当前视觉
   问题，改动最小。
2. 抽出 `EmptyWorkspaceComposerView` 小组件。如果该分支继续增长，这会更清晰；但本轮
   只是小型布局修正，抽组件略重。
3. 给 shared composer 增加 centered layout prop。它会提升 primitive 可配置性，但为了
   一个 mounted surface 状态扩大影响面不划算。

## 测试

更新
`packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
里的 focused static-render 覆盖：

- 断言 selected-workspace/no-session 分支仍渲染 `data-slot="session-composer"`；
- 断言 composer 包含 balanced max-width class；
- 保留旧 raw new-session form markup 不回归的 guard。

实现验证应运行：

- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run ui:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`

如果对 mounted official app 做浏览器验证，应先重建被服务的 mounted client bundle，
再信任截图。

## 验收标准

- empty workspace composer 水平居中，并限制在 balanced Codex-like 宽度。
- empty workspace 内容组在可用 main 区域内保持垂直居中。
- 窄屏保持可用的 full-width 行为，不引入横向滚动。
- 不引入 Host Web import、route special case、mounted container 改动或 Worker
  Configuration 行为。
- 现有 session 与 follow-up composer 行为保持不变。
