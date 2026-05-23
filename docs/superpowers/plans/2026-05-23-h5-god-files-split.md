# H5 God Files 拆分实现计划(aiworker.ts + worker.ts)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把两个真 god file 的低耦合叶子段落抽成独立模块,纯行为保持,显著瘦身。

**Architecture:** 方案 A 保守抽叶子。CLI 抽 `scaffold.ts`、`soul-app-boundary.ts`;API 在 `modes/worker/` 下抽 `web-static.ts`、`openapi.ts`、`settings.ts`。两个源文件保留装配入口与运行时核心。每个抽取 = 纯搬运 + import 接线,**逐个单独提交,提交前必须绿**。

**Tech Stack:** Bun + TypeScript;CLI 用 cac;API 用 OpenAPIHono。回归护栏:`apps/cli/src/aiworker.test.ts`(28 例打 `runCli`)、`apps/api/src/modes/worker.local.test.ts`(打 `app.request()`)。

**移动原则(贯穿全计划):**
- **逐符号 verbatim 搬运,不重写函数体、不改签名、不改逻辑。** 这是纯重构,任何行为变化都是 bug。
- 搬完一个模块后:在源文件加 import、删旧定义、跑 typecheck + 对应 package 测试,绿灯才提交。
- 测试用例数与断言只能增不能减。被搬代码若发现无覆盖,先补针对性测试再搬(见各任务的覆盖说明)。

**关联 spec:** `docs/superpowers/specs/2026-05-23-h5-god-files-split-design.md`

---

## Task 0：建立绿色基线

**Files:** 无改动

- [ ] **Step 1: 跑 CLI 测试基线**

Run: `bun run --filter '@zonease/aiworker-cli' test`
Expected: 全绿,28 例通过。记录用例数作为后续基线。

- [ ] **Step 2: 跑 API 测试基线**

Run: `bun run --filter '@zonease/aiworker-api' test`
Expected: 全绿。记录用例数。

- [ ] **Step 3: 跑 typecheck 基线**

Run: `bun run typecheck`
Expected: 通过,无错误。

若任一不绿,**停止**,先排查环境/已有问题,不要在红色基线上开始重构。

---

## Task 1：CLI 抽出 `scaffold.ts`

**Files:**
- Create: `apps/cli/src/scaffold.ts`
- Modify: `apps/cli/src/aiworker.ts`(删除被搬函数,新增 import)

**搬运清单(全部为返回字符串/写文件的叶子函数,按名 verbatim 搬):**
`createScaffoldManifest`、`createScaffoldPackageJson`、`createScaffoldTsconfig`、`createBriefSchema`、`scaffoldBriefSchemaText`、`scaffoldReadme`、`scaffoldWorkspaceAgents`、`scaffoldWorkspaceReadme`、`scaffoldWorkspaceGitignore`、`scaffoldSkill`、`scaffoldUniversalWorkbenchTs`、`scaffoldProductWebTs`、`scaffoldIndexTs`、`scaffoldApiTs`、`scaffoldStandaloneTs`、`scaffoldHostMountedTs`、`scaffoldPrompt`、`scaffoldReview`、`scaffoldSoulPack`、`writeScaffoldFile`。

**绝对不要搬(与 scaffold 函数交错排列的真实运行时函数,必须留在 aiworker.ts):**
`runStandaloneBrowserSmoke`、`runMountedServiceSmoke`、`waitForMountedServiceUrl`。

**重要提醒:** `scaffoldIndexTs`/`scaffoldStandaloneTs`/`scaffoldHostMountedTs` 的函数体是模板字符串,内部含 `const manifest = ...`、`export const soulApp`、`renderStandaloneHtml`、`serveStandalone`、`serveHostMounted`、`escapeHtml` 等文本。这些是字符串内容,随所在 scaffold 函数整体搬走,不是 aiworker.ts 的真实符号。`grep '^export'` 命中的 1603/1658/1723/1738/1767 都属此类,不要当成独立 export 处理。aiworker.ts 真实的 `escapeHtml` 在文件尾部(约 2238),**留下不动**。

- [ ] **Step 1: 确认搬运清单与调用方**

