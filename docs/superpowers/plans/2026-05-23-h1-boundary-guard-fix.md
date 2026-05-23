# H1 边界守卫整改 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `scripts/check-soul-app-boundaries.ts` 真正扫描 Soul App 代码（当前因写死 `apps/X/src` 而对真实代码完全空转），并加防空转护栏与回归测试。

**Architecture:** 守卫脚本把 Soul App 扫描根从写死的 `src/` 改为 app 根目录（方案 A，零信任不假设代码子目录）；发现条件改为只认 `soul-app.manifest.json`；新增 tripwire 让"扫到 0 个 app 却存在 manifest"在 lint 阶段即失败；把脚本 top-level 执行包进 `import.meta.main` 以便单测直接导入纯函数。顺手清理 H6（幽灵目录 + 架构地图漏登）。

**Tech Stack:** TypeScript、Bun（`bun test` / `bun:test`）、Node fs API。脚本经 `package.json` 的 `lint` 执行。

**来源 spec:** `docs/superpowers/specs/2026-05-23-h1-boundary-guard-fix-design.md`

---

## 背景：当前实现的关键事实（执行前必读）

- `scripts/check-soul-app-boundaries.ts` 是被 `package.json:18` 的 `lint` 调用的边界守卫。
- `interface SoulAppWorkspace`（`:5-10`）有字段 `srcDir`；`discoverSoulApps()`（`:75-90`）把
  `srcDir = path.join(dir, 'src')`，并以 `existsSync(srcDir)` 过滤。
- 三个官方 Soul App（`apps/aiworker-hr|qa|custom`）**没有 `src/` 目录**，真实代码在
  `host-adapter/`、`product/`、`runtime/`、`scripts/`。故发现列表为空，Soul 侧扫描空转。
- 脚本是 **top-level 立即执行**（`:57-73`）：构造 `issues` 数组并设 `process.exitCode`。
- `listSourceFiles`（`:274-288`）已过滤 `dist`/`node_modules`/`routeTree.gen.ts`，并只收 `.ts/.tsx/...`。
- `isTestSourceFile`（`:313-315`）判定 `.test/.spec` 文件。
- 现有测试 `scripts/check-soul-app-boundaries.test.ts` 只覆盖 completion-audit 与 Host Web import
  workbench（后者不依赖 Soul App 发现），故守卫空转时仍绿。
- 运行单测：`bun test scripts/check-soul-app-boundaries.test.ts`。
- 跑守卫本体：`bun scripts/check-soul-app-boundaries.ts`。

## File Structure

- Modify: `scripts/check-soul-app-boundaries.ts` — 守卫逻辑（discovery、scan 根、tripwire、导出、test 豁免、fs-layout）。
- Modify: `scripts/check-soul-app-boundaries.test.ts` — 补 Soul 侧回归与 tripwire 单测。
- Modify: `docs/architecture.md` — IMPORT-001 的 Enforced-by 措辞 + Repository Map 补登。
- Delete（文件系统）: `packages/gateway/`、`packages/gateway-proto/`（仅陈旧 node_modules，无 git 跟踪文件）。

---

## Task 1: 扫描真实 Soul App 代码（manifest-only 发现 + codeRoot + 可导入）

**Files:**
- Modify: `scripts/check-soul-app-boundaries.ts`（`:5-10` 接口、`:21-28` 私有包、`:57-73` 执行体、`:75-90` discover、`:105-167` 扫描函数）
- Test: `scripts/check-soul-app-boundaries.test.ts`

- [ ] **Step 1: 写失败测试（发现 + 真违规被捕获 + Host 侧捕获）**

在 `scripts/check-soul-app-boundaries.test.ts` 顶部补充 import，并在 `describe` 内新增三条用例：

