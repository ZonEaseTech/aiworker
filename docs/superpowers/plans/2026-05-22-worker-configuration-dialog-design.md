# Worker Configuration Dialog 改进实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `WorkerConfigurationDialog` 的交互模式对齐 Host `SettingsDialog`，改用 autosave、垂直资产列表、单层编辑器，并统一 dialog 尺寸。

**Architecture:** 单文件改动 `apps/web/src/worker/worker-configuration-dialog.tsx`，不改 props 接口和 API 层。布局从横向 button bar + 嵌套 tab 改为垂直 ItemGroup 列表 + 单层 textarea 编辑器，保存策略从 draft/Apply 改为短字段即时 autosave + 长文本失焦保存。

**Tech Stack:** React 19 + TypeScript + @zonease/aiworker-ui primitives (Item, Textarea, Switch, Badge, Alert, ScrollArea 等)

---

### Task 1: Dialog 骨架与尺寸对齐

**Files:**
- Modify: `apps/web/src/worker/worker-configuration-dialog.tsx`

- [ ] **Step 1: 改 DialogContent 尺寸和结构**

将 `DialogContent className="max-w-5xl"` 改为 settings 同等规格，添加 header 结构。

当前代码（约 line 191）：
```tsx
<DialogContent className="max-w-5xl">
  <DialogTitle>Worker configuration</DialogTitle>
  <DialogDescription>{worker ? `${worker.name} worker overlay` : 'Worker overlay'}</DialogDescription>
```

改为：
```tsx
<DialogContent className="flex h-dvh flex-col gap-0 overflow-hidden p-0 sm:h-5/6 sm:max-w-5xl">
  <div className="px-6 pt-6 pb-5">
    <Badge variant="secondary" className="w-fit">WORKER OVERLAY</Badge>
    <DialogTitle>Worker configuration</DialogTitle>
    <DialogDescription>{worker ? `${worker.name} worker overlay` : 'Worker overlay'}</DialogDescription>
  </div>
```

需要新增 import：
```tsx
import { Badge } from '@zonease/aiworker-ui/components/badge'
```

- [ ] **Step 2: 导入 ScrollArea 并包裹内容区**

新增 import：
```tsx
import { ScrollArea } from '@zonease/aiworker-ui/components/scroll-area'
```

将 `<Tabs>` 的内容区用 `ScrollArea` 包裹。当前 Tabs 结构保持不变，但 TabsContent 内部的内容需要可滚动。

- [ ] **Step 3: 跑现有测试确认不挂**

```bash
bun run test -- --reporter=verbose apps/web/src/worker/__tests__/worker-studio.test.tsx 2>&1 | tail -30
```

预期：测试可能因为 DOM 结构变化而 fail，记录失败信息用于后续调整。

- [ ] **Step 4: 更新测试断言**

更新 `worker-studio.test.tsx` 中的 dialog 断言。由于加了 Badge 和结构调整，`DialogTitle` 仍在，所以 `screen.getByRole('dialog', { name: 'Worker configuration' })` 应仍然通过。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/worker/worker-configuration-dialog.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git commit -m "refactor: 对齐 WorkerConfigurationDialog 尺寸和骨架至 settings 风格"
```

---

### Task 2: 自动保存替代 draft/Apply

**Files:**
- Modify: `apps/web/src/worker/worker-configuration-dialog.tsx`

- [ ] **Step 1: 添加 autosave 状态和 Badge**

新增状态和 autosave 函数，替换 draft/Apply 逻辑。

删除这些状态：
```tsx
const [draft, setDraft] = useState<AssetDraft>({ content: '', key: null })
const [mode, setMode] = useState<'editor' | 'preview'>('editor')
```

新增：
```tsx
const [autosave, setAutosave] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
```

在 header 区域（DialogTitle/DialogDescription 旁边或右上角）添加 autosave Badge：
```tsx
{autosave !== 'idle' ? (
  <Badge variant={autosave === 'failed' ? 'destructive' : 'outline'} role="status" aria-live="polite">
    {autosave === 'saving'
      ? <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="animate-spin" />
      : <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />}
    {autosave === 'saving' ? 'Saving' : autosave === 'failed' ? 'Failed' : 'Saved'}
  </Badge>
) : null}
```

需要新增 import：
```tsx
import { Tick02Icon } from '@hugeicons/core-free-icons'
```

- [ ] **Step 2: 实现分字段 autosave**

短字段（enabled switch、id、target）改动即存；长文本 content 失焦时存。

改造 `saveAsset` 函数，加入 autosave 状态更新：

```tsx
async function saveAsset(nextAsset: LocalWorkerOverlayAsset) {
  const stampedAsset = { ...nextAsset, source: 'overlay' as const, updatedAt: new Date().toISOString() }
  setAutosave('saving')
  try {
    await saveAssets(assets.map(asset => asset.id === nextAsset.id && asset.kind === nextAsset.kind ? stampedAsset : asset))
    setAutosave('saved')
  } catch {
    setAutosave('failed')
  }
}
```

添加 autosave 自动恢复 idle 的 effect：
```tsx
useEffect(() => {
  if (autosave !== 'saved') return undefined
  const timeout = window.setTimeout(() => {
    setAutosave(current => current === 'saved' ? 'idle' : current)
  }, 1600)
  return () => window.clearTimeout(timeout)
}, [autosave])
```

文本编辑器的 onChange 只更新本地 state（不触发保存），onBlur 时调用 `saveAsset`：
```tsx
const [editContent, setEditContent] = useState(selectedAsset?.content ?? '')

