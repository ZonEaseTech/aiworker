# 发版前 P0+P1 整改实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-05-23 零信任深审的全部 P0+P1,使整个本地产品达到可发版状态(绿灯 gate + 关闭 secret/边界/鉴权/穿越风险 + 彻底收敛 Host 领域语义与协议面)。

**Architecture:** 分 7 个阶段顺序执行。Phase 0 先恢复绿灯门槛;Phase 1–4 是安全/边界/鉴权/穿越的局部修复;Phase 5–6 是跨 `packages/shared`+`packages/core`+`packages/soul-app-sdk` 的领域语义/协议面收敛(破坏性,1.0 前允许)。每阶段独立可提交、可验证。基准合同:`docs/architecture.md#constraint-registry`。

**Tech Stack:** Bun workspaces、TypeScript(strict + `noUncheckedIndexedAccess`)、`bun test`、Zod、OpenAPIHono、Drizzle、ESLint(@antfu)。

**对应审查报告:** `docs/superpowers/specs/2026-05-23-pre-release-audit-design.md`

---

## 通用约定

- 每阶段结束跑与改动范围匹配的聚焦命令;Phase 5/6 跨包改动后跑全量 `bun run check`。
- 验证命令:`bun run typecheck`、`bun run lint`、`bun run test`、`bun run check`(= typecheck + lint)。
- 聚焦测试:`bun test <file>`(在对应 package 目录或仓库根用 `bun run --filter <pkg> test`)。
- TDD:先写失败测试 → 跑红 → 最小实现 → 跑绿 → commit。Commit message 用中文 + Conventional type。
- **不改 D/H 之外的架构语义**;不为未要求的旧入口加 shim。

---

## Phase 0 — 恢复绿灯门槛(P0-A)

发版按最严口径:`typecheck`/`lint`/`test` 任一红即阻发版。本阶段三项根因都是机械/陈旧。

### Task 0.1: 修 storage-sqlite 测试的严格索引类型错误

**Files:**
- Modify: `packages/storage-sqlite/src/worker/index.test.ts:337,340`

- [ ] **Step 1: 复现失败**

Run: `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck`
Expected: FAIL —`src/worker/index.test.ts(337,85): error TS2769 ... Type 'undefined' is not assignable to type 'number'`

- [ ] **Step 2: 修复**

`ids` 是 `insertSessionEvent(...).id` 组成的数组,严格索引下 `ids[n]` 为 `number | undefined`。把断言期望数组里的元素改成非空断言,使其类型为 `number[]`:

第 337 行:
```ts
    expect(listSessionEvents(session.id, { after: ids[1] }).map(event => event.id)).toEqual([ids[2]!, ids[3]!, ids[4]!])
```
第 340 行:
```ts
    expect(listSessionEvents(session.id, { after: ids[1], limit: 2 }).map(event => event.id)).toEqual([ids[2]!, ids[3]!])
```
(`{ after: ids[1] }` 这类入参传 `number | undefined` 不报错,因为 `after` 形参本身可选;只有 `toEqual([...])` 的字面数组需要 `number[]`。)

- [ ] **Step 3: 跑绿**

Run: `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck && bun run --filter '@zonease/aiworker-storage-sqlite' test`
Expected: PASS(typecheck 无错;20 测试全绿)

- [ ] **Step 4: Commit**

```bash
git add packages/storage-sqlite/src/worker/index.test.ts
git commit -m "fix: 修正 session events 测试的严格索引类型错误"
```

### Task 0.2: 更新 aiworker-qa 陈旧断言(对齐 BUG-151 移除的硬编码 readiness)

**Files:**
- Modify: `apps/aiworker-qa/host-adapter/index.test.ts:117-118`

- [ ] **Step 1: 复现失败**

Run: `cd apps/aiworker-qa && bun test host-adapter/index.test.ts -t "requires the Host mount token"`
Expected: FAIL — `expect(universalClientJs).toContain('Engine bridge ready')`,Received 为 bundle JS(不含该串)。

- [ ] **Step 2: 确认根因(只读)**

`'Engine bridge ready'` 是 `docs/task/BUG-151.md` 记录的、被有意移除的硬编码 false-positive(client 现在用 `loadMountedEngineReadiness()` 计算真实就绪态)。该断言是对陈旧字面串的检查,需删除/替换为对"真实就绪逻辑存在"的断言。

- [ ] **Step 3: 修复**

删除第 118 行对 `'Engine bridge ready'` 的断言;保留第 117 行 `/api/workspaces` 断言。改为断言 client 包含真实就绪加载逻辑标识(grep 确认 client-entry 实际产出的稳定串):