```ts
// 顶部 import 区追加（与现有 import 合并，勿重复）：
import { discoverSoulApps } from './check-soul-app-boundaries'

// describe('check-soul-app-boundaries', () => { ... }) 内新增：

  test('discovers official Soul apps that live outside src/', () => {
    const names = discoverSoulApps().map(app => app.name)
    expect(names).toContain('aiworker-hr')
    expect(names).toContain('aiworker-qa')
    expect(names).toContain('aiworker-custom')
  })

  test('catches a Soul App Host-private import located outside src/', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'apps/demo-soul')
      mkdirSync(join(appDir, 'host-adapter'), { recursive: true })
      writeFileSync(join(appDir, 'soul-app.manifest.json'), JSON.stringify({ id: 'demo-soul' }))
      writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: '@demo/soul' }))
      writeFileSync(
        join(appDir, 'host-adapter/bad.ts'),
        'import { thing } from "@zonease/aiworker-core"\nexport const y = thing\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('apps/demo-soul/host-adapter/bad.ts')
      expect(result.stderr).toContain('@zonease/aiworker-core')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })

  test('catches Host code importing Soul internals outside src/', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'apps/demo-soul')
      mkdirSync(join(appDir, 'host-adapter'), { recursive: true })
      writeFileSync(join(appDir, 'soul-app.manifest.json'), JSON.stringify({ id: 'demo-soul' }))
      writeFileSync(join(appDir, 'host-adapter/api.ts'), 'export const api = 1\n')

      const webDir = join(tempRoot, 'apps/web/src')
      mkdirSync(webDir, { recursive: true })
      writeFileSync(
        join(webDir, 'bad.ts'),
        'import { api } from "../../demo-soul/host-adapter/api"\nexport const z = api\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('apps/web/src/bad.ts')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `bun test scripts/check-soul-app-boundaries.test.ts`
Expected: FAIL —
- 第一条：`discoverSoulApps` 未导出（import 报错）或返回空数组。
- 第二、三条：`status` 为 0（守卫扫不到 demo-soul，因为它无 `src/` 被丢弃 / 用了 srcDir 作用域）。

- [ ] **Step 3: 改 interface，把 `srcDir` 改名为 `codeRoot`**

`scripts/check-soul-app-boundaries.ts:5-10`：

```ts
interface SoulAppWorkspace {
  dir: string
  name: string
  packageName: string | null
  codeRoot: string
}
```

- [ ] **Step 4: 改 `discoverSoulApps`：只认 manifest，codeRoot = app 根，并导出**

替换 `:75-90`：

```ts
export function discoverSoulApps(): SoulAppWorkspace[] {
  if (!existsSync(appRoot))
    return []
  return readdirSync(appRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(appRoot, entry.name)
      return {
        dir,
        name: entry.name,
        packageName: readPackageName(dir),
        codeRoot: dir,
      }
    })
    .filter(app => existsSync(path.join(app.dir, 'soul-app.manifest.json')))
}
```

- [ ] **Step 5: 把所有 `srcDir` 引用改为 `codeRoot`，并扩展 Host 侧路径匹配**

在 `scanSoulAppImports`：
- `:109` `for (const file of listSourceFiles(app.srcDir))` → `listSourceFiles(app.codeRoot)`
- `:127` `isInside(resolved, candidate.srcDir)` → `isInside(resolved, candidate.codeRoot)`

在 `scanHostImports`：
- `:156` 把字符串匹配从 `apps/${app.name}/src/` 放宽到 `apps/${app.name}/`：

```ts
        if (apps.some(app => normalized.includes(`apps/${app.name}/`))) {
          issues.push(issue(file, importPath, 'Host code must not import Soul App internals.'))
          continue
        }