Run: `rg -n 'createScaffoldManifest|createScaffoldPackageJson|createScaffoldTsconfig|createBriefSchema|scaffold(BriefSchemaText|Readme|Workspace|Skill|UniversalWorkbenchTs|ProductWebTs|IndexTs|ApiTs|StandaloneTs|HostMountedTs|Prompt|Review|SoulPack)|writeScaffoldFile' apps/cli/src/aiworker.ts`
Expected: 看到定义行 + 调用行;唯一调用方应为 `createAppScaffoldCommand`(约 886)。若有其他调用方,记录,确保搬后 import 覆盖到。

- [ ] **Step 2: 创建 `scaffold.ts`,verbatim 粘贴上述函数**

把清单中每个函数的完整定义从 aiworker.ts 剪切到新文件 `apps/cli/src/scaffold.ts`,保持函数体逐字不变。为新文件补上这些函数所需的 import(至少:`node:fs`/`node:path` 供 `writeScaffoldFile`;`SoulAppManifest` 类型与 `createSoulAppManifest`(若 `createScaffoldManifest` 用到)来自 `@zonease/aiworker-soul-app-sdk`)。在每个被 aiworker.ts 调用的函数前加 `export`(清单中全部函数都被 `createAppScaffoldCommand` 调用,故全部 `export`)。

- [ ] **Step 3: 在 aiworker.ts 删除旧定义并加 import**

删除 Step 2 已剪切的全部函数定义;在 aiworker.ts import 区加:

```ts
import {
  createBriefSchema,
  createScaffoldManifest,
  createScaffoldPackageJson,
  createScaffoldTsconfig,
  scaffoldApiTs,
  scaffoldBriefSchemaText,
  scaffoldHostMountedTs,
  scaffoldIndexTs,
  scaffoldPrompt,
  scaffoldProductWebTs,
  scaffoldReadme,
  scaffoldReview,
  scaffoldSkill,
  scaffoldSoulPack,
  scaffoldStandaloneTs,
  scaffoldUniversalWorkbenchTs,
  scaffoldWorkspaceAgents,
  scaffoldWorkspaceGitignore,
  scaffoldWorkspaceReadme,
  writeScaffoldFile,
} from './scaffold'
```

(按 import 实际被引用情况增减;未被 aiworker.ts 直接调用、只在 scaffold.ts 内部互调的函数不必 import,但需在 scaffold.ts 内可见。)

- [ ] **Step 4: typecheck**

Run: `bun run typecheck`
Expected: 通过。常见错误:漏移 import、scaffold 函数互调时某个未在 scaffold.ts 内定义/导出 → 补齐。

- [ ] **Step 5: 跑 CLI 测试,确认行为保持**

Run: `bun run --filter '@zonease/aiworker-cli' test`
Expected: 全绿,用例数 = Task 0 基线(`scaffolds, validates, and smokes a minimal Soul App` 用例覆盖 scaffold 路径)。

- [ ] **Step 6: 提交**

```bash
git add apps/cli/src/scaffold.ts apps/cli/src/aiworker.ts
git commit -m "refactor: 抽出 CLI scaffold 模板到 apps/cli/src/scaffold.ts"
```

---

## Task 2：CLI 抽出 `soul-app-boundary.ts`

**Files:**
- Create: `apps/cli/src/soul-app-boundary.ts`
- Modify: `apps/cli/src/aiworker.ts`

**搬运清单(边界校验叶子函数 + 其专用常量/类型):**
- 函数:`scanPrivateImports`、`scanRawWebStorageUsage`、`appSourceScanDirs`、`rawWebStorageSymbols`、`isTestSourceFile`、`listSourceFiles`、`importSpecifiers`、`isForbiddenSoulAppImport`、`isSiblingSoulAppImport`。
- 常量:`HOST_PRIVATE_IMPORT_PREFIXES`(约 1139)、`SOUL_APP_PACKAGE_IMPORT_PREFIXES`(约 1149)、`RAW_WEB_STORAGE_MESSAGE`(约 1153)。
- 类型:`PrivateImportIssue`(约 1113)、`WebStorageIssue`(约 1119)。

