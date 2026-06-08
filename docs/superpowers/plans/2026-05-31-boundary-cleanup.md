# 边界收口(P1→P3,不含 C-ID)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落实统一边界 spec(`docs/superpowers/specs/2026-05-31-boundary-unified-design.md`)中除 C-ID 外的全部收口项,按严重度 P1→P3,每项配 locking test 并入 `release:check`。

**Architecture:** 契约测试锁定 + TDD。每项先写/扩一个 `tests/architecture/*` 或 `scripts/check-*` 守卫(红),再做最小修复(绿)。C-ID(soulId/appId 收敛,跨层契约级)在独立计划 `2026-05-31-soul-app-id-convergence.md`,不在本计划。

**Tech Stack:** Bun test、drizzle、zod、ripgrep;契约测试在 `tests/architecture/`,跑 `bun run test:contracts`。

**前置:** 本计划默认**不**实现 spec §7 的任何 product-bet(它们不是渗漏)。唯一耦合点:**只有 product-bet #3(session `deleted` 软/硬态)阻塞 Task 8 的 session-deleted canon 子步**——执行到 Task 8 前确认 #3 即可。其余 5 个 bet 与本计划独立,无需起点统一确认,可随时延后。

**检测口径护栏(spec §1,新增扫描类测试必须遵守):** ① 捕获动态 `import()`;② 扫 src 外消费;③ 排除 test/fixture 与字符串字面量;④ exports-aware;⑤ doc-contract 逐字严格——改 canon 必须同步 `check-doc-contract.ts` pin 串。

---

## P1

### Task 1: F1 — 锁 `soul-protocol` value-import 无环(类型-only barrel 环视为良性)

**事实(调查已降级):** `packages/soul-protocol/src/soul-app/registry.ts:2` 是 `import type { SoulDescriptorV1 } from '..'`——**type-only,编译期擦除,无运行时环**。barrel `index.ts:307 export * from './soul-app'` → soul-app/index.ts → registry.ts → `..` 闭合的这条环**只存在于类型图**;运行时 value import 图已无环。madge 报的 "1 circular" 即这条类型 edge。**spec 标 P1 系严重度高估;调查后的等价事实是运行时无环。** 故采 YAGNI:**锁住 value-import 无环这一真不变量**,把类型-only barrel import 视为良性,**不做大抽取**(抽 `soulDescriptorV1Schema` 簇风险高:若其传递闭包引用 `./soul-app/*` 会重建环,且收益仅为类型洁癖)。

**Files:** `tests/architecture/package-ownership.test.ts`(加 value-only no-barrel 守卫)。

- [ ] **Step 1: 写守卫测试**(只禁 **value** import 根 barrel,允许 `import type`)

在 `package-ownership.test.ts` 的 `describe('target package ownership', ...)` 内追加:

```ts
test('soul-protocol/soul-app modules have no VALUE import of the package root barrel (runtime acyclic)', () => {
  const dir = join(repoRoot, 'packages/soul-protocol/src/soul-app')
  const offenders: string[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts'))
      continue
    const src = readFileSync(join(dir, file), 'utf8')
    // 匹配 value import（排除 `import type ...`）from '..' / '../index'
    if (/^\s*import\s+(?!type[\s{])[^;\n]*\sfrom\s+['"]\.\.(?:\/index)?['"]/m.test(src))
      offenders.push(`packages/soul-protocol/src/soul-app/${file}`)
  }
  expect(offenders, 'soul-app modules must not VALUE-import the root barrel (would create a runtime cycle)').toEqual([])
})
```

确认顶部已 import `readdirSync`(若无则加进现有 `node:fs` import)。

- [ ] **Step 2: 跑测试 — 今天即 PASS**

Run: `bun test tests/architecture/package-ownership.test.ts -t "runtime acyclic"`
Expected: PASS(registry.ts:2 是 `import type`,被豁免)。这是**绿守卫**,锁住已干净的运行时态、防未来引入 value 级 barrel 环(对 F1 这是 red→green 的反向:先确立"运行时本就无环"的事实,再加锁)。

- [ ] **Step 3: 提交**

