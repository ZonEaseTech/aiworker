# H5 God Files 拆分设计(aiworker.ts + worker.ts)

- 日期：2026-05-23
- 来源：`docs/superpowers/specs/2026-05-23-h5-god-files-analysis.md`(H5 backlog 分析)
- 范围：本轮只规划并实现两个真 god file —— `apps/cli/src/aiworker.ts` 与
  `apps/api/src/modes/worker.ts`。UI 大组件、`manifest.ts` 不在本轮。
- 粒度：**方案 A（保守抽叶子）**。只抽自包含、低耦合的叶子段落，缠在一起的运行时核心留作后续独立一轮。
- 性质：**纯重构，严格行为保持**。不改任何 CLI/HTTP 行为、不加功能、不顺手改逻辑。
- 约束基线：无安全/边界约束变更；目标是可维护性，行为保持。

## 前置勘误（覆盖 backlog 分析的过时判断）

backlog 分析写「`aiworker.ts` 当前几乎无单测」，**此判断已过时，作废**。实际状态：

- `apps/cli/src/aiworker.test.ts`：836 行、28 个用例，通过公开入口 `runCli(argv)` 端到端测各命令流
  （daemon、app install/enable/list/disable、workspace/session、update/upgrade、Soul App
  scaffold/validate/smoke 等）。
- `apps/api/src/modes/worker.local.test.ts`：1524 行，通过 `bootstrapWorkerApp()` + `app.request()`
  打真实 HTTP（workers、sessions、apps、settings、static assets、mounted service proxy、bearer auth 等）。

两套都「测公开入口、不绑内部实现」，这正是行为保持重构最理想的护栏。因此「先补测试」前置不是从零补，而是
**跑绿现有套件 + 只为即将搬动却未覆盖的段落补针对性测试**。

## 关键结构勘误（覆盖盘点中的误标）

`aiworker.ts` 内 `grep '^export'` 命中的 `export const soulApp` / `export default soulApp` /
`renderStandaloneHtml` / `serveStandalone` / `serveHostMounted`（约行 1603/1658/1723/1738/1767）
**不是 aiworker.ts 的真实运行时代码**，而是落在 `scaffoldIndexTs`/`scaffoldStandaloneTs`/
`scaffoldHostMountedTs` 模板字符串内部的文本——会被写进被生成 Soul App 的源码。

`aiworker.ts` 的真实顶层 export 只有 7 个：`LocalPaths`（interface）、`resolveCliOfficialAppsRoot`、
`resolveCliWorkerWebStaticDir`、`resolveCliDefaultHomeDir`、`resolveCliLocalPaths`、
`downloadAndReplaceGitHubBundle`、`convergeHostAfterCliUpgrade`、`preprocessArgv`、`runCli`。
拆分不得改变这些 export 的签名与行为。

## CLI 抽取目标：`aiworker.ts`（2481 → 约 1700 行）

新建两个 flat sibling 模块，沿用 `apps/cli/src` 现有扁平风格（不引入 `commands/` 子目录——那属于
全量分解方案，非本轮）：

### 1. `apps/cli/src/scaffold.ts`（约 600 行）

- 迁移：`createScaffoldManifest`、`createScaffoldPackageJson`、`createScaffoldTsconfig`、
  所有 `scaffold*Ts`（`scaffoldUniversalWorkbenchTs`/`scaffoldProductWebTs`/`scaffoldIndexTs`/
  `scaffoldApiTs`/`scaffoldStandaloneTs`/`scaffoldHostMountedTs`）、`scaffoldBriefSchemaText`、
  `scaffoldReadme`、`scaffoldWorkspaceAgents`、`scaffoldWorkspaceReadme`、`scaffoldWorkspaceGitignore`、
  `scaffoldSkill`、`scaffoldPrompt`、`scaffoldReview`、`scaffoldSoulPack`、`writeScaffoldFile`。
- 性质：纯字符串构造 + 文件写入，叶子函数。唯一调用方是 `createAppScaffoldCommand`。
- 风险：最低。最大行数收益。

### 2. `apps/cli/src/soul-app-boundary.ts`（约 140 行）

- 迁移：`scanPrivateImports`、`appSourceScanDirs`、`isForbiddenSoulAppImport`、
  `isSiblingSoulAppImport`、`scanRawWebStorageUsage`、`listSourceFiles`、`importSpecifiers`、
  `isTestSourceFile`、`rawWebStorageSymbols`，以及常量 `HOST_PRIVATE_IMPORT_PREFIXES`、
  `SOUL_APP_PACKAGE_IMPORT_PREFIXES`、`RAW_WEB_STORAGE_MESSAGE` 与相关 issue 类型。