**留在 aiworker.ts:** `AppValidationIssue`、`AppValidationResult` 类型(被 `validateAppAtPath` 等使用),以及 `validateAppAtPath`、`validationReport` 等调用方。`AppValidationResult` 引用 `PrivateImportIssue`/`WebStorageIssue`,故需从新模块 import 这两个类型。

- [ ] **Step 1: 确认依赖闭包与调用方**

Run: `rg -n 'scanPrivateImports|scanRawWebStorageUsage|appSourceScanDirs|rawWebStorageSymbols|isTestSourceFile|listSourceFiles|importSpecifiers|isForbiddenSoulAppImport|isSiblingSoulAppImport|HOST_PRIVATE_IMPORT_PREFIXES|SOUL_APP_PACKAGE_IMPORT_PREFIXES|RAW_WEB_STORAGE_MESSAGE|PrivateImportIssue|WebStorageIssue' apps/cli/src/aiworker.ts`
Expected: 校验函数仅互相调用 + 被 `validateAppAtPath`(约 1938)调用;常量仅被这些函数引用。确认无其他外部调用方。

- [ ] **Step 2: 创建 `soul-app-boundary.ts`,verbatim 粘贴**

剪切上述函数 + 常量 + 两个类型到 `apps/cli/src/soul-app-boundary.ts`。补 import(至少 `node:fs`/`node:path` 供文件扫描)。`export` 出:`PrivateImportIssue`、`WebStorageIssue`、`scanPrivateImports`、`scanRawWebStorageUsage`(后两者被 `validateAppAtPath` 调用,前两者被 `AppValidationResult` 引用)。模块内部互调函数无需 export。

- [ ] **Step 3: 在 aiworker.ts 删除旧定义并加 import**

删除已剪切内容;import 区加:

```ts
import type { PrivateImportIssue, WebStorageIssue } from './soul-app-boundary'
import { scanPrivateImports, scanRawWebStorageUsage } from './soul-app-boundary'
```

确认 `AppValidationResult` 类型定义里对 `PrivateImportIssue[]`/`WebStorageIssue[]` 的引用现在解析到 import。

- [ ] **Step 4: typecheck**

Run: `bun run typecheck`
Expected: 通过。

- [ ] **Step 5: 跑 CLI 测试**

Run: `bun run --filter '@zonease/aiworker-cli' test`
Expected: 全绿,用例数 = 基线(`fails Soul App validation on Host private imports / sibling app imports / raw browser storage` 三例覆盖边界校验)。

- [ ] **Step 6: 提交**

```bash
git add apps/cli/src/soul-app-boundary.ts apps/cli/src/aiworker.ts
git commit -m "refactor: 抽出 CLI Soul App 边界校验器到独立模块"
```

---

## Task 3：API 抽出 `worker/web-static.ts`

**Files:**
- Create: `apps/api/src/modes/worker/web-static.ts`
- Modify: `apps/api/src/modes/worker.ts`

**搬运清单(Worker Web 静态托管叶子函数):**
`serveWorkerWeb`(约 1505)、`serveWorkerWebAsset`(约 1517)、`resolveWorkerWebStaticDir`(约 1533)、`safeStaticPath`(约 1541)、`contentTypeFor`(约 1549)。

**调用方(留在 worker.ts 的内联路由,约 537-544):** `GET /`、`/workers/:path`、`/workspaces/:path`、`/favicon.png`、`/logo.png`、`/assets/:path`、`/fonts/:path`、`/engine-icons/:path`。这些路由注册保留,改为调用 import 进来的 `serveWorkerWeb` / `serveWorkerWebAsset`。

- [ ] **Step 1: 确认调用方与依赖**

Run: `rg -n 'serveWorkerWeb|serveWorkerWebAsset|resolveWorkerWebStaticDir|safeStaticPath|contentTypeFor' apps/api/src/modes/worker.ts`
Expected: 看到 5 个定义 + 静态路由调用。确认 `resolveWorkerWebStaticDir`/`safeStaticPath`/`contentTypeFor` 仅被 `serveWorkerWeb`/`serveWorkerWebAsset` 内部使用。

- [ ] **Step 2: 创建 `worker/web-static.ts`,verbatim 粘贴**

剪切 5 个函数到新文件。补 import:`node:fs`/`node:path`、`Context`(`hono`)。`export` 出 `serveWorkerWeb`、`serveWorkerWebAsset`(被路由调用),内部 helper 不导出。