```ts
      expect(universalClientJs).toContain('/api/workspaces')
      // BUG-151 移除了硬编码 'Engine bridge ready';断言改为校验真实就绪加载路径存在。
      expect(universalClientJs).toContain('/api/local/settings')
```
> 执行前用 `rg -n "loadMountedEngineReadiness|/api/local/settings" packages/soul-app-workbench/src/universal-workbench/client-entry.tsx` 确认该串确实出现在打进 bundle 的源码里;若不在,改用 client-entry 中实际存在的稳定 fetch 路径常量。

- [ ] **Step 4: 跑绿**

Run: `cd apps/aiworker-qa && bun test host-adapter/index.test.ts`
Expected: PASS(7 测试全绿)

- [ ] **Step 5: Commit**

```bash
git add apps/aiworker-qa/host-adapter/index.test.ts
git commit -m "test: 更新 QA mount token 用例,移除对已删除硬编码 readiness 串的断言"
```

### Task 0.3: 清掉 11 个 lint style 错误

**Files:**
- Modify: 多文件(全为 `--fix` 可自动修)。详见审查报告 P0-A;涉及 soul-app-workbench、官方 app web、apps/web、packages/ui。

- [ ] **Step 1: 复现**

Run: `bun run lint`
Expected: FAIL —`✖ 75 problems (11 errors, 64 warnings)`

- [ ] **Step 2: 自动修 + 人工核对**

```bash
bunx eslint . --fix
```
然后 `git diff --stat` 核对改动只是 import 排序、引号、空行、operator-linebreak 等 style,无语义变化。

- [ ] **Step 3: 跑绿**

Run: `bun run lint`
Expected: 0 errors(warnings 可留;`lint` 脚本只在 error 时退出非零)。完整 `eslint . && check-soul-app-boundaries && ui:check && docs:check` 全过。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "style: eslint --fix 清理 import 排序/引号/空行等 11 个 lint error"
```

### Task 0.4: Phase 0 收口验证

- [ ] Run: `bun run check && bun run test`
- [ ] Expected: typecheck PASS、lint 0 error、所有 package 测试全绿。这是发版门槛恢复的客观证据。

---

## Phase 1 — 子进程 env 净化(P0-B + P1-F 的 smoke cwd 部分)

`sanitizeEngineEnv` 已存在(`packages/core/src/worker/engine-env.ts`)但**未从 core 导出**,且 cli smoke / api mounted 两条 spawn 仍裸透传 `process.env`。

### Task 1.1: 从 core 导出 sanitizeEngineEnv

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: 加导出**

在 `packages/core/src/index.ts` 的导出区加入(按现有排序规则插入):
```ts
export { sanitizeEngineEnv } from './worker/engine-env'
```

- [ ] **Step 2: 验证导出可解析**

Run: `bun run --filter '@zonease/aiworker-core' typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "refactor: 从 core 公开导出 sanitizeEngineEnv 供 CLI/API 复用"
```

### Task 1.2: CLI smoke spawn 改用 sanitizeEngineEnv + cwd 校验

**Files:**
- Modify: `apps/cli/src/aiworker.ts`(import 区 + `runMountedServiceSmoke` ~1187-1196)
- Test: `apps/cli/src/aiworker.test.ts`

- [ ] **Step 1: 写失败测试**

在 `apps/cli/src/aiworker.test.ts` 新增(若已有 smoke 相关 describe 则并入):
```ts
import { sanitizeEngineEnv } from '@zonease/aiworker-core'

