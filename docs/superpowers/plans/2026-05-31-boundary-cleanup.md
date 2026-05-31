# 边界收口(P1→P3,不含 C-ID)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落实统一边界 spec(`docs/superpowers/specs/2026-05-31-boundary-unified-design.md`)中除 C-ID 外的全部收口项,按严重度 P1→P3,每项配 locking test 并入 `release:check`。

**Architecture:** 契约测试锁定 + TDD。每项先写/扩一个 `tests/architecture/*` 或 `scripts/check-*` 守卫(红),再做最小修复(绿)。C-ID(soulId/appId 收敛,跨层契约级)在独立计划 `2026-05-31-soul-app-id-convergence.md`,不在本计划。

**Tech Stack:** Bun test、drizzle、zod、ripgrep;契约测试在 `tests/architecture/`,跑 `bun run test:contracts`。

**前置(计划起点必做):** 向用户逐条确认 spec §7 的 6 个 product-bet 是否纳入。本计划默认**不**实现任何 product-bet(它们不是渗漏)。

**检测口径护栏(spec §1,新增扫描类测试必须遵守):** ① 捕获动态 `import()`;② 扫 src 外消费;③ 排除 test/fixture 与字符串字面量;④ exports-aware;⑤ doc-contract 逐字严格——改 canon 必须同步 `check-doc-contract.ts` pin 串。

---

## P1

### Task 1: F1 — 断 `soul-protocol` 类型-only barrel 环

**事实:** `packages/soul-protocol/src/soul-app/registry.ts:2` 是 `import type { SoulDescriptorV1 } from '..'`(根 barrel),而 barrel `index.ts:307` 又 `export * from './soul-app'` → soul-app/index.ts → registry.ts,构成环。该环是 **type-only**(运行时已擦除,无运行时环),但 madge 报告且属命名/结构异味。`SoulDescriptorV1` 定义在 `index.ts:217`,其 schema `soulDescriptorV1Schema`(:201-215)只依赖 index.ts 内的 `hostInterpretedObjectSchema/workbenchSchema/appOwnedApiSchema/engineSchema/externalObjectSchema`,**不依赖 soul-app**,故可整簇抽到叶子模块。

**Files:**
- Create: `packages/soul-protocol/src/descriptor.ts`
- Modify: `packages/soul-protocol/src/index.ts`(移出 descriptor 簇 + 改为 re-export)
- Modify: `packages/soul-protocol/src/soul-app/registry.ts:2`(import 从 `..` 改 `../descriptor`)
- Test: `tests/architecture/package-ownership.test.ts`(加 no-barrel-cycle 守卫)

- [ ] **Step 1: 写失败的守卫测试**(锁"soul-app 子模块不得 import 根 barrel")

在 `tests/architecture/package-ownership.test.ts` 末尾的 `describe('target package ownership', ...)` 内追加:

```ts
test('soul-protocol/soul-app modules do not import the package root barrel (no type-only cycle)', () => {
  const dir = join(repoRoot, 'packages/soul-protocol/src/soul-app')
  const offenders: string[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts'))
      continue
    const src = readFileSync(join(dir, file), 'utf8')
    // 匹配 `from '..'` 或 `from '../index'`(根 barrel),含 `import type`
    if (/from\s+['"]\.\.(?:\/index)?['"]/.test(src))
      offenders.push(`packages/soul-protocol/src/soul-app/${file}`)
  }
  expect(offenders, 'soul-app modules must import leaf modules, not the root barrel').toEqual([])
})
```