```bash
git add tests/architecture/package-ownership.test.ts
git commit -m "test(soul-protocol): 锁 value-import 无环(F1;类型-only barrel 环视为良性)"
```

> **可选后续(deferred,非本计划):** 若要连类型 edge 也清(纯结构洁癖),可把 `soulDescriptorV1Schema` 簇抽到叶子 `descriptor.ts` 并让 registry 从 `../descriptor` import——**但先验证该簇传递闭包(`engineSchema`/`appOwnedApiSchema`/`hostInterpretedObjectSchema` 等)不引用 `./soul-app/*`,否则抽取会重建环**。收益低(类型 edge 无运行时影响),默认不做。

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

> **局限注记:** `srcText.includes(dep)` 也会命中注释/字符串里的包名,作为**长期守卫**会 false-negative(漏报注释里提及的真未用 dep)。本计划只用它清除已坐实的 fs-layout/soul-app-sdk 已知项,够用;若要做长期严守,后续可换 AST/`import` 语句解析。

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

**事实补充(家是个边界决策):****不要**为去重而扩张产品包 `soul-app-sdk` 的公开 `exports`(当前仅 `["."]`)——那是用 lint/build 关注污染产品公开面,正是本轮要消的归属不洁。worker-cli `soul-app-boundary.ts` 与 `scripts/check-soul-app-boundaries.ts` 都在 dev/test 跑。

**Files:** 取决于 Step 0 决策;新守卫在 `tests/architecture` 或 `scripts/*.test.ts`。

- [ ] **Step 0: 决定去重形态(边界决策)** — 先确认 worker-cli `soul-app-boundary.ts` 是 runtime 还是仅 test 消费(`rg -n "soul-app-boundary" apps/worker-cli/src`)。再二选一:
  - **A(推荐,不增公开面):dedup-by-contract** — 不强制物理共享模块,加一个**行为一致性(parity)守卫**:同一组 fixture 输入下,断言 worker-cli 扫描器与脚本扫描器产出**逐条相同**,锁住"二者不漂移"。
  - **B:物理单源到中性内部位置** — 仅当存在不跨 root、不扩张产品包公开面的中性家(如标注 internal 的 `scripts/lib/` 模块**且** worker-cli 能不深穿地 import)时才选;**禁止**放进 `soul-app-sdk` 公开 `exports`。
- [ ] **Step 1: 写失败守卫**
  - A:构造 fixture import 串数组,分别喂 worker-cli 的 `scanPrivateImports`/`scanRawWebStorageUsage` 与脚本等价入口,`expect(cliResult).toEqual(scriptResult)`;若两实现已完全一致则先注入一个已知差异 fixture 使其 FAIL,再对齐。
  - B:single-source 守卫——断言两处都 import 同一中性模块路径。
- [ ] **Step 2: 跑确认失败** → FAIL。
- [ ] **Step 3: 对齐/抽取** — A:把两扫描器差异对齐到同一逻辑(就地或共享一个**非公开** util);B:抽共有纯函数(`importSpecifiers`/`normalizedImport`/`resolveRelativeImport`/`isInside`/`rawWebStorageSymbols`/禁前缀常量)到中性内部模块,两处 import。
- [ ] **Step 4:** A:确认 parity 绿;B:删两处重复实现。
- [ ] **Step 5: 跑绿**

```bash
bun install   # 仅 B 且新增/改动了 package 时需要
bun test tests/architecture   # 含新 parity/single-source 守卫
bun run lint   # 含 check-soul-app-boundaries.ts
bun test scripts/check-soul-app-boundaries.test.ts apps/worker-cli/src/soul-app-boundary.test.ts
```
Expected: PASS(行为不变;A 锁 parity,B 锁单源)。

- [ ] **Step 6: 提交**(只暂存实际改动的文件,按 A/B 不同;**不**暂存 `packages/soul-app-sdk` 除非 Step 0 选了一个不扩张其公开 `exports` 的中性家)

```bash
git add -p   # 逐块确认实际改动
git commit -m "refactor(boundary): soul-app boundary scan 去 worker-cli/script 漂移(F8)"
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