```

- `:161` `apps.some(app => isInside(resolved, app.srcDir))` → `isInside(resolved, app.codeRoot)`

在 `scanSoulAppWebStorageUsage`：
- `:172` `for (const file of listSourceFiles(app.srcDir))` → `listSourceFiles(app.codeRoot)`

> 说明：消息文案 `'Host code must not import Soul App src internals.'` 可一并改为
> `'Host code must not import Soul App internals.'`（两处，`:157` 与 `:162`），因为不再限于 `src`。

- [ ] **Step 6: 把 top-level 执行体包进 `import.meta.main`**

把 `:57-73`（从 `const soulApps = discoverSoulApps()` 到 `reportHostEmbeddedSoulRendererDebt()`）整体替换为一个 `runChecks()` 函数 + main 守卫：

```ts
function runChecks(): void {
  const soulApps = discoverSoulApps()
  const issues: BoundaryIssue[] = [
    ...scanSoulAppImports(soulApps),
    ...scanHostImports(soulApps),
    ...scanSoulAppWebStorageUsage(soulApps),
    ...scanHostEmbeddedSoulRenderers(),
    ...scanHostWebPackageImports(),
    ...scanHostWebRetiredProductSurfaces(),
  ]

  if (issues.length > 0) {
    for (const issue of issues)
      console.error(`${issue.file}: ${issue.message} (${issue.importPath})`)
    process.exitCode = 1
  }

  reportHostEmbeddedSoulRendererDebt()
}

if (import.meta.main)
  runChecks()
```

> 注意：`runChecks` 必须放在它引用的函数声明之后（函数声明会提升，但为可读性放文件靠后、`import.meta.main` 调用之前）。

- [ ] **Step 7: 跑测试，确认通过**

Run: `bun test scripts/check-soul-app-boundaries.test.ts`
Expected: PASS（含原有两条用例 + 新增三条）。

- [ ] **Step 8: 跑守卫本体确认 repo 当前无新违规**

Run: `bun scripts/check-soul-app-boundaries.ts; echo "exit=$?"`
Expected: `exit=0`（守卫现在扫到真实 Soul 代码，且当前代码无 IMPORT-001 违规）。
若非 0：阅读 stderr，确认是否扫出真实违规（属意外发现，记录后停下与维护者确认，勿放宽守卫掩盖）。

- [ ] **Step 9: 提交**

```bash
git add scripts/check-soul-app-boundaries.ts scripts/check-soul-app-boundaries.test.ts
git commit -m "fix: 边界守卫扫描 Soul App 全目录而非写死 src"
```

---

## Task 2: 防空转 tripwire

**Files:**
- Modify: `scripts/check-soul-app-boundaries.ts`
- Test: `scripts/check-soul-app-boundaries.test.ts`

- [ ] **Step 1: 写失败的单测**

在 `scripts/check-soul-app-boundaries.test.ts` 顶部 import 追加 `discoveryTripwireError`，并新增用例：

```ts
import { discoverSoulApps, discoveryTripwireError } from './check-soul-app-boundaries'

  test('tripwire fires when manifests exist but nothing is discovered', () => {
    expect(discoveryTripwireError(2, 0)).toContain('scan nothing')
    expect(discoveryTripwireError(2, 2)).toBeNull()
    expect(discoveryTripwireError(0, 0)).toBeNull()
  })
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `bun test scripts/check-soul-app-boundaries.test.ts`
Expected: FAIL — `discoveryTripwireError` 未导出（import 报错）。

- [ ] **Step 3: 实现 tripwire 纯函数 + manifest 计数，并接入 `runChecks`**

在 `scripts/check-soul-app-boundaries.ts` 新增（放在 `discoverSoulApps` 附近）：

```ts
export function countSoulManifests(): number {
  if (!existsSync(appRoot))
    return 0
  return readdirSync(appRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => existsSync(path.join(appRoot, entry.name, 'soul-app.manifest.json')))
    .length
}

export function discoveryTripwireError(manifestCount: number, discoveredCount: number): string | null {
  if (manifestCount > 0 && discoveredCount === 0)
    return `Boundary guard found ${manifestCount} Soul App manifest(s) but discovered 0 scannable apps; the guard would scan nothing.`
  return null
}
```

在 `runChecks()` 内、`const soulApps = discoverSoulApps()` 之后插入：

