# H2 领域语义泄漏整改 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 Host Web 自持的领域 catalog 与 soul-id 硬编码，让 Host 泛化消费已安装 Soul App 的 manifest 描述符。

**Architecture:** Host 的 souls/templates 数据本就从已安装 manifest 动态投影；`displaySoul`/`displayTemplate` 已 fallback 到 manifest 值。本计划删除覆盖在其上的 Host 本地化 catalog（含 review rubric），把 display 函数简化为 manifest 透传，泛化 `projectNamePlaceholder`，并去掉硬编码默认 soul（复用 locator 既有的"首个 available soul"fallback）。

**Tech Stack:** TypeScript、React、Bun（`bun test`）、Vitest/bun:test，apps/web（`@zonease/aiworker-web`）。

**来源 spec:** `docs/superpowers/specs/2026-05-23-h2-domain-leak-fix-design.md`

---

## 背景：执行前必读

- souls/templates 已是动态来源（已安装 manifest → registry 投影），Host 不需要自带领域目录。
- `displaySoul`/`displayTemplate`（`apps/web/src/features/i18n/index.ts:30-42`）当前先查 `catalog.ts` 的
  `builtinSoulCopy`/`builtinTemplateCopy`，查不到才 fallback 到 manifest 投影值。
- 官方 app 只有 hr/qa/custom；catalog 里 pm/devops/finance/legal/ops 是不存在 app 的死数据。
- 经 grep 确认：**没有任何组件实际渲染 `reviewRubric`**——它只存在于 `BuiltinTemplateCopy` 类型、
  `displayTemplate` 返回值、catalog 数据与测试 fixture 中。故"Host 停止呈现 rubric"= 从类型与 display
  返回值移除。
- `locator.ts:57-61` 已有 fallback：`newWorkerSoulId` 偏好不可用时自动选"首个 status==='available' 的 soul"。
- 相关测试文件：`apps/web/src/worker/studio/locator.test.ts`、`apps/web/src/worker/__tests__/worker-studio.test.tsx`。
- 命令：聚焦测试 `bun test apps/web/src/<file>`；类型检查 `bun run --filter '@zonease/aiworker-web' typecheck`；
  lint `bun run lint`。

## File Structure

- Delete: `apps/web/src/features/i18n/catalog.ts`
- Modify: `apps/web/src/features/i18n/index.ts`（display 函数透传，去 catalog 与 rubric）
- Modify: `apps/web/src/features/i18n/types.ts`（`BuiltinTemplateCopy` 去 rubric；`projectPlaceholders` 收窄）
- Modify: `apps/web/src/features/i18n/locales/{en,de,ja,zh-CN}.ts`（`projectPlaceholders` 只留 default）
- Modify: `apps/web/src/features/local-workspace/model.ts`（`projectNamePlaceholder` 泛化）
- Modify: `apps/web/src/worker/studio/locator.ts`（去硬编码默认 soul）
- Modify: `apps/web/src/worker/worker-studio.tsx`（去硬编码默认 soul + 默认选首个 available 的 effect）
- Modify: 相关测试文件

---

## Task 1: 删除领域 catalog，display 函数透传 manifest（去 rubric）

**Files:**
- Delete: `apps/web/src/features/i18n/catalog.ts`
- Modify: `apps/web/src/features/i18n/index.ts:1-9,30-42`
- Modify: `apps/web/src/features/i18n/types.ts:294-300`
- Test: `apps/web/src/features/i18n/display.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `apps/web/src/features/i18n/display.test.ts`：

```ts
import type { CapabilityTemplate, VerticalSoul } from '../local-workspace/types.compat'
import { describe, expect, test } from 'bun:test'
import { displaySoul, displayTemplate } from './index'