// 选中资产变化时重置编辑内容
useEffect(() => {
  setEditContent(selectedAsset?.content ?? '')
}, [selectedAssetKey])
```

- [ ] **Step 3: 去掉 draft/Apply 相关代码**

删除：
- `AssetDraft` interface
- `draft` state 和 `setDraft`
- `draftContent` 计算
- `dirty` 计算
- `resetDraft` 函数
- 「Apply」按钮的渲染

Switch toggle 直接调 `saveAsset`，不再需要 dirty 判断。

- [ ] **Step 4: 去掉 editor/preview 内层 Tab**

删除：
- `mode` state
- editor/preview 的 `Tabs`、`TabsList`、`TabsTrigger`、`TabsContent` 结构
- 改为单个 `Textarea` + 可折叠 preview 区

```tsx
<Textarea
  value={editContent}
  aria-label={`${selectedAsset.id} editor`}
  onChange={event => setEditContent(event.currentTarget.value)}
  onBlur={() => {
    if (editContent !== selectedAsset.content) {
      void saveAsset({ ...selectedAsset, content: editContent })
    }
  }}
/>
```

- [ ] **Step 5: 运行测试**

```bash
bun run test -- --reporter=verbose apps/web/src/worker/__tests__/worker-studio.test.tsx 2>&1 | tail -30
```

测试中涉及 Apply 按钮、Validate 按钮、editor/preview tab 的断言需要更新。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/worker/worker-configuration-dialog.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git commit -m "refactor: WorkerConfigurationDialog 改用 autosave 替代 draft/Apply 模式"
```

---

### Task 3: 资产列表从 button bar 改为垂直 ItemGroup

**Files:**
- Modify: `apps/web/src/worker/worker-configuration-dialog.tsx`

- [ ] **Step 1: 改造资产选择和新建入口**

删除横向 button bar，改为垂直 `ItemGroup`。

当前代码（约 line 209）：
```tsx
<div data-testid="worker-overlay-asset-list" data-orientation="horizontal" className="flex min-w-0 gap-2 overflow-x-auto">
  <Button type="button" variant={createOpen ? 'secondary' : 'ghost'} onClick={() => { setCreateOpen(current => !current); setCreateValidation(null) }}>
    New asset
  </Button>
  {selectedAssets.length > 0
    ? selectedAssets.map(asset => (
        <Button key={asset.id} type="button" variant={selectedAsset?.id === asset.id ? 'secondary' : 'ghost'} onClick={() => selectAsset(asset.id)}>
          {asset.id}
        </Button>
      ))
    : <ItemDescription>No worker overlay assets.</ItemDescription>}
</div>
```

