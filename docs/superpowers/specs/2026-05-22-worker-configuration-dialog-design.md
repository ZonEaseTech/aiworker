# Worker Configuration Dialog 设计

## 目标

将 `WorkerConfigurationDialog` 的交互模式对齐 Host `SettingsDialog`，解决当前
dialog 表现不自然的问题：横向 button bar 选资产、draft/Apply 保存摩擦、
嵌套 tab 层级过深、dialog 尺寸不统一。

## 范围

只改 `apps/web/src/worker/worker-configuration-dialog.tsx`，不改数据结构、
API 层或 WorkerStudio 的调用方式。Props 接口保持不变。

## 设计

### 1. Dialog 尺寸与骨架

对齐 `SettingsDialog` 的尺寸约束：

- `DialogContent` 改为 `h-dvh sm:h-5/6 sm:max-w-5xl flex flex-col gap-0 overflow-hidden p-0`
- 加 header 区域：Badge kicker（"WORKER OVERLAY"）+ `DialogTitle` + `DialogDescription`
- 横向 `TabsList` 保留在 header 下方、内容区上方，固定不参与滚动
- 内容区包 `ScrollArea`，确保内容溢出时可滚动

### 2. 资产列表

从横向 button bar 改为垂直 `ItemGroup`：

- 每个 asset 一个 `Item` 行，展示 id、target、enabled Switch、操作入口
- 选中行通过 `variant="muted"` 或类似方式高亮
- 「New asset」作为 Button 放在列表上方，点击展开内联创建表单（不是 toggle）
- 创建表单完成后自动收起

### 3. 编辑器

选中的 asset 在列表下方展开编辑区：

- 一个 `Textarea`，失焦自动保存
- 去掉 editor/preview 内层 `Tabs`，改为可折叠的 preview 区（或用 `Item` + `ItemDescription` 展示渲染后的内容）
- 不再有「Apply」按钮

### 4. Autosave 策略（方案 D）

- 短字段（id、target、enabled Switch）改动即 PATCH
- 长文本 content 在失焦（onBlur）时自动保存
- 保存状态用 Badge 展示：saving（spinner）/ saved（checkmark）/ failed（destructive）
- 去掉 draft 状态、dirty 跟踪和「Apply」按钮
- 保存失败时以内联 `Alert` 展示错误信息

### 5. 验证

- 去掉手动「Validate」按钮
- 内容不合规（空字段、重复 id、包含密钥字面量）时在保存失败后的 Alert 中展示
- 新建资产表单中保持即时验证提示

### 6. Projection Tab

保持不变，用 `ItemGroup` + `Item` 布局已经是合理结构。

## 不变的部分

- Props 接口
- 数据类型（`LocalWorkerOverlayAsset` 等）
- API 调用（`onSaveAssets`、`onProjectWorkspaceAssets`）
- WorkerStudio 中的集成方式
- 测试用例的核心断言（只调整 testid 或交互方式细节）