it('sanitizeEngineEnv strips Host-internal namespaces used by smoke spawn', () => {
  const cleaned = sanitizeEngineEnv({ AIWORKER_LOCAL_TOKEN: 's', WORKER_DB_PATH: '/x', PATH: '/usr/bin' })
  expect(cleaned.AIWORKER_LOCAL_TOKEN).toBeUndefined()
  expect(cleaned.WORKER_DB_PATH).toBeUndefined()
  expect(cleaned.PATH).toBe('/usr/bin')
})
```
> smoke 自身 spawn 难在单测里端到端断言 env,核心保障是"spawn 用 sanitizeEngineEnv 的结果"——下面的实现改动 + 该单测 + 人工 diff 复核即可。若 `aiworker.test.ts` 已有 mounted smoke 集成用例,补一条断言"子进程拿不到 `AIWORKER_*`"。

- [ ] **Step 2: 跑红**

Run: `cd apps/cli && bun test src/aiworker.test.ts -t "sanitizeEngineEnv strips"`
Expected: FAIL —`Cannot find ... sanitizeEngineEnv`(若 Task 1.1 已合并则改为断言失败前置)。

- [ ] **Step 3: 实现**

在 `apps/cli/src/aiworker.ts` 的 core import 区加入 `sanitizeEngineEnv`(与现有 `from '@zonease/aiworker-core'` 合并)。改 `runMountedServiceSmoke`(1192-1196):
```ts
  const resolvedCwd = path.resolve(rootDir, service.cwd ?? '.')
  const normalizedRoot = path.resolve(rootDir)
  if (resolvedCwd !== normalizedRoot && !resolvedCwd.startsWith(`${normalizedRoot}${path.sep}`))
    throw new Error(`Mounted service cwd must stay inside the app root: ${service.cwd}`)
  const child = spawn(service.command[0]!, service.command.slice(1), {
    cwd: resolvedCwd,
    env: { ...sanitizeEngineEnv(), PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcessByStdio<null, Readable, Readable>
```

- [ ] **Step 4: 跑绿**

Run: `cd apps/cli && bun test src/aiworker.test.ts && bun run --filter '@zonease/aiworker-cli' typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/aiworker.ts apps/cli/src/aiworker.test.ts
git commit -m "fix: app smoke spawn 改用 sanitizeEngineEnv 并校验 cwd 不逃逸 app root"
```

### Task 1.3: API mounted service spawn 改用 sanitizeEngineEnv

**Files:**
- Modify: `apps/api/src/modes/worker.ts`(import 区 + `startMountedSoulAppService` 1028-1032)
- Test: `apps/api/src/modes/worker.local.test.ts`

- [ ] **Step 1: 写失败测试**

在 `worker.local.test.ts` 新增断言:启动 mounted service 时,传给子进程的 env 不含 Host 内部命名空间。若现有测试用真实 spawn 不易断言,改为提取一个纯函数 `mountedServiceSpawnEnv(mountToken: string)` 并单测它:
```ts
import { mountedServiceSpawnEnv } from './worker'
it('mounted service env drops Host-internal namespaces and injects mount token', () => {
  process.env.AIWORKER_LOCAL_TOKEN = 'secret'
  const env = mountedServiceSpawnEnv('tok-123')
  expect(env.AIWORKER_LOCAL_TOKEN).toBeUndefined()
  expect(env.AIWORKER_MOUNT_TOKEN).toBe('tok-123')
  expect(env.PORT).toBe('0')
})
```

- [ ] **Step 2: 跑红**

Run: `cd apps/api && bun test src/modes/worker.local.test.ts -t "mounted service env"`
Expected: FAIL —`mountedServiceSpawnEnv is not a function`

- [ ] **Step 3: 实现**

在 `worker.ts` core import 区加入 `sanitizeEngineEnv`。新增并导出纯函数,再在 spawn 处调用:
```ts
export function mountedServiceSpawnEnv(mountToken: string): NodeJS.ProcessEnv {
  return { ...sanitizeEngineEnv(), AIWORKER_MOUNT_TOKEN: mountToken, PORT: '0' }
}
```
改 1028-1032:
```ts
  const child = spawn(service.command[0]!, service.command.slice(1), {
    cwd,
    env: mountedServiceSpawnEnv(mountToken),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
```

- [ ] **Step 4: 跑绿**

Run: `cd apps/api && bun test src/modes/worker.local.test.ts && bun run --filter '@zonease/aiworker-api' typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modes/worker.ts apps/api/src/modes/worker.local.test.ts
git commit -m "fix: mounted Soul App service spawn 经 sanitizeEngineEnv,不再裸透传 Host env"
```

---

## Phase 2 — Soul App import 边界校验加固(P0-C + P1-G)

`apps/cli/src/soul-app-boundary.ts` 的 `scanPrivateImports` 只扫 4 个固定目录、用 `includes()` 子串匹配、sibling 清单硬编码且漏 custom。对齐 CI gate(`scripts/check-soul-app-boundaries.ts`):递归扫整个 app root + 路径段匹配 + 动态 sibling 发现。

### Task 2.1: 写失败测试覆盖三个绕过点

**Files:**
- Create: `apps/cli/src/soul-app-boundary.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'bun:test'
import { scanPrivateImports } from './soul-app-boundary'

function makeApp(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'soulapp-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  return root
}

describe('scanPrivateImports', () => {
  it('detects Host-private import in a directory outside the legacy 4-dir allowlist', () => {
    const root = makeApp({
      'soul-app.manifest.json': '{}',
      'lib/api.ts': `import { createRuntimeForWorker } from '@zonease/aiworker-core'\n`,
    })
    const issues = scanPrivateImports(root)
    expect(issues.some(issue => issue.importPath === '@zonease/aiworker-core')).toBe(true)
  })

  it('does not false-positive on unrelated packages whose name contains a host root substring', () => {
    const root = makeApp({
      'soul-app.manifest.json': '{}',
      'src/x.ts': `import foo from '@scope/apps/api-client'\n`,
    })
    expect(scanPrivateImports(root)).toEqual([])
  })

  it('flags sibling import to @zonease/aiworker-custom', () => {
    const root = makeApp({
      'soul-app.manifest.json': '{}',
      'src/x.ts': `import { thing } from '@zonease/aiworker-custom'\n`,
    })
    const issues = scanPrivateImports(root)
    expect(issues.some(issue => issue.importPath === '@zonease/aiworker-custom')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑红**

Run: `cd apps/cli && bun test src/soul-app-boundary.test.ts`
Expected: FAIL — 第 1 条(只扫 4 目录,漏 lib/)、第 2 条(`includes('apps/api')` 误伤 api-client)、第 3 条(清单漏 custom)三条都失败。

### Task 2.2: 递归扫整个 app root

**Files:**
- Modify: `apps/cli/src/soul-app-boundary.ts:70-74`

- [ ] **Step 1: 替换 appSourceScanDirs**

把只扫 4 子目录改为扫整个 app root(对齐 CI gate 的 `codeRoot = dir`),并复用现有 `listSourceFiles`(已跳过 `node_modules`/`dist`):
```ts
function appSourceScanDirs(rootDir: string): string[] {
  return [rootDir]
}
```
> `listSourceFiles` 已递归且跳过 `node_modules`/`dist`;扫描根包含 manifest 声明的 `scripts/`、`lib/`、`migrations/` 等任意目录。

- [ ] **Step 2: 跑测试(第 1 条应转绿,2/3 仍红)**

Run: `cd apps/cli && bun test src/soul-app-boundary.test.ts`
Expected: 第 1 条 PASS;第 2、3 条仍 FAIL。

### Task 2.3: 路径段匹配 + 动态 sibling 发现

**Files:**
- Modify: `apps/cli/src/soul-app-boundary.ts`(`isForbiddenSoulAppImport` 141-150、`isSiblingSoulAppImport` 152-164、删除硬编码 `SOUL_APP_PACKAGE_IMPORT_PREFIXES`)

- [ ] **Step 1: 修 host-private root 匹配为路径段**

把 141-150 的 `importPath.includes(part)` 改为段匹配,与 CI gate 的 `normalizedImport(importPath).includes(`${root}/`)` 一致:
```ts
function normalizedImport(importPath: string): string {
  return importPath.replaceAll('\\', '/')
}

function isForbiddenSoulAppImport(rootDir: string, importPath: string): boolean {
  if (HOST_PRIVATE_IMPORT_PREFIXES.some(prefix => importPath === prefix || importPath.startsWith(`${prefix}/`)))
    return true
  if (isSiblingSoulAppImport(rootDir, importPath))
    return true
  const normalized = normalizedImport(importPath)
  return [
    'apps/api',
    'apps/cli',
    'apps/web',
    'packages/core',
    'packages/fs-layout',
    'packages/shared',
    'packages/storage-sqlite',
  ].some(root => normalized.includes(`${root}/`))
}
```

- [ ] **Step 2: 动态 sibling 发现替换硬编码清单**

删除 `SOUL_APP_PACKAGE_IMPORT_PREFIXES`(26-29)。`isSiblingSoulAppImport` 改为:任何 `@zonease/aiworker-*`(scope 内)且不等于本 app 的包名都算 sibling:
```ts
function isSiblingSoulAppImport(rootDir: string, importPath: string): boolean {
  const ownPackageName = `@zonease/${path.basename(rootDir)}`
  const normalized = normalizedImport(importPath)
  const scopeMatch = normalized.match(/^(@zonease\/aiworker-[^/]+)/)
  if (scopeMatch && scopeMatch[1] !== ownPackageName)
    return true
  if (!normalized.includes('apps/aiworker-'))
    return false
  return !normalized.includes(`apps/${path.basename(rootDir)}/`)
}
```
> 注意:`@zonease/aiworker-soul-app-sdk`/`-soul-app-runtime`/`-ui`/`-soul-app-workbench` 等共享包名也以 `@zonease/aiworker-` 开头,但它们不在 `apps/aiworker-*` 形态。上面的 regex 会把它们误判为 sibling。**需排除允许的边界包**:
```ts
const ALLOWED_SHARED_PACKAGES = new Set([
  '@zonease/aiworker-soul-app-sdk',
  '@zonease/aiworker-soul-app-runtime',
  '@zonease/aiworker-soul-app-workbench',
  '@zonease/aiworker-ui',
])
// 在 scopeMatch 命中后追加:
if (scopeMatch && scopeMatch[1] !== ownPackageName && !ALLOWED_SHARED_PACKAGES.has(scopeMatch[1]))
  return true
```
把这段合并进 `isSiblingSoulAppImport`,确保允许包不被误报。

- [ ] **Step 3: 跑绿(三条全过)**

Run: `cd apps/cli && bun test src/soul-app-boundary.test.ts`
Expected: 3 条全 PASS。

- [ ] **Step 4: 回归 — 官方三 app validate 仍通过**

Run:
```bash
bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr
bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa
bun apps/cli/src/aiworker.ts app validate apps/aiworker-custom
```
Expected: 三个均 `status=pass`,`privateImportIssues` 为空(官方 app 只 import 允许的 SDK/runtime/ui)。若误报,回到 Step 2 调 `ALLOWED_SHARED_PACKAGES`。

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/soul-app-boundary.ts apps/cli/src/soul-app-boundary.test.ts
git commit -m "fix: app validate 边界扫描覆盖整个 app root 并改用路径段匹配 + 动态 sibling 发现"
```

---

## Phase 3 — daemon API 鉴权默认 fail-closed + operatorId 不采信 query(P1-E)

### Task 3.1: 匿名态下不采信 query 的 operatorId

**Files:**
- Modify: `apps/api/src/modes/worker.ts:878`
- Test: `apps/api/src/modes/worker.local.test.ts`

- [ ] **Step 1: 写失败测试**

断言:无认证 identity 时,mount context 的 `operatorId` 不来自 `?operatorId=`,而是 null(或固定 anonymous 标识)。沿用现有 spoofed-operator 测试风格,新增匿名分支用例。

- [ ] **Step 2: 跑红**

Run: `cd apps/api && bun test src/modes/worker.local.test.ts -t "operator"`
Expected: FAIL(当前 878 行 `?? c.req.query('operatorId')` 会采信 query)。

- [ ] **Step 3: 实现**

改 878:
```ts
  const operatorId = identity?.operatorId ?? null
```
(删除 `?? c.req.query('operatorId')`。query 提供的 operator 身份永不进入签名 mount context。)

- [ ] **Step 4: 跑绿 + Commit**

Run: `cd apps/api && bun test src/modes/worker.local.test.ts`
```bash
git add apps/api/src/modes/worker.ts apps/api/src/modes/worker.local.test.ts
git commit -m "fix: mount context operatorId 仅取认证身份,不采信 query 参数"
```

### Task 3.2: 决策并落地默认鉴权姿态

> **设计决策(执行前与用户确认一句话):** `AIWORKER_LOCAL_TOKEN` 缺省时当前全匿名放行。两个收敛选项:
> (A) **默认 fail-closed**:无 token 时拒绝 `/api/local/*`(除 `/health`),要求显式配置或自动生成本地 token。
> (B) **保持匿名但显式标注 + 绑定 loopback 守卫**:确认 daemon 永远只绑 127.0.0.1,匿名身份用固定 `operator-local`,并在文档/启动日志显式提示"未配置 token = 本机匿名"。
> 推荐 (A)。下面按 (A) 写;若用户选 (B),本 Task 退化为"在 daemon 启动处断言绑定 loopback + 日志提示",删除 fail-closed 分支。

**Files:**
- Modify: `apps/api/src/modes/worker.ts:178-187`(中间件)
- Test: `apps/api/src/modes/worker.local.test.ts`

- [ ] **Step 1: 写失败测试(方案 A)**

```ts
it('rejects /api/local/* when no local token is configured', async () => {
  // 在无 AIWORKER_LOCAL_TOKEN 的 state 下构造 app
  const res = await app.request('/api/local/info')
  expect(res.status).toBe(401)
})
it('still serves /health without a token', async () => {
  const res = await app.request('/health')
  expect(res.status).toBe(200)
})
```
> 现有测试 "requires bearer auth only when a workspace token is configured" 断言了旧的匿名放行行为——方案 A 下需更新该测试为 fail-closed 语义(同一 Task 内改)。

- [ ] **Step 2: 跑红**

Run: `cd apps/api && bun test src/modes/worker.local.test.ts -t "no local token"`
Expected: FAIL(当前 anonymous 放行返回非 401)。

- [ ] **Step 3: 实现**

中间件把 `anonymous` 也视为拒绝(`/health` 不在 `/api/local/*` 前缀下,不受影响):
```ts
  app.use('/api/local/*', async (c, next) => {
    if (authenticateMountedBrokerRequest(c, state))
      return next()
    const result = state.authProvider.authenticate({ authorization: c.req.header('authorization') })
    if (result.status !== 'authenticated')
      return c.json({ error: { code: 'UNAUTHORIZED', message: result.status === 'denied' ? result.reason : 'Local API requires a configured bearer token.' } }, 401)
    REQUEST_IDENTITIES.set(c, result.identity)
    return next()
  })
```
更新旧的 "requires bearer auth only when..." 测试为 fail-closed 期望。

- [ ] **Step 4: 跑绿 + Commit**

Run: `cd apps/api && bun test src/modes/worker.local.test.ts`
```bash
git add apps/api/src/modes/worker.ts apps/api/src/modes/worker.local.test.ts
git commit -m "fix: 无 token 时 daemon /api/local/* 默认 fail-closed,仅 /health 匿名"
```

---

## Phase 4 — fs-layout 路径定位器 id 净化(P1-F)

`resolveWorkerHome`/`resolveWorkspacesRoot`/`ensureWorkerHome` 对 `workerId` 无净化,`../`/绝对路径可逃出 `AIWORKER_HOME`。当前无生产调用方,属对外公共契约的潜在穿越点。

### Task 4.1: 给 worker id 加净化

**Files:**
- Modify: `packages/fs-layout/src/index.ts:101-116`
- Test: `packages/fs-layout/src/index.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('rejects worker ids that escape the home root', () => {
  expect(() => resolveWorkerHome('../../etc')).toThrow()
  expect(() => resolveWorkerHome('/abs/path')).toThrow()
  expect(() => resolveWorkerHome('a/b')).toThrow()
  expect(() => resolveWorkerHome('')).toThrow()
})
it('accepts a well-formed worker id', () => {
  expect(resolveWorkerHome('hr-worker').endsWith(path.join('workers', 'hr-worker'))).toBe(true)
})
```

- [ ] **Step 2: 跑红**

Run: `cd packages/fs-layout && bun test src/index.test.ts -t "escape the home root"`
Expected: FAIL(当前不抛)。

- [ ] **Step 3: 实现**

在 `index.ts` 加净化函数并在三处入口使用:
```ts
function assertSafeWorkerId(workerId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(workerId) || workerId === '.' || workerId === '..')
    throw new Error(`Invalid worker id: ${JSON.stringify(workerId)}`)
  return workerId
}

export function resolveWorkerHome(workerId: string): string {
  return path.join(resolveAiworkerHome(), 'workers', assertSafeWorkerId(workerId))
}
```
`resolveWorkspacesRoot`/`ensureWorkerHome` 经由 `resolveWorkerHome` 间接受保护(无需重复校验)。

- [ ] **Step 4: 跑绿**

Run: `cd packages/fs-layout && bun test src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/fs-layout/src/index.ts packages/fs-layout/src/index.test.ts
git commit -m "fix: worker 路径定位器校验 id,拒绝 ../ 与绝对路径穿越"
```

---

## Phase 5 — 停止 Host 合成领域 prompt/reviewRubric(P1-D)

`packages/shared/src/soul-app/registry.ts` 的 `projectSoulAppCapabilityTemplate`(111-133)在 Host 侧**捏造**英文 prompt 句子与 reviewRubric 文本。收敛目标:projection 只携带 Soul 声明的 ref(`promptRef`/`reviewRubricRef`)与 manifest 字段,不再由 Host 作为 review/prompt 文本作者。

> **波及链(执行前 grep 复核):** `capabilityTemplateSchema`(shared registry.ts:12-21,字段 `prompt`/`reviewRubric`)→ 重复定义于 `packages/core/src/host/runtime.ts:38-45`、`packages/core/src/soul-app/registry.ts:22-29`、`packages/soul-app-runtime/src/index.ts:34-41`(均含 `reviewRubric: readonly string[]`)→ 消费:`soul-app-runtime` `sessionMetadata`(388 `reviewRubric`)、`apps/web` settings-dialog 展示。`buildInvocationPrompt`(core runtime.ts:421-438)只用 `capabilityTemplateId` + `outputKind`,**不读** prompt/reviewRubric 文本,故引擎行为不变。

### Task 5.1: 改 schema —— 用 ref 取代 Host 捏造文本

**Files:**
- Modify: `packages/shared/src/soul-app/registry.ts:12-21`(schema)、`111-133`(projection)
- Test: `packages/shared/src/soul-app/registry.test.ts`

- [ ] **Step 1: 写/改失败测试**

断言 projection 不再含 Host 捏造句子,而是携带 Soul 的 ref:
```ts
it('projects capability template from manifest refs without Host-authored prompt/rubric text', () => {
  const tpl = projectSoulAppCapabilityTemplate(manifest, capability)
  expect(tpl.promptRef).toBe(capability.promptRef)
  expect(tpl.reviewRubricRef).toBe(capability.reviewRubricRef ?? null)
  // Host 不再捏造英文 prompt/rubric:
  expect((tpl as Record<string, unknown>).prompt).toBeUndefined()
  expect((tpl as Record<string, unknown>).reviewRubric).toBeUndefined()
})
```
> 若 `registry.test.ts` 已有断言旧 `prompt`/`reviewRubric` 文本的用例,一并改写。

- [ ] **Step 2: 跑红**

Run: `cd packages/shared && bun test src/soul-app/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: 改 schema 与 projection**

`capabilityTemplateSchema`(12-21)把 `prompt`/`reviewRubric` 替换为 ref 字段:
```ts
const capabilityTemplateSchema = zod.object({
  description: zod.string().min(1),
  id: zod.string().min(1),
  inputHints: zod.array(zod.string().min(1)).readonly(),
  name: zod.string().min(1),
  outputKind: zod.string().min(1),
  promptRef: zod.string().min(1),
  reviewRubricRef: zod.string().min(1).nullable(),
  soulId: zod.string().min(1),
})
```
`projectSoulAppCapabilityTemplate`(111-133)改为透传:
```ts
export function projectSoulAppCapabilityTemplate(manifest: SoulAppManifest, capability: SoulAppCapability): CapabilityTemplate {
  return {
    description: capability.description,
    id: namespaceSoulAppCapabilityId(manifest.id, capability.id),
    inputHints: [
      `Workspace types: ${capability.workspaceTypes.join(', ')}`,
      `Artifact types: ${capability.artifactTypes?.join(', ') ?? 'none'}`,
    ],
    name: capability.name,
    outputKind: capability.outputKind,
    promptRef: capability.promptRef,
    reviewRubricRef: capability.reviewRubricRef ?? null,
    soulId: manifest.id,
  }
}
```
> `inputHints` 保留结构性引用(workspace/artifact 类型 + prompt ref),不含 Host 捏造的领域 prompt 句子。

- [ ] **Step 4: 跑绿(shared 内)**

Run: `cd packages/shared && bun test src/soul-app/registry.test.ts && bun run --filter '@zonease/aiworker-shared' typecheck`
Expected: PASS

### Task 5.2: 同步下游 CapabilityTemplate 接口与消费点

**Files:**
- Modify: `packages/core/src/host/runtime.ts:38-45`、`packages/core/src/soul-app/registry.ts:22-29`、`packages/soul-app-runtime/src/index.ts:34-41` 与 `378-392`(sessionMetadata)
- 检查:`apps/web` settings-dialog 对 template 的展示字段

- [ ] **Step 1: 跑全量 typecheck 暴露所有断点**

Run: `bun run typecheck`
Expected: FAIL — 上述三个重复 `CapabilityTemplate` 接口的 `reviewRubric`/`prompt` 字段、`sessionMetadata` 的 `reviewRubric` 取用、settings-dialog 的展示字段报错。逐一列出。

- [ ] **Step 2: 同步接口字段**

三处本地 `interface CapabilityTemplate` 把 `prompt: string` / `reviewRubric: readonly string[]` 改为 `promptRef: string` / `reviewRubricRef: string | null`(与 shared 一致)。

- [ ] **Step 3: 同步 sessionMetadata(soul-app-runtime 378-392)**

`reviewRubric: template?.reviewRubric ?? []` 改为携带 ref:
```ts
    reviewRubricRef: template?.reviewRubricRef ?? null,
```
(键名从 `reviewRubric` 改 `reviewRubricRef`;若有消费方依赖 `reviewRubric`,grep 确认并改。)

- [ ] **Step 4: 同步 apps/web 展示**

settings-dialog 若展示 `template.prompt`/`reviewRubric` 文本,改为展示 `promptRef`/`reviewRubricRef`(ref 字符串),或移除该展示(Host 不展示领域 prompt 内容)。

- [ ] **Step 5: 跑绿(全量)**

Run: `bun run check && bun run test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: capability template 仅透传 Soul 的 prompt/review ref,Host 不再合成领域文本"
```

---

## Phase 6 — 领域协议面收敛到 SDK(P1-H)

`packages/shared/src/soul-app/protocol.ts` 在 Host-shared 包里声明了领域 handler 协议(`SoulAppRuntimeProtocol`/`SoulAppSessionContext`/`SoulAppIntentClassification`/`SoulAppConnectorProtocol`/`SoulAppUiContributionProtocol` 及 `invokeAction`)。官方 app 与 scaffold 都从 `@zonease/aiworker-soul-app-sdk` 引这些类型(SDK 再从 shared 转出)。收敛目标:把领域协议接口的**定义**搬进 SDK,让 Host-shared 包不再声明 Host-owned 领域协议面;**官方 app 零改动**(它们已 import 自 SDK)。

> **保留在 shared 的 Host-operational 类型:** `SoulAppScopedContext`、`SoulAppProtocolResult`、`SoulAppLifecycleProtocol`、`SoulAppEventProtocol`(Host 生命周期/事件)。
> **搬进 SDK 的领域类型:** `SoulAppIntentClassification`、`SoulAppSessionContext`、`SoulAppRuntimeProtocol`、`SoulAppConnectorProtocol`、`SoulAppUiContributionProtocol`、`SoulAppProtocolAction`/`SoulAppProtocolActionResult`、以及 `SoulAppProtocolHandlers`(umbrella,引用上述)。
> 执行时 typecheck 会精确指出哪些必须一起搬(因相互引用)。

### Task 6.1: 把领域协议接口从 shared 搬到 SDK

**Files:**
- Modify: `packages/shared/src/soul-app/protocol.ts`(删除领域接口,保留 Host-operational)
- Modify: `packages/shared/src/soul-app/index.ts`(移除领域协议 re-export)、`packages/shared/src/index.ts`(同步)
- Create/Modify: `packages/soul-app-sdk/src/protocol.ts`(领域接口新家)、`packages/soul-app-sdk/src/index.ts`(改为从本地 protocol 定义并导出)

- [ ] **Step 1: 在 SDK 新建领域协议定义**

新建 `packages/soul-app-sdk/src/protocol.ts`,把上面"搬进 SDK"列出的接口定义迁入(连同它们依赖的 `import type` from `@zonease/aiworker-shared` 的 manifest 类型 `SoulAppArtifactType`/`SoulAppCapability`/`SoulAppConnectorNeed`/`SoulAppUi`/`SoulAppWorkspaceType`,以及保留在 shared 的 `SoulAppScopedContext`/`SoulAppProtocolResult`)。

- [ ] **Step 2: SDK index 改为从本地 protocol 导出**

`packages/soul-app-sdk/src/index.ts` 把这些类型的来源从 `@zonease/aiworker-shared` 改为 `./protocol`;`SoulAppDefinition extends SoulAppProtocolHandlers` 与 `defineSoulApp(input: SoulAppProtocolHandlers)` 引用本地定义。

- [ ] **Step 3: 从 shared 删除领域接口与 re-export**

`packages/shared/src/soul-app/protocol.ts` 删除领域接口(只留 `SoulAppScopedContext`、`SoulAppProtocolResult`、`SoulAppLifecycleProtocol`、`SoulAppEventProtocol`)。`packages/shared/src/soul-app/index.ts` 与 `packages/shared/src/index.ts` 移除对已搬走类型的 re-export(133-144 / 184-237 区相关行)。

- [ ] **Step 4: 跑全量 typecheck 修引用**

Run: `bun run typecheck`
Expected: FAIL — 列出所有仍从 shared 引领域协议类型的点(预期:SDK 内部、可能 scaffold 字符串模板)。逐一改为从 SDK 引。**官方 app(hr/qa/custom)预期零改动**(已 import 自 SDK)。

- [ ] **Step 5: 跑绿(全量 + 边界 gate)**

Run: `bun run check && bun run test`
Expected: PASS。`check-soul-app-boundaries`(在 lint 内)仍绿;官方三 app `app validate` 仍 pass。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: 领域协议接口从 Host-shared 收敛到 soul-app-sdk,shared 不再声明领域协议面"
```

---

## Phase 7 — 全量收口验证

- [ ] **Step 1: 全量 gate**

Run: `bun run check && bun run test && bun run build`
Expected: typecheck PASS、lint 0 error、所有 package 测试全绿、build/bundle 成功。

- [ ] **Step 2: 边界与 app 回归**

Run:
```bash
bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr
bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa
bun apps/cli/src/aiworker.ts app validate apps/aiworker-custom
```
Expected: 三个 `status=pass`、无 privateImportIssues。

- [ ] **Step 3: migration drift 复核**

Run: `bun run db:generate:worker`
Expected: `No schema changes, nothing to migrate`(本计划不改 schema)。

- [ ] **Step 4: 更新审查报告状态**

把 `docs/superpowers/specs/2026-05-23-pre-release-audit-design.md` 顶部 `Status: 执行中` 改为 `Status: 已整改(P0+P1)`,并在发现清单各项后标注对应 commit/Phase。

---

## Self-Review 备注(供执行者)

- **Spec 覆盖:** P0-A→Phase 0;P0-B→Phase 1;P0-C+P1-G→Phase 2;P1-E→Phase 3;P1-F→Phase 1.2(cwd)+Phase 4(id);P1-D→Phase 5;P1-H→Phase 6。P2 项不在本计划(审查报告已登记为债务)。
- **两个执行前需用户确认的点:** Phase 3 Task 3.2 的鉴权姿态(fail-closed vs 显式匿名);Phase 5/6 是破坏性 schema/协议面收敛(1.0 前允许,但确认无外部 BYOK 依赖旧 `prompt`/`reviewRubric` 字段)。
- **类型一致性:** `capabilityTemplate` 的新字段名 `promptRef`/`reviewRubricRef` 在 shared/core×2/soul-app-runtime 四处接口必须一致;`mountedServiceSpawnEnv` 在 api worker.ts 定义并被 spawn 处调用。