- [ ] **Step 3: 在 worker.ts 删除旧定义并加 import**

删除已剪切函数;import 区加:

```ts
import { serveWorkerWeb, serveWorkerWebAsset } from './worker/web-static'
```

静态路由调用点保持不变(签名一致)。

- [ ] **Step 4: typecheck**

Run: `bun run typecheck`
Expected: 通过。

- [ ] **Step 5: 跑 API 测试**

Run: `bun run --filter '@zonease/aiworker-api' test`
Expected: 全绿(静态资源/favicon/engine-icons 用例覆盖此路径)。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/modes/worker/web-static.ts apps/api/src/modes/worker.ts
git commit -m "refactor: 抽出 daemon Worker Web 静态托管到 worker/web-static.ts"
```

---

## Task 4：API 抽出 `worker/openapi.ts`

**Files:**
- Create: `apps/api/src/modes/worker/openapi.ts`
- Modify: `apps/api/src/modes/worker.ts`

**搬运清单:** `registerLocalOpenApiPaths`(约 1570 至文件中该函数结尾)。声明式 OpenAPI 路径元数据,无 handler 逻辑。

**调用方:** `bootstrapWorkerApp` 内约 527 行 `registerLocalOpenApiPaths(app)`。

- [ ] **Step 1: 确认函数边界与签名**

Run: `rg -n 'registerLocalOpenApiPaths' apps/api/src/modes/worker.ts`
Expected: 一个定义(约 1570)+ 一个调用(约 527)。确认签名 `(app: OpenAPIHono): void`。

- [ ] **Step 2: 创建 `worker/openapi.ts`,verbatim 粘贴**

剪切整个 `registerLocalOpenApiPaths` 到新文件。补 import:`OpenAPIHono`(`@hono/zod-openapi`)。`export` 该函数。

- [ ] **Step 3: 在 worker.ts 删除旧定义并加 import**

删除旧函数;import 区加:

```ts
import { registerLocalOpenApiPaths } from './worker/openapi'
```

527 行调用点不变。

- [ ] **Step 4: typecheck**

Run: `bun run typecheck`
Expected: 通过。

- [ ] **Step 5: 跑 API 测试**

Run: `bun run --filter '@zonease/aiworker-api' test`
Expected: 全绿(若有 `/openapi.json` 断言则覆盖此处;否则至少装配不报错)。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/modes/worker/openapi.ts apps/api/src/modes/worker.ts
git commit -m "refactor: 抽出 daemon OpenAPI 路径元数据到 worker/openapi.ts"
```

---

## Task 5：API 抽出 `worker/settings.ts`

**Files:**
- Create: `apps/api/src/modes/worker/settings.ts`
- Modify: `apps/api/src/modes/worker.ts`

**搬运清单(settings 数据层 helper):**
`loadLocalSettings`(约 1406)、`saveLocalSettings`(约 1414)、`normalizePendingMcpSettings`(约 1420)、`defaultLocalSettings`(约 1434)、`scanLocalEngines`(约 1469)。外加常量 `LOCAL_SETTINGS_KEY`(约 56)。

**条件搬运(先查使用域):** `commandOutput`(约 1494)、`isRecord`(约 1501)。仅当它们只被 settings 函数使用时才一并搬;若被其他域(如 engine invocation)使用,留在 worker.ts。

**不搬(属 engine 域,留在 worker.ts):** `selectedEngine`、`selectedEngineCommand`、`executionMetadata`。

**保留内联:** settings 路由注册(约 482-516:`GET|PATCH /api/local/settings`、`POST .../engines/rescan|test`)留在 `bootstrapWorkerApp` 内,改为调用 import 进来的 helper。`loadLocalSettings` 还被 159/1152/1283/1303 等多处调用,搬后由 worker.ts 反向 import(单向依赖,settings.ts 不得 import worker.ts,避免循环)。

- [ ] **Step 1: 查使用域,确定条件搬运项**