确认顶部已 import `readdirSync`(若无则加进现有 `node:fs` import)。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/architecture/package-ownership.test.ts -t "do not import the package root barrel"`
Expected: FAIL,offenders 含 `.../soul-app/registry.ts`。

- [ ] **Step 3: 抽 descriptor 簇到叶子模块**

先读 `packages/soul-protocol/src/index.ts:1-220` 枚举 `soulDescriptorV1Schema` 引用到的本地 schema(`SOUL_DESCRIPTOR_V1_PROTOCOL`、`hostInterpretedObjectSchema`、`hostInterpretedArraySchema`、`workbenchSchema`、`appOwnedApiSchema`、`engineSchema`、`externalObjectSchema`、`rejectForbiddenHostInterpretedFields` 及它们各自的依赖)。把这一簇 + `soulDescriptorV1Schema` + `SoulDescriptorV1` + `parseSoulDescriptorV1` 整体**剪切**进新建 `packages/soul-protocol/src/descriptor.ts` 并 `export`。该叶子**不得** import `./soul-app`。

- [ ] **Step 4: index.ts 改为 re-export**

在 `packages/soul-protocol/src/index.ts` 原位置替换为:

```ts
export * from './descriptor'
```

(保留原有 `export * from './soul-app'` 等不动。)确认无其它文件因路径变化报错。

- [ ] **Step 5: registry.ts 指向叶子**

`packages/soul-protocol/src/soul-app/registry.ts:2`:

```ts
import type { SoulDescriptorV1 } from '../descriptor'
```

- [ ] **Step 6: 跑守卫 + 类型 + 全包测试确认绿**

Run: `bun test tests/architecture/package-ownership.test.ts -t "root barrel" && bun run --filter '@zonease/aiworker-soul-protocol' typecheck && bun run --filter '@zonease/aiworker-soul-protocol' test`
Expected: 全 PASS。

- [ ] **Step 7: 可选复核环已断**

Run: `bunx madge --circular --extensions ts packages/soul-protocol/src 2>&1 | tail -3`
Expected: `No circular dependency found` 或不再含 index→soul-app→registry 环。

- [ ] **Step 8: 提交**

```bash
git add packages/soul-protocol/src/descriptor.ts packages/soul-protocol/src/index.ts packages/soul-protocol/src/soul-app/registry.ts tests/architecture/package-ownership.test.ts
git commit -m "refactor(soul-protocol): 抽 descriptor 簇到叶子模块断 type-only barrel 环(F1)"
```

### Task 2: F2 — worker-cli 声明 soul-app-sdk + 去深穿 import

**事实:** `apps/worker-cli/src/aiworker.ts:5` 是 `import type { SoulDiscovery, SoulValidationIssue } from '../../../packages/soul-app-sdk/src/index'`(深穿 sibling 源码),且 `apps/worker-cli/package.json` 的 devDependencies **未声明** `@zonease/aiworker-soul-app-sdk`(prod `scaffold.ts` 已用包名引用它 → 幻影依赖)。soul-app-sdk 单一入口 export `.`(`exports:["."]`)。

**Files:**
- Modify: `apps/worker-cli/package.json`(devDependencies 加 soul-app-sdk)
- Modify: `apps/worker-cli/src/aiworker.ts:5`(改走包名)
- Test: `tests/architecture/package-ownership.test.ts`(加禁深穿 + 声明依赖完整)

- [ ] **Step 1: 写失败守卫**

在 `tests/architecture/package-ownership.test.ts` 追加:

```ts
test('worker-cli declares soul-app-sdk and uses no deep sibling-source imports', () => {
  const cliPkg = JSON.parse(readFileSync(join(repoRoot, 'apps/worker-cli/package.json'), 'utf8')) as PackageJson
  const allDeps = { ...(cliPkg.dependencies ?? {}), ...(cliPkg.devDependencies ?? {}) }
  expect(allDeps, 'worker-cli must declare its soul-app-sdk usage').toHaveProperty('@zonease/aiworker-soul-app-sdk')

  const deepImports: string[] = []
  for (const root of ['apps/worker-cli/src', 'apps/worker-web/src', 'packages']) {
    for (const file of walkTsFiles(join(repoRoot, root))) {
      if (/from\s+['"][^'"]*\.\.\/[^'"]*packages\/[^'"]+\/src\//.test(readFileSync(file, 'utf8')))
        deepImports.push(relative(repoRoot, file))
    }
  }
  expect(deepImports, 'no module may deep-import a sibling package /src').toEqual([])
})
```

若 `walkTsFiles`/`relative` 未在文件中定义,复用文件内既有递归列举工具或在测试顶部加最小 `walkTsFiles`(用 `readdirSync(..,{withFileTypes:true})` 递归,跳过 `node_modules`/`dist`);`relative` 从 `node:path` import。

- [ ] **Step 2: 跑确认失败**

Run: `bun test tests/architecture/package-ownership.test.ts -t "declares soul-app-sdk"`
Expected: FAIL(缺声明 + 命中 `aiworker.ts:5` 深穿)。

- [ ] **Step 3: 声明依赖**

`apps/worker-cli/package.json` devDependencies 加(按字母序插入 `@zonease/aiworker-soul-protocol` 前):

```json
"@zonease/aiworker-soul-app-sdk": "workspace:*",
```

- [ ] **Step 4: 改 import 走包名**

`apps/worker-cli/src/aiworker.ts:5`:

```ts
import type { SoulDiscovery, SoulValidationIssue } from '@zonease/aiworker-soul-app-sdk'
```

确认这两个类型在 soul-app-sdk 的公开入口(`exports:"."`)已导出;若未导出,先在 `packages/soul-app-sdk/src/index.ts` 补 `export type { SoulDiscovery, SoulValidationIssue }`(读该文件确认)。

- [ ] **Step 5: 装包 + 跑绿**

```bash
bun install
bun test tests/architecture/package-ownership.test.ts -t "declares soul-app-sdk"
bun run --filter '@zonease/aiworker-cli' typecheck
```
Expected: 全 PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/worker-cli/package.json apps/worker-cli/src/aiworker.ts tests/architecture/package-ownership.test.ts bun.lock
git commit -m "fix(worker-cli): 声明 soul-app-sdk 依赖 + 去深穿 sibling 源码 import(F2)"
```

---

## P2

### Task 3: F-DEP — 移除 engine-projection / worker-daemon 未用的 fs-layout 依赖

**事实:** `engine-projection`、`worker-daemon` 的 `dependencies` 含 `@zonease/aiworker-fs-layout`,但两包 src 零引用(含 type/dynamic,已 grep 确认)。

**Files:**
- Modify: `packages/engine-projection/package.json`、`packages/worker-daemon/package.json`
- Test: `tests/architecture/package-ownership.test.ts`(per-package dep-used 守卫)

- [ ] **Step 1: 写失败守卫**(窄向量:仅这两包,避免全仓 dep-used 误伤)

```ts
test('engine-projection and worker-daemon declare no unused internal deps', () => {
  const cases = ['packages/engine-projection', 'packages/worker-daemon']
  const offenders: string[] = []
  for (const pkgDir of cases) {
    const pkg = JSON.parse(readFileSync(join(repoRoot, pkgDir, 'package.json'), 'utf8')) as PackageJson
    const declared = Object.keys({ ...(pkg.dependencies ?? {}) }).filter(d => d.startsWith('@zonease/aiworker'))
    const srcText = walkTsFiles(join(repoRoot, pkgDir, 'src'))
      .filter(f => !/\.(test|spec)\.[cm]?tsx?$/.test(f))
      .map(f => readFileSync(f, 'utf8')).join('\n')
    for (const dep of declared) {
      if (!srcText.includes(dep))
        offenders.push(`${pkgDir} -> ${dep}`)
    }
  }
  expect(offenders, 'declared runtime deps must be referenced in src').toEqual([])
})
```

- [ ] **Step 2: 跑确认失败** → Expected: FAIL,offenders = 两条 `... -> @zonease/aiworker-fs-layout`。
- [ ] **Step 3: 删依赖** — 从两个 package.json 的 `dependencies` 删 `@zonease/aiworker-fs-layout` 行。
- [ ] **Step 4: 装包 + 跑绿**

```bash
bun install && bun test tests/architecture/package-ownership.test.ts -t "no unused internal deps" && bun run --filter '@zonease/aiworker-engine-projection' typecheck && bun run --filter '@zonease/aiworker-worker-daemon' typecheck
```
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/engine-projection/package.json packages/worker-daemon/package.json tests/architecture/package-ownership.test.ts bun.lock
git commit -m "chore(deps): 移除 engine-projection/worker-daemon 未用的 fs-layout 依赖(F-DEP)"
```

### Task 4: F3 — soul-app-runtime 移除未用 soul-app-sdk 依赖

**事实:** `packages/soul-app-runtime` 声明 `@zonease/aiworker-soul-app-sdk` 但 src 零引用。接线(让 golden-path/mount 真用 harness)属 spec §7 待续,不在本计划。

**Files:** Modify `packages/soul-app-runtime/package.json`;复用 Task 3 的 dep-used 守卫(把 `packages/soul-app-runtime` 加进 `cases`)。

- [ ] **Step 1: 把 soul-app-runtime 加进 Task 3 测试的 `cases` 数组** → 跑确认 FAIL(`packages/soul-app-runtime -> @zonease/aiworker-soul-app-sdk`)。
- [ ] **Step 2: 删依赖** — 从 `packages/soul-app-runtime/package.json` 的 `dependencies` 删 `@zonease/aiworker-soul-app-sdk` 行。
- [ ] **Step 3: 跑绿**

```bash
bun install && bun test tests/architecture/package-ownership.test.ts -t "no unused internal deps" && bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck
```
- [ ] **Step 4: 提交**

```bash
git add packages/soul-app-runtime/package.json tests/architecture/package-ownership.test.ts bun.lock
git commit -m "chore(deps): 移除 soul-app-runtime 未用的 soul-app-sdk 依赖(F3)"
```

### Task 5: F4 — soul-workbench 归属校正到 SDK(三处同步)+ 移除过早未用 dep

**事实(D2 决策):** common workbench 归属以 SDK 为准。"soul-workbench owns common workbench" 三处编码:`docs/soul-authoring.md:106-108`、`scripts/check-doc-contract.ts:353-355`(逐字 pin)、`packages/soul-workbench/src/index.ts` 的 `owns` 列表。且 soul-workbench 声明 `ui`+`soul-protocol` 但 src(仅 `index.ts` 桩)零引用。

**Files:** `docs/soul-authoring.md`、`scripts/check-doc-contract.ts`、`packages/soul-workbench/src/index.ts`、`packages/soul-workbench/package.json`、Task 3 dep-used 守卫。

- [ ] **Step 1: 改 canon `docs/soul-authoring.md`** — 把 `:106-108` 的 `\`packages/soul-workbench\` owns common workbench modules, common configuration UI, skills/MCP UI, artifact primitives, mounted client helpers, and React components for Soul workbench authors.` 改为以 SDK 为准的措辞,例如:

```text
`packages/soul-app-sdk` owns the common workbench modules, common configuration UI,
skills/MCP UI, artifact primitives, and mounted client helpers. `packages/soul-workbench`
is a thin shell pending consolidation and owns no production workbench modules in v1.
```

- [ ] **Step 2: 同步 `scripts/check-doc-contract.ts` 的 pin 串**(逐字)— 把该文件中与上句对应的 pin 字符串(`'\`packages/soul-workbench\` owns common workbench modules,...'`,见 :353-355)改成与 Step 1 完全一致的新措辞;并确认 `'\`packages/soul-app-sdk\` owns:'` 上下文不冲突。
- [ ] **Step 3: 改桩 `packages/soul-workbench/src/index.ts`** — 把 `owns: [...]` 列表清空或改为反映"薄壳"的真实状态:

```ts
export const soulWorkbenchPackage = {
  name: '@zonease/aiworker-soul-workbench',
  owns: [], // v1 薄壳:common workbench 归 soul-app-sdk(见 docs/soul-authoring.md)
} as const
```

- [ ] **Step 4: 移除过早未用 dep** — 从 `packages/soul-workbench/package.json` 的 `dependencies` 删 `@zonease/aiworker-ui` 与 `@zonease/aiworker-soul-protocol`(`react` 是否保留取决于桩是否含 JSX;当前 index.ts 无 JSX,可一并删 `react` 与 `@types/react`)。把 `packages/soul-workbench` 加进 Task 3 dep-used 守卫 `cases`。
- [ ] **Step 5: 跑绿**

```bash
bun install && bun run docs:check && bun test tests/architecture/package-ownership.test.ts -t "no unused internal deps" && bun run --filter '@zonease/aiworker-soul-workbench' typecheck
```
Expected: `docs:check`(check-doc-contract)PASS(pin 与 doc 一致)、dep-used PASS。

- [ ] **Step 6: 提交**

```bash
git add docs/soul-authoring.md scripts/check-doc-contract.ts packages/soul-workbench tests/architecture/package-ownership.test.ts bun.lock
git commit -m "docs+chore(soul-workbench): common workbench 归属校正到 SDK(D2/F4)+ 移除过早未用 dep"
```

### Task 6: F5 — `HOST_PRIVATE_*` 重命名为 `WORKER_PRIVATE_*`

**事实:** `apps/worker-cli/src/soul-app-boundary.ts:16` `HOST_PRIVATE_IMPORT_PREFIXES`、`:40` `CURRENT_HOST_PRIVATE_ROOTS` 列的全是 worker 私有包;无契约 pin 该标识符(已 grep 确认)。

**Files:** `apps/worker-cli/src/soul-app-boundary.ts`、其引用方(`soul-app-boundary.test.ts` 等,grep 确认)、新守卫。

- [ ] **Step 1: 写失败守卫** — 在 `tests/architecture/package-ownership.test.ts` 加:

```ts
test('worker-cli boundary module uses worker-plane naming, not stale HOST_PRIVATE', () => {
  const src = readFileSync(join(repoRoot, 'apps/worker-cli/src/soul-app-boundary.ts'), 'utf8')
  expect(src.includes('HOST_PRIVATE'), 'post-inversion these are WORKER_PRIVATE packages').toBe(false)
})
```

- [ ] **Step 2: 跑确认失败** → FAIL。
- [ ] **Step 3: 重命名标识符** — 在 `soul-app-boundary.ts` 把 `HOST_PRIVATE_IMPORT_PREFIXES`→`WORKER_PRIVATE_IMPORT_PREFIXES`、`CURRENT_HOST_PRIVATE_ROOTS`→`CURRENT_WORKER_PRIVATE_ROOTS`(含 export 与全部引用)。Run `rg -n "HOST_PRIVATE" apps/worker-cli/src` 定位全部引用点(含 `.test.ts`)逐一改名。
- [ ] **Step 4: 跑绿**

```bash
rg -n "HOST_PRIVATE" apps/worker-cli && echo "STILL PRESENT" || echo "clean"
bun test tests/architecture/package-ownership.test.ts -t "worker-plane naming"
bun test apps/worker-cli/src/soul-app-boundary.test.ts
bun run --filter '@zonease/aiworker-cli' typecheck
```
Expected: clean + PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/worker-cli/src/soul-app-boundary.ts apps/worker-cli/src/soul-app-boundary.test.ts tests/architecture/package-ownership.test.ts
git commit -m "refactor(worker-cli): HOST_PRIVATE_* → WORKER_PRIVATE_*(倒置后命名收口,F5)"
```

### Task 7: F8 — 边界扫描逻辑去重(单一 scanner 模块)

**事实:** `scripts/check-soul-app-boundaries.ts` 与 `apps/worker-cli/src/soul-app-boundary.ts` 手工并行重实现同一套 soul-app import 扫描。需先读两文件确认共享子集(importSpecifiers / resolveRelativeImport / 禁前缀判定 / rawWebStorage 检测)。

**Files:** Create `packages/soul-app-sdk/src/boundary-scan.ts`(或 worker-cli/src 下的共享模块,取决于谁能被双方 import——脚本在 repo 根、CLI 在 apps,二者都能 import 一个 package);Modify 两个使用点;新守卫。

- [ ] **Step 1: 写失败守卫**(single-source:两处都 import 同一模块)

```ts
test('soul-app boundary scan logic has a single source', () => {
  const sharedModule = '@zonease/aiworker-soul-app-sdk/boundary-scan'
  const cli = readFileSync(join(repoRoot, 'apps/worker-cli/src/soul-app-boundary.ts'), 'utf8')
  const script = readFileSync(join(repoRoot, 'scripts/check-soul-app-boundaries.ts'), 'utf8')
  expect(cli.includes(sharedModule) && script.includes(sharedModule), 'both must import the shared scanner').toBe(true)
})
```

- [ ] **Step 2: 跑确认失败** → FAIL。
- [ ] **Step 3: 抽共享 scanner** — 读 `scripts/check-soul-app-boundaries.ts` 与 `apps/worker-cli/src/soul-app-boundary.ts`,把共有的纯函数(`importSpecifiers`、`normalizedImport`、`resolveRelativeImport`、`isInside`、`rawWebStorageSymbols`、禁前缀/roots 常量与判定)抽到新建 `packages/soul-app-sdk/src/boundary-scan.ts` 并 export;在 `packages/soul-app-sdk/package.json` 的 `exports` 加 `"./boundary-scan"` 子路径。
- [ ] **Step 4: 两处改为 import 共享模块** — 删两文件内的重复实现,改 `import { ... } from '@zonease/aiworker-soul-app-sdk/boundary-scan'`;worker-cli package.json 已在 Task 2 声明 soul-app-sdk;`scripts/` 由根 package 解析 workspace。
- [ ] **Step 5: 跑绿**

```bash
bun install
bun test tests/architecture/package-ownership.test.ts -t "single source"
bun run lint   # 含 check-soul-app-boundaries.ts
bun test scripts/check-soul-app-boundaries.test.ts apps/worker-cli/src/soul-app-boundary.test.ts
```
Expected: PASS(行为不变,逻辑单源)。

- [ ] **Step 6: 提交**

```bash
git add packages/soul-app-sdk apps/worker-cli/src/soul-app-boundary.ts scripts/check-soul-app-boundaries.ts tests/architecture/package-ownership.test.ts bun.lock
git commit -m "refactor(boundary): 抽单一 soul-app boundary scanner,去 worker-cli/script 重复(F8)"
```

### Task 8: C-CANON — canon 文案显式化(配合 doc-contract pin)

**事实:** spec §5 列 5 处 canon 更新。每处都需同步 `scripts/check-doc-contract.ts` 的逐字 pin(`docs:check` 守)。本任务**不含** describe.soulId/templateId 消歧(那随 C-ID 计划做)与 workbench 归属(已在 Task 5)。

**Files:** `docs/runtime.md`、`docs/architecture.md`、`tests/architecture/freeform-mounted-workbench-contract.test.ts`、`scripts/check-doc-contract.ts`。

- [ ] **Step 1:** 读 `scripts/check-doc-contract.ts` 找到 workbench-entry 解析、assignment/lifecycle、session deleted 的现有 pin 串(`rg -n "workbench entry|Host resolves|assignment|deleted" scripts/check-doc-contract.ts`)。
- [ ] **Step 2: 改 canon 措辞**(逐处):
  - `docs/architecture.md:132-134` / `docs/protocol.md:84-90`:"Host resolves one workbench entry" → 明确 **worker-daemon 解析 workbench entry / fallback / 资产 serving,Host 仅 mount**。
  - `docs/runtime.md`(或 architecture.md):新增一句声明 **v1 assignment=validate-only echo、lifecycle=acknowledge-only**(connector 行为 canon 已 out-of-scope)。
  - `docs/runtime.md:27-30,204-206`:消歧 session `deleted`(与 §7 product-bet #3 的决定一致;若 product-bet 未定则本步只加"deleted 语义待 §7 决定"占位**不可**——改为暂缓本子项到 product-bet 拍板)。
  - `docs/runtime.md`(projection/lifecycle):补 session context 文件随 physical workspace root 删除清理、lifecycle delete 保留。
- [ ] **Step 3: 同步 pin 串** — 对每处改动,把 `scripts/check-doc-contract.ts` 中对应 pin 改成与新措辞**逐字一致**。
- [ ] **Step 4: 改 stale 测试标题** — `tests/architecture/freeform-mounted-workbench-contract.test.ts:33` 的 `'Host daemon mount resolver is locator-driven...'` → `'Worker daemon mount resolver is locator-driven...'`。
- [ ] **Step 5: 跑绿**

```bash
bun run docs:check && bun test tests/architecture/freeform-mounted-workbench-contract.test.ts tests/architecture/refactor-contract.test.ts
```
Expected: PASS(doc 与 pin 一致;refactor-contract 不因 architecture.md 改动而红——若红,该处文案被 refactor-contract pin,一并同步)。

- [ ] **Step 6: 提交**

```bash
git add docs/ scripts/check-doc-contract.ts tests/architecture/freeform-mounted-workbench-contract.test.ts
git commit -m "docs(canon): 显式化 workbench 解析归属/v1 assignment-lifecycle/session 清理(C-CANON)"
```

---

## P3

### Task 9: C-HS — 把 host 壳纳入 soul-app import 守卫(唯一确认的边界违反)

**事实:** `scripts/check-soul-app-boundaries.ts:171-176` 的 `scanHostImports` 的 `hostRoots` 缺 `apps/host-cli`、`apps/host-web` → "Host code must not import Soul App internals"(:185,190)对两个真实 host 壳无守卫。当前零违背(host-cli 仅 import host-control+cac,host-web 仅 import ui+react/micro-app),是守护空洞。**只补 souls/* 相对 import 这一窄向量,切勿引入 @zonease 依赖白名单**(会误禁 host 合法消费 soul-protocol)。

**Files:** `scripts/check-soul-app-boundaries.ts:171-176`、`scripts/check-soul-app-boundaries.test.ts`。

- [ ] **Step 1: 写失败守卫** — 在 `scripts/check-soul-app-boundaries.test.ts` 加一例:构造一个 fixture 或断言 host-cli/host-web 在 scan 范围内。最小可行:断言 `scanHostImports` 的覆盖根含两壳(读 scanner 重构后导出的 hostRoots,或用一个临时 fixture 文件在 apps/host-cli 下写一个指向 `souls/aiworker-freeform/` 的相对 import 并期望被报)。推荐 fixture 法:

```ts
test('scanHostImports covers apps/host-cli and apps/host-web', () => {
  // host-cli/host-web 出现指向 souls/<app>/ 的相对 import 时必须被守卫捕获
  const issues = collectBoundaryIssues() // 复用脚本导出的聚合入口
  // 反向断言:hostRoots 集合包含两壳(脚本需导出该集合或提供可注入根)
  expect(hostScanRoots()).toEqual(expect.arrayContaining(['apps/host-cli', 'apps/host-web']))
})
```

(若脚本未导出 `hostScanRoots`,Step 3 同时小幅导出之,便于断言;保持窄改。)

- [ ] **Step 2: 跑确认失败** → FAIL(两壳不在 hostRoots)。
- [ ] **Step 3: 补 hostRoots** — `scripts/check-soul-app-boundaries.ts:171-176` 改为:

```ts
const hostRoots = [
  path.join(repoRoot, 'apps/worker-cli'),
  path.join(repoRoot, 'apps/worker-web'),
  path.join(repoRoot, 'apps/host-cli'),
  path.join(repoRoot, 'apps/host-web'),
  path.join(repoRoot, 'packages'),
  path.join(repoRoot, 'scripts'),
].filter(existsSync)
```

(不动 :184/:189 的 souls/* 与相对 import 判定逻辑——窄向量。)

- [ ] **Step 4: 跑绿**

```bash
bun test scripts/check-soul-app-boundaries.test.ts && bun run lint
```
Expected: PASS(两壳今天零违背,守卫绿)。

- [ ] **Step 5: 提交**

```bash
git add scripts/check-soul-app-boundaries.ts scripts/check-soul-app-boundaries.test.ts
git commit -m "fix(boundary): scanHostImports 纳入 host-cli/host-web(C-HS,唯一确认边界违反的守护空洞)"
```

### Task 10: F6 — 清 `package-ownership.test.ts` 的 stale "host-daemon" 文案

**事实:** `tests/architecture/package-ownership.test.ts:85` 标题 `'local daemon lives in the final host-daemon package'`、`:100` 变量 `hostDaemonPackage` 是 stale(断言已对 worker-daemon)。`docs/architecture.md:192` 等历史 rename 描述**不动**。

**Files:** `tests/architecture/package-ownership.test.ts` only。

- [ ] **Step 1: 改标题 + 变量名** — `:85` 标题改 `'local daemon lives in the final worker-daemon package'`;`:100` 变量 `hostDaemonPackage` → `workerDaemonPackage`(含其下引用)。
- [ ] **Step 2: 跑绿** — `bun test tests/architecture/package-ownership.test.ts`(断言不变,纯文案)。Expected: PASS。
- [ ] **Step 3: 提交**

```bash
git add tests/architecture/package-ownership.test.ts
git commit -m "test(architecture): 清 package-ownership 的 stale host-daemon 标题/变量(F6)"
```

### Task 11: F9 — `soul-app-boundary.ts` 日文注释改中文

**事实:** `apps/worker-cli/src/soul-app-boundary.ts` 注释为日文(如 `#3: ディレクトリ名ではなく...`),违反 AGENTS.md「注释默认中文」。难以测试,作为 review 项(lint 不强制)。

**Files:** `apps/worker-cli/src/soul-app-boundary.ts` only。

- [ ] **Step 1: 定位日文注释** — `rg -n "[ぁ-んァ-ヶ一-龯]" apps/worker-cli/src/soul-app-boundary.ts`。
- [ ] **Step 2: 逐条改写为中文**(保持语义,不动代码逻辑)。
- [ ] **Step 3: 跑绿** — `bun run --filter '@zonease/aiworker-cli' typecheck && bun test apps/worker-cli/src/soul-app-boundary.test.ts`。Expected: PASS。
- [ ] **Step 4: 提交**

```bash
git add apps/worker-cli/src/soul-app-boundary.ts
git commit -m "style(worker-cli): soul-app-boundary 注释日文改中文(F9)"
```

---

## 收尾验证

- [ ] **Final: 全量门** — `bun run release:check`(若耗时,至少 `bun run test:contracts && bun run lint && bun run typecheck`)。Expected: 全绿。注意并发共享树:提交前 `git status` 只暂存本计划改动的文件。

## Self-Review 覆盖核对(spec → task)

- §4 C-HS → Task 9 ✓ · C-ID → 独立计划 ✓ · C-CANON → Task 8 ✓
- §6 F1→T1 · F2→T2 · F3→T4 · F4→T5 · F5→T6 · F8→T7 · F-DEP→T3 · F6→T10 · F9→T11 ✓(F7 已撤销,无 task ✓)
- §5 canon:workbench 归属→T5/T8 · assignment/lifecycle→T8 · session deleted→T8(依赖 §7#3 拍板)· describe.soulId/templateId→C-ID 计划 ✓
- 类型一致:新增 dep-used 守卫的 `walkTsFiles`/`cases` 数组在 T3 定义,T4/T5 复用同一测试(同名,扩 `cases`)✓