describe('displaySoul/displayTemplate 泛化消费 manifest', () => {
  test('displaySoul 返回 manifest 投影值，不被 Host catalog 覆盖', () => {
    const soul: VerticalSoul = {
      id: 'aiworker-hr',
      name: 'Manifest HR Name',
      description: 'Manifest desc',
      domain: 'manifest-domain',
      status: 'available',
      defaultTemplates: [],
    }
    const copy = displaySoul(soul, 'en')
    expect(copy.name).toBe('Manifest HR Name')
    expect(copy.description).toBe('Manifest desc')
    expect(copy.domain).toBe('manifest-domain')
  })

  test('displayTemplate 返回 manifest 投影值且不含 reviewRubric', () => {
    const template: CapabilityTemplate = {
      id: 'aiworker-hr.person-profile',
      name: 'Manifest Template',
      description: 'Manifest tdesc',
      soulId: 'aiworker-hr',
      outputKind: 'person-profile',
      inputHints: ['a'],
      reviewRubric: ['secret rubric'],
      prompt: '',
    }
    const copy = displayTemplate(template, 'en')
    expect(copy.name).toBe('Manifest Template')
    expect(copy.description).toBe('Manifest tdesc')
    expect('reviewRubric' in copy).toBe(false)
  })
})
```

> 若 `VerticalSoul`/`CapabilityTemplate` 的字段名与上面有出入，以 `types.compat.ts` 实际定义为准补齐必填字段。

- [ ] **Step 2: 跑测试，确认失败**

Run: `bun test apps/web/src/features/i18n/display.test.ts`
Expected: FAIL — 第一条：`name` 被 catalog 的 `builtinSoulCopy.en['aiworker-hr']` 覆盖成 'HR'，非 'Manifest HR Name'。第二条：`reviewRubric` 仍在返回值里。

- [ ] **Step 3: 删除 catalog 文件**

```bash
git rm apps/web/src/features/i18n/catalog.ts
```

- [ ] **Step 4: 简化 `index.ts` 的 display 函数，移除 catalog import 与 rubric**

`apps/web/src/features/i18n/index.ts`：删除第 4 行 `import { builtinSoulCopy, builtinTemplateCopy } from './catalog'`。
把 `:30-42` 改为：

```ts
export function displaySoul(soul: VerticalSoul, _locale: SupportedLocale): BuiltinSoulCopy {
  return { description: soul.description, domain: soul.domain, name: soul.name }
}

export function displayTemplate(template: CapabilityTemplate, _locale: SupportedLocale): BuiltinTemplateCopy {
  return {
    description: template.description,
    inputHints: template.inputHints,
    name: template.name,
    outputKind: template.outputKind,
  }
}
```

（保留 `locale` 形参并改名 `_locale` 以满足 unused 规则并最小化 6 个调用点改动。）

- [ ] **Step 5: 从 `BuiltinTemplateCopy` 类型移除 `reviewRubric`**

`apps/web/src/features/i18n/types.ts:294-300` 改为：

```ts
export interface BuiltinTemplateCopy {
  description: string
  inputHints: readonly string[]
  name: string
  outputKind: string
}
```

- [ ] **Step 6: 跑测试，确认通过**

Run: `bun test apps/web/src/features/i18n/display.test.ts`
Expected: PASS。

- [ ] **Step 7: 修复因类型/删除产生的连带编译错误**

Run: `bun run --filter '@zonease/aiworker-web' typecheck`
Expected: 可能报 `worker-studio.test.tsx`/`locator.test.ts` 等 fixture 里 `BuiltinTemplateCopy` 不再有 rubric，或断言 display 输出含 rubric 的地方。逐个修：
- 若是测试 fixture 给 `CapabilityTemplate` 设 `reviewRubric`（`types.compat.ts:19` 仍有该字段），**保留**——CapabilityTemplate 数据形状不变。
- 若是断言 `displayTemplate(...).reviewRubric`，删除该断言。
- 直到 `typecheck` exit 0。

- [ ] **Step 8: 提交**

```bash
git add apps/web/src/features/i18n/ apps/web/src/worker/
git commit -m "$(cat <<'EOF'
fix: 移除 Host 领域 catalog,display 透传 manifest 并去 rubric

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 泛化 projectNamePlaceholder 并收窄占位类型

**Files:**
- Modify: `apps/web/src/features/local-workspace/model.ts:47-57`
- Modify: `apps/web/src/features/i18n/types.ts:60`
- Modify: `apps/web/src/features/i18n/locales/{en,de,ja,zh-CN}.ts`（各 `projectPlaceholders`）
- Test: `apps/web/src/features/local-workspace/model.test.ts`（新建或追加）