Run: `rg -n 'loadLocalSettings|saveLocalSettings|normalizePendingMcpSettings|defaultLocalSettings|scanLocalEngines|commandOutput|isRecord|LOCAL_SETTINGS_KEY' apps/api/src/modes/worker.ts`
Expected: 列出全部使用点。判定 `commandOutput`/`isRecord` 是否 settings 专用。确认 `loadLocalSettings` 的全部调用点(159/482/488/498/508/1152/1283/1303 一类),搬后都要能 import 到。

- [ ] **Step 2: 创建 `worker/settings.ts`,verbatim 粘贴**

剪切核心 5 个函数 + `LOCAL_SETTINGS_KEY`(+ 条件项)到新文件。补 import:`LocalSettingsConfig` 类型与设置存储/扫描所依赖的 core/storage 模块、`node:child_process`(若 `scanLocalEngines`/`commandOutput` 用到)等——按原函数体实际依赖搬。`export` 出 `loadLocalSettings`、`saveLocalSettings`、`scanLocalEngines`(被 worker.ts 路由/bootstrap 调用)。**确认 settings.ts 没有 import `worker.ts`**。

- [ ] **Step 3: 在 worker.ts 删除旧定义并加 import**

删除已剪切函数/常量;import 区加:

```ts
import { loadLocalSettings, saveLocalSettings, scanLocalEngines } from './worker/settings'
```

(按实际调用增减;若 `defaultLocalSettings`/`normalizePendingMcpSettings` 仅 settings.ts 内部用则不必 import。)settings 路由与其它调用点改用 import 的 helper,签名不变。

- [ ] **Step 4: typecheck(重点查循环依赖)**

Run: `bun run typecheck`
Expected: 通过。若报循环依赖,检查 settings.ts 是否误引 worker.ts 的符号(如 `LocalDaemonState`)——这类应留在 worker.ts,不要拖进 settings.ts。

- [ ] **Step 5: 跑 API 测试**

Run: `bun run --filter '@zonease/aiworker-api' test`
Expected: 全绿(engine rescan/test 用例覆盖 settings 路径)。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/modes/worker/settings.ts apps/api/src/modes/worker.ts
git commit -m "refactor: 抽出 daemon settings 数据层到 worker/settings.ts"
```

---

## Task 6：收口验证

**Files:** 无改动

- [ ] **Step 1: 全量 gate**

Run: `bun run check`
Expected: 通过(typecheck + lint + test)。

- [ ] **Step 2: 复核行数收益**

Run: `wc -l apps/cli/src/aiworker.ts apps/api/src/modes/worker.ts`
Expected: aiworker.ts 约 1700(原 2481),worker.ts 约 1400(原 1653)。若差距大,确认无遗漏搬运。

- [ ] **Step 3: 复核行为保持不变量**

Run: `rg -n '^export ' apps/cli/src/aiworker.ts && rg -n '^export ' apps/api/src/modes/worker.ts`
Expected: aiworker.ts 真实顶层 export 仍为 `resolveCli*`(4)、`downloadAndReplaceGitHubBundle`、`convergeHostAfterCliUpgrade`、`preprocessArgv`、`runCli`(+ `LocalPaths` interface);worker.ts 仍 export `createWorkerApp`、`bootstrapWorkerApp`(+ 类型)。签名未变。

- [ ] **Step 4: code-review-graph 变更审查**

按 AGENTS.md,代码改动后介入 code-review-graph 做变更审查:`bun run crg:update` 后 `bun run crg:review`(或对应 MCP 工具),确认无新增循环依赖、无漏移、无行为偏移。

- [ ] **Step 5: 更新 backlog 状态**

在 `docs/superpowers/specs/2026-05-23-h5-god-files-analysis.md` 标注:aiworker.ts + worker.ts 已按方案 A 完成叶子抽取;剩余(运行时核心拆分、UI 大组件、脚本去重)仍待排期。提交此文档更新。

---

## 后续(本计划之外,登记备查)

- worker.ts 运行时核心(session↔runtime、mounted-app 全局态、engine streaming)按域全量分解 —— 需重设依赖注入,独立一轮。
- `apps/cli/src/soul-app-boundary.ts` 与 `scripts/check-soul-app-boundaries.ts` 两套平行实现去重 —— 行为敏感,独立 task。
- UI 大组件拆分(settings-dialog、session-composer、sidebar、worker-configuration-dialog)。