```ts
  const tripwire = discoveryTripwireError(countSoulManifests(), soulApps.length)
  if (tripwire) {
    console.error(tripwire)
    process.exit(1)
  }
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `bun test scripts/check-soul-app-boundaries.test.ts`
Expected: PASS（新用例 + 既有用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add scripts/check-soul-app-boundaries.ts scripts/check-soul-app-boundaries.test.ts
git commit -m "feat: 边界守卫加防空转 tripwire"
```

---

## Task 3: 豁免 Soul App 测试文件的 import 边界

**Files:**
- Modify: `scripts/check-soul-app-boundaries.ts`（`scanSoulAppImports` 循环）
- Test: `scripts/check-soul-app-boundaries.test.ts`

- [ ] **Step 1: 写失败测试**

新增用例：

```ts
  test('exempts Soul App test files from the import boundary', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'apps/demo-soul')
      mkdirSync(join(appDir, 'host-adapter'), { recursive: true })
      writeFileSync(join(appDir, 'soul-app.manifest.json'), JSON.stringify({ id: 'demo-soul' }))
      writeFileSync(
        join(appDir, 'host-adapter/api.test.ts'),
        'import { thing } from "@zonease/aiworker-core"\nexport const y = thing\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `bun test scripts/check-soul-app-boundaries.test.ts`
Expected: FAIL — `status` 非 0（守卫把 `api.test.ts` 的 import 当成违规）。

- [ ] **Step 3: 在 `scanSoulAppImports` 跳过测试文件**

`scanSoulAppImports` 内的文件循环（`:108-109`）改为：

```ts
    for (const file of listSourceFiles(app.codeRoot)) {
      if (isTestSourceFile(file))
        continue
      for (const importPath of importSpecifiers(readFileSync(file, 'utf8'))) {
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `bun test scripts/check-soul-app-boundaries.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/check-soul-app-boundaries.ts scripts/check-soul-app-boundaries.test.ts
git commit -m "fix: 边界守卫豁免 Soul App 测试文件 import"
```

---

## Task 4: 把 `fs-layout` 纳入 Host 私有包

**Files:**
- Modify: `scripts/check-soul-app-boundaries.ts`（`:21-28` `hostPrivatePackages`、`:29-36` `hostPrivateRoots`）
- Test: `scripts/check-soul-app-boundaries.test.ts`

- [ ] **Step 1: 写失败测试**

新增用例：

```ts
  test('blocks Soul App imports of the Host fs-layout package', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiworker-boundary-'))
    try {
      const appDir = join(tempRoot, 'apps/demo-soul')
      mkdirSync(join(appDir, 'host-adapter'), { recursive: true })
      writeFileSync(join(appDir, 'soul-app.manifest.json'), JSON.stringify({ id: 'demo-soul' }))
      writeFileSync(
        join(appDir, 'host-adapter/bad.ts'),
        'import { home } from "@zonease/aiworker-fs-layout"\nexport const y = home\n',
      )

      const result = spawnSync('bun', [resolve(repoRoot, 'scripts/check-soul-app-boundaries.ts')], {
        cwd: tempRoot,
        encoding: 'utf8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('@zonease/aiworker-fs-layout')
    }
    finally {
      rmSync(tempRoot, { force: true, recursive: true })
    }
  })
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `bun test scripts/check-soul-app-boundaries.test.ts`
Expected: FAIL — `status` 为 0（`fs-layout` 不在禁止清单）。

- [ ] **Step 3: 把 `fs-layout` 加入两个清单**

`:21-28` `hostPrivatePackages` 数组中按字母序加入：

```ts
  '@zonease/aiworker-fs-layout',
```

`:29-36` `hostPrivateRoots` 数组中加入：

```ts
  'packages/fs-layout',
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `bun test scripts/check-soul-app-boundaries.test.ts`
Expected: PASS。

- [ ] **Step 5: 跑守卫本体确认无新违规**

Run: `bun scripts/check-soul-app-boundaries.ts; echo "exit=$?"`
Expected: `exit=0`（确认现有 Soul 代码未 import fs-layout）。

- [ ] **Step 6: 提交**

```bash
git add scripts/check-soul-app-boundaries.ts scripts/check-soul-app-boundaries.test.ts
git commit -m "fix: 边界守卫把 fs-layout 纳入 Host 私有包"
```

---

## Task 5: 修正 IMPORT-001 的 Enforced-by 措辞

**Files:**
- Modify: `docs/architecture.md:97`

- [ ] **Step 1: 改 Enforced-by 列，移除不实的 `aiworker app validate`**

把 `:97` 这一行的第 4 列（Enforced by）：

原：`` `scripts/check-soul-app-boundaries.ts`, `aiworker app validate`, package tests ``
改为：`` `scripts/check-soul-app-boundaries.ts` (via `lint`), `scripts/check-soul-app-boundaries.test.ts` ``

整行改后示例（保持其余列不变）：

```
| `IMPORT-001` | Soul App production code must not import Host private packages or sibling app `src`; Host code must not import Soul App `src`. Public SDK, runtime harnesses, manifests, mount descriptors and shared fixtures are the allowed boundary objects. | Shared boundary | `scripts/check-soul-app-boundaries.ts` (via `lint`), `scripts/check-soul-app-boundaries.test.ts` | Host and Soul App skills |
```

- [ ] **Step 2: 跑文档合同检查**

Run: `bun run docs:check`
Expected: PASS（若失败，确认是否仅来自未迁移的 companion active docs，与本改动无关）。

- [ ] **Step 3: 提交**

```bash
git add docs/architecture.md
git commit -m "docs: 修正 IMPORT-001 的 Enforced-by 为真实执行点"
```

---

## Task 6: 清理 H6（幽灵目录 + Repository Map 漏登）

**Files:**
- Delete（文件系统）: `packages/gateway/`、`packages/gateway-proto/`
- Modify: `docs/architecture.md` Repository Map（`apps/` 与 `packages/` 块）

- [ ] **Step 1: 删除幽灵目录**

```bash
rm -rf packages/gateway packages/gateway-proto
git status --porcelain packages/gateway packages/gateway-proto
```

Expected: `git status` 无输出——这两个目录只含陈旧 `node_modules`、无 git 跟踪文件，删除不产生 git 变更（纯文件系统清理）。无需为此单独 commit。

- [ ] **Step 2: 补登 Repository Map**

在 `docs/architecture.md` 的 Repository Map 代码块中：

`apps/` 块在 `aiworker-qa/` 行后加入：

```
  aiworker-custom/  official general-purpose Soul App
```

`packages/` 块在 `soul-app-runtime/` 行后加入：

```
  soul-app-workbench/ Soul-owned shared workbench UI surfaces
```

- [ ] **Step 3: 跑文档合同检查**

Run: `bun run docs:check`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add docs/architecture.md
git commit -m "docs: Repository Map 补登 soul-app-workbench 与 aiworker-custom"
```

---

## 收尾验证（全部任务完成后）

- [ ] **Step 1: 跑完整 lint（守卫的真实执行入口）**

Run: `bun run lint`
Expected: PASS——确认守卫接入 `lint` 后整体通过。

- [ ] **Step 2: 跑守卫单测全绿**

Run: `bun test scripts/check-soul-app-boundaries.test.ts`
Expected: PASS（原 2 + 新增 6 条用例）。

- [ ] **Step 3: 人工反向确认（防共谋）**

临时把 `discoverSoulApps` 的过滤改回 `&& existsSync(path.join(app.dir, 'src'))`，跑
`bun test scripts/check-soul-app-boundaries.test.ts`，确认"真违规被捕获""发现官方 app"等用例
**变红**；确认后还原改动。这一步验证测试确实能卡住"修复前实现"，而非又一次共谋。

---

## 非目标（明确不做）

- 不接入 `aiworker app validate`（仅改 IMPORT-001 措辞）。
- 不为 Host 侧扫描添加 manifest import 豁免（当前无 Host→Soul import，YAGNI）。
- 不动 H2/H3/H4——各自独立 spec。H1 修好后守卫会自动开始报出 H2 的违规点，由 H2 整改承接。