- [ ] **Step 1: 写失败测试**

新建 `apps/web/src/features/local-workspace/model.test.ts`（若已存在则追加用例）：

```ts
import { describe, expect, test } from 'bun:test'
import { en } from '../i18n/locales'
import { projectNamePlaceholder } from './model'

describe('projectNamePlaceholder 不再按 soul id 分支', () => {
  test('任意 soul id 都返回 default 占位', () => {
    const def = en.create.projectPlaceholders.default
    expect(projectNamePlaceholder('aiworker-hr', en)).toBe(def)
    expect(projectNamePlaceholder('aiworker-qa', en)).toBe(def)
    expect(projectNamePlaceholder('whatever-soul', en)).toBe(def)
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `bun test apps/web/src/features/local-workspace/model.test.ts`
Expected: FAIL — `projectNamePlaceholder('aiworker-hr', en)` 返回 `projectPlaceholders.hr`（'Mia Chen people profile'），非 default。

- [ ] **Step 3: 泛化 `projectNamePlaceholder`**

`apps/web/src/features/local-workspace/model.ts:47-57` 改为：

```ts
export function projectNamePlaceholder(_soulId: string, copy: WorkerMessages): string {
  return copy.create.projectPlaceholders.default
}
```

- [ ] **Step 4: 收窄 `projectPlaceholders` 类型**

`apps/web/src/features/i18n/types.ts:60` 改为：

```ts
    projectPlaceholders: { default: string }
```

- [ ] **Step 5: 各 locale 只留 default**

对 `apps/web/src/features/i18n/locales/en.ts`，把 `projectPlaceholders`（`:55-61`）改为：

```ts
    projectPlaceholders: {
      default: 'Checkout deploy checklist',
    },
```

对 `de.ts`、`ja.ts`、`zh-CN.ts` 做同样处理：删除 `devops`/`hr`/`pm`/`qa` 键，**保留各自现有的 `default` 值**。

- [ ] **Step 6: 跑测试 + 类型检查**

Run: `bun test apps/web/src/features/local-workspace/model.test.ts && bun run --filter '@zonease/aiworker-web' typecheck`
Expected: 测试 PASS；typecheck exit 0（确认无残留引用 `projectPlaceholders.hr/pm/qa/devops`）。

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/features/local-workspace/model.ts apps/web/src/features/i18n/
git commit -m "$(cat <<'EOF'
fix: projectNamePlaceholder 泛化,去除 soul-id 分支

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 去除硬编码默认 soul，默认选首个已启用 soul

**Files:**
- Modify: `apps/web/src/worker/studio/locator.ts:31,35`
- Modify: `apps/web/src/worker/worker-studio.tsx:47,73`
- Test: `apps/web/src/worker/studio/locator.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/web/src/worker/studio/locator.test.ts` 追加用例（复用文件已有的 `deriveWorkerStudioLocatorState` import 与 data 构造方式；下面给出最小数据，按文件现有 fixture 风格补全必填字段）：

```ts
  test('无 soul 偏好时默认选首个 available soul', () => {
    const state = deriveWorkerStudioLocatorState({
      data: makeData({
        souls: [
          { id: 'soul-a', name: 'A', description: '', domain: '', status: 'available', defaultTemplates: [] },
          { id: 'soul-b', name: 'B', description: '', domain: '', status: 'available', defaultTemplates: [] },
        ],
        workers: [],
      }),
      newWorkerSoulId: null,
      route: { kind: 'home' },
    })
    expect(state.selectedSoul?.id).toBe('soul-a')
  })