- 性质：叶子校验器。唯一调用方是 `validateAppAtPath`（H1 孪生缺口所在）。
- 风险：低。独立成模块后更易在未来与 `scripts/check-soul-app-boundaries.ts` 对齐。

### `aiworker.ts` 保留

CLI 命令注册（`cli.command(...)`）、daemon/app/worker/workspace/session 各 action 函数、
共享 helper（`createHost`/`ensureDb`/`localPaths`/`printJson`/`registryContext` 等）、`runCli` 入口、
上述 7 个真实顶层 export。

## API 抽取目标：`worker.ts`（1653 → 约 1300 行）

新建 `apps/api/src/modes/worker/` 子目录，`worker.ts` 留作装配入口；抽出三段低耦合内容：

### 1. `apps/api/src/modes/worker/web-static.ts`

- 迁移：`serveWorkerWeb` 及 Worker Web 静态托管（index.html、SPA 路由捕获、`/assets`、`/fonts`、
  `/engine-icons`、`favicon.png`/`logo.png`）。
- 性质：无业务耦合，纯静态资源响应。

### 2. `apps/api/src/modes/worker/openapi.ts`

- 迁移：`registerLocalOpenApiPaths` 声明式 OpenAPI 元数据。
- 性质：声明式，独立于 handler 逻辑（仅需与路由保持同步）。

### 3. `apps/api/src/modes/worker/settings.ts`

- 迁移：`loadLocalSettings`、`saveLocalSettings`、settings 路由（`GET|PATCH /api/local/settings`）、
  engine rescan/test（`POST /api/local/settings/engines/rescan|test`）。
- 性质：本资源域耦合最浅。注意 `loadLocalSettings` 被 engine invocation 与 session 创建复用，
  迁移后需保证可被 worker.ts 继续 import（避免循环依赖：settings 模块不得反向依赖 worker.ts 装配）。

### `worker.ts` 保留

OpenAPIHono app 装配、中间件与 bearer/mounted auth、apps/workers/workspaces/sessions/turns/
engine invocation 路由与运行时核心、`createWorkerApp`/`bootstrapWorkerApp` export。

## 明确不动（本轮非目标）

- 不碰 worker/session/runtime 核心、`state.mountedAppServices` 全局状态、engine invocation
  streaming——耦合重，留独立一轮（属全量分解方案，需重设依赖注入）。
- **不统一** `apps/cli/src/soul-app-boundary.ts` 与 `scripts/check-soul-app-boundaries.ts` 两套
  平行实现。那是行为敏感的去重，属另一个 task；本轮只把 CLI 内校验器抽成独立模块，去重登记为后续机会。
- 不拆内聚的 `packages/shared/src/soul-app/manifest.ts`。
- 不拆 UI 大组件（settings-dialog、session-composer、sidebar、worker-configuration-dialog）——下一轮。
- 不借拆分顺手改行为、加功能、改公共 export 签名。

## 执行顺序与每步验证

每个抽取 = 一次纯搬运 + import 接线，**单独提交，提交前必须绿**：

1. **建基线**：跑 `bun run --filter '@zonease/aiworker-cli' test` 与
   `bun run --filter '@zonease/aiworker-api' test`，确认起点全绿。
2. **小步搬运（顺序）**：
   - CLI-1：`scaffold.ts`
   - CLI-2：`soul-app-boundary.ts`
   - API-1：`worker/web-static.ts`
   - API-2：`worker/openapi.ts`
   - API-3：`worker/settings.ts`
   每步只搬一个域，搬完跑对应 package 测试 + `bun run typecheck`，绿灯后提交。
3. **收口**：跑 `bun run check`。
4. **测试缺口规则**：搬动中若发现某段被移动代码无测试覆盖，先补针对性测试再搬。

## 风险 / 收益

- 收益：中。`aiworker.ts` 预期掉约 780 行、`worker.ts` 约 350 行，两个真 god file 显著瘦身，
  可维护性、可测性、未来改动可靠性提升。
- 风险：低。本轮只抽叶子段落，避开运行时核心耦合；纯搬运 + 现有公开入口测试护栏，循环依赖风险被压到最低。
  主要残余风险：漏移共享 helper、settings 模块反向依赖导致循环 import——靠 typecheck + 测试拦截。

## 验证清单（行为保持）

- [ ] CLI 测试套件搬运前后全绿，用例数与断言不减。
- [ ] API 测试套件搬运前后全绿。
- [ ] `bun run typecheck` 通过（无循环依赖、无漏移）。
- [ ] `bun run check` 通过。
- [ ] `aiworker.ts` 7 个真实顶层 export 签名与行为不变。
- [ ] `createWorkerApp`/`bootstrapWorkerApp` 签名与行为不变。