改为垂直列表：
```tsx
<div data-testid="worker-overlay-asset-list" data-orientation="vertical">
  <div className="flex items-center gap-2">
    <Button type="button" variant="secondary" onClick={() => { setCreateOpen(true); setCreateValidation(null) }}>
      New asset
    </Button>
  </div>
  {selectedAssets.length > 0
    ? (
        <ItemGroup className="gap-1">
          {selectedAssets.map(asset => (
            <Item key={asset.id} variant={selectedAsset?.id === asset.id ? 'muted' : 'default'} size="sm">
              <ItemContent className="min-w-0">
                <ItemTitle>{asset.id}</ItemTitle>
                <ItemDescription>{asset.target}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch
                  checked={asset.enabled}
                  aria-label={`Enable ${asset.id}`}
                  onCheckedChange={checked => void saveAsset({ ...asset, enabled: checked })}
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => selectAsset(asset.id)}>
                  Edit
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )
    : <ItemDescription>No worker overlay assets.</ItemDescription>}
```

- [ ] **Step 2: 调整新建资产表单**

新建表单从 toggle 改为 Button 点击展开，创建后自动收起。

表单保留在列表上方或第一个 Item 位置，创建成功后 `setCreateOpen(false)`。

- [ ] **Step 3: 运行测试并更新断言**

```bash
bun run test -- --reporter=verbose apps/web/src/worker/__tests__/worker-studio.test.tsx 2>&1 | tail -40
```

需要更新：
- `data-orientation` 断言从 `'horizontal'` 改为 `'vertical'`
- Button label 匹配（"Edit" 按钮）
- 资产选择交互方式（从 click button 改成 click "Edit"）

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/worker/worker-configuration-dialog.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git commit -m "refactor: 资产列表从横向 button bar 改为垂直 ItemGroup"
```

---

### Task 4: 去掉手动 Validate 按钮，改用保存后内联错误

**Files:**
- Modify: `apps/web/src/worker/worker-configuration-dialog.tsx`

- [ ] **Step 1: 去掉 Validate 按钮和 assetValidation 状态**

删除手动 Validate 按钮。验证逻辑移到 `saveAsset` 中：保存前先校验，不合规内容的内联 Alert 由 autosave failed 状态承载。

删除：
- `assetValidation` state
- `runValidation` 函数
- 「Validate」按钮渲染

`createValidation` 保留用于新建资产表单即时反馈。

- [ ] **Step 2: 运行测试并更新**

```bash
bun run test -- --reporter=verbose apps/web/src/worker/__tests__/worker-studio.test.tsx 2>&1 | tail -30
```

去掉测试中涉及 Validate 按钮的断言行。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/worker/worker-configuration-dialog.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git commit -m "refactor: 去掉手动 Validate 按钮，验证错误通过 autosave 反馈"
```

---

### Task 5: 清理和最终验证

**Files:**
- Modify: `apps/web/src/worker/worker-configuration-dialog.tsx`

- [ ] **Step 1: 清理未使用的 import 和 interface**

删除不再使用的：
- `DropdownMenu` 相关 imports（如还有 kebab menu 需保留）
- `AssetDraft` interface
- 如不再使用 `DropdownMenu`、`DropdownMenuContent`、`DropdownMenuItem`、`DropdownMenuSeparator`、`DropdownMenuTrigger` 则一并清理

- [ ] **Step 2: 运行完整类型检查**

```bash
bun run typecheck 2>&1 | tail -20
```

- [ ] **Step 3: 运行 lint**

```bash
bun run lint 2>&1 | tail -20
```

- [ ] **Step 4: 运行测试**

```bash
bun run test 2>&1 | tail -30
```

- [ ] **Step 5: UI 组件检查**

```bash
bun run ui:check 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/worker/worker-configuration-dialog.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git commit -m "chore: 清理 WorkerConfigurationDialog 未使用代码"
```

---

### 测试更新要点总结

`worker-studio.test.tsx` 中需要更新的断言：

| 行 | 原断言 | 改为 |
|----|--------|------|
| 905 | `data-orientation` = `'horizontal'` | `'vertical'` |
| 928 | `fireEvent.click(await screen.findByRole('button', { name: 'custom-skill' }))` | 改为 click `Edit` 按钮定位到该资产行 |
| 929-930 | Validate 按钮和结果断言 | 删除 |
| 932-939 | More actions → Duplicate | 保留 kebab menu 和 Duplicate action |
| 953 | `screen.findByRole('button', { name: 'custom-skill-2' })` | 改为 click `Edit` 按钮 |