```

> 注：`makeData`/`route` 形态以该测试文件现有 helper 为准；若文件用内联 data 对象，则照其结构构造，关键是传 `newWorkerSoulId: null` 且 souls 含两个 available。目标断言：`selectedSoul` 为第一个 available（'soul-a'）。

- [ ] **Step 2: 跑测试，确认现状**

Run: `bun test apps/web/src/worker/studio/locator.test.ts`
Expected: 该用例此刻应已能通过既有 fallback 选到 soul-a（因为 `newWorkerSoulId: null` 时 `:59` 找不到、`:60` fallback 首个 available）。**这是行为锁定测试**——它在 Step 3 去掉硬编码后必须仍绿，防止回归。若此刻为红，说明对 fallback 理解有误，停下排查。

- [ ] **Step 3: 去掉 locator 的硬编码默认 soul**

`apps/web/src/worker/studio/locator.ts`：
- 删除 `:31` `const defaultNewWorkerSoulId = 'aiworker-hr'`。
- `:35` 默认参数改为：`newWorkerSoulId = null,`

- [ ] **Step 4: worker-studio 初始化为无偏好并默认选首个 available**

`apps/web/src/worker/worker-studio.tsx`：
- 删除 `:47` `const defaultNewWorkerSoulId = 'aiworker-hr'`。
- `:73` 改为：`const [newWorkerSoulId, setNewWorkerSoulId] = useState<string | null>(null)`
- 紧随其后新增一个 effect，在 souls 数据就绪且尚无选择时默认选首个 available soul：

```tsx
  useEffect(() => {
    if (newWorkerSoulId)
      return
    const firstAvailable = data?.souls.find(soul => soul.status === 'available')
    if (firstAvailable)
      setNewWorkerSoulId(firstAvailable.id)
  }, [data, newWorkerSoulId])
```

> 确认 `useEffect` 已在该文件 import（React）；`data` 为组件内已有的 LocalWorkspaceData。`newWorkerSoulId` 现为 `string | null`，下游 `:281` `if (!newWorkerName.trim() || !newWorkerSoulId)` 与 `:285` `soulId: newWorkerSoulId` 在 null 时已被守卫，类型上把 `soulId: newWorkerSoulId` 处确认非空（守卫后）或按 TS 提示加断言。

- [ ] **Step 5: 跑测试 + 类型检查**

Run: `bun test apps/web/src/worker/studio/locator.test.ts && bun run --filter '@zonease/aiworker-web' typecheck`
Expected: 测试 PASS（含 Step 1 行为锁定）；typecheck exit 0。修任何因 `newWorkerSoulId: string | null` 引入的类型问题。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/worker/
git commit -m "$(cat <<'EOF'
fix: 去除硬编码默认 soul,默认选首个已启用 soul

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 收尾验证（全部任务完成后）

- [ ] **Step 1: 确认无残留 phantom soul / 领域硬编码**

Run: `rg -n "aiworker-hr|builtinSoulCopy|builtinTemplateCopy|projectPlaceholders\.(hr|pm|qa|devops)" apps/web/src | rg -v '\.test\.'`
Expected: 仅 `worker-studio.tsx`/`locator.test.ts` 等测试或注释中可能残留的 `aiworker-hr` 字面（确认非产品逻辑硬编码）；catalog 符号与 `projectPlaceholders.hr/pm/qa/devops` 应为 0 命中。

- [ ] **Step 2: Web 包测试 + 类型 + lint**

Run: `bun run --filter '@zonease/aiworker-web' test && bun run --filter '@zonease/aiworker-web' typecheck && bun run lint`
Expected: 全绿（lint 含边界守卫；预存的 storage-sqlite typecheck 报错与本改动无关，若 `bun run typecheck` 全量跑到它，按文件归属判断）。

- [ ] **Step 3: 人工验证 Host Web**

起本地 Host Web，确认 worker 新建对话框与模板选择卡片显示的是 hr/qa/custom 的 manifest 文案，默认预选首个已启用 soul，界面无 review rubric，无 pm/devops/finance/legal/ops 等 phantom soul。

---

## 非目标（明确不做）

- 不动 `apps/web/src/features/local-workspace/types.compat.ts`（兼容类型副本，`CapabilityTemplate.reviewRubric` 字段保留作数据形状）。
- 不扩 manifest schema 加多语言。
- 不新增"Host 不得硬编码 soul id"的 lint 守卫。
- 不碰 H3/H4，不收敛 validate 的 runtime 漏扫（独立跟进）。
