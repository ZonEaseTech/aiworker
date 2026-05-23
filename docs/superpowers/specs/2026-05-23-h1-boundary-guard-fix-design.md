# H1 边界守卫整改设计

- 日期：2026-05-23
- 来源：`docs/superpowers/specs/2026-05-23-zero-trust-boundary-audit-design.md`（H1，致命）
- 目标：让 `scripts/check-soul-app-boundaries.ts` 真正扫描 Soul App 代码，并加防空转护栏；顺手清理 H6
- 约束基线：IMPORT-001

## 根因

`discoverSoulApps()` 把扫描根写死为 `apps/X/src`（`check-soul-app-boundaries.ts:86`），并以
`existsSync(srcDir)` 过滤候选（`:89`）。实测三个官方 Soul App 均无 `src/` 目录，真实代码在
`host-adapter/`、`product/`、`runtime/`、`scripts/`。结果：

- 发现列表为空；
- `scanSoulAppImports`（`:105`）、`scanSoulAppWebStorageUsage`（`:169`）在空列表上循环，对真实代码是 no-op；
- IMPORT-001 与 raw-web-storage 控制全程失效。

CI 自动执行点是 `package.json:18` 的 `lint`，而它调用的这个守卫已空转。

**更正（复核）**：初稿曾断言"`aiworker app validate` 不跑边界检查"，系误判（grep 用错关键词）。
`aiworker app validate` 有独立检查器 `scanPrivateImports`（`apps/cli/src/aiworker.ts:2100`），
经 `appSourceScanDirs` 扫描 `['host-adapter', 'product', 'src']`，确实在执行 IMPORT-001——
但其白名单**漏了 `runtime/`**（同类漂移，留作后续小跟进）。故 IMPORT-001 的 Enforced-by 应同时
保留守卫脚本与 `aiworker app validate`，本设计相应调整文档措辞而非删除 validate。

现有 `check-soul-app-boundaries.test.ts` 是共谋：两条用例分别覆盖 completion-audit 与 Host Web
import workbench（后者临时造 `apps/web`，触发 `scanHostWebPackageImports`，**不依赖 Soul App 发现**），
因此守卫扫空时测试仍绿。Soul 侧扫描这条断裂路径无任何覆盖。

## 方案（A：扫整个 app 目录）

零信任取向：不对"代码在哪个子目录"做任何假设，避免白名单将来漂移重演 H1。

### 代码改动 `scripts/check-soul-app-boundaries.ts`

1. `SoulAppWorkspace.srcDir` 语义改为 `codeRoot`，值为 `app.dir`（app 根目录）。
2. `discoverSoulApps()`：去掉 `existsSync(srcDir)` 过滤，仅要求 `soul-app.manifest.json` 存在；
   `codeRoot = app.dir`。
3. 将 `:109,124,127,161,172` 处所有 `app.srcDir` / `candidate.srcDir` 引用改为 `codeRoot`。
   复用 `listSourceFiles` 既有的 `dist` / `node_modules` / `routeTree.gen.ts` 过滤，无需新排除项。
4. `scanSoulAppImports` 与 `scanSoulAppWebStorageUsage` 跳过测试文件（`isTestSourceFile`），
   与 raw-web-storage 扫描现状一致——IMPORT-001 字面限制 production code，且允许 shared fixtures，
   测试 import Host 包做 fixture 合理。
5. `hostPrivatePackages`（`:21`）补 `@zonease/aiworker-fs-layout`。
6. **防空转 tripwire**：若 `apps/*/soul-app.manifest.json` 至少有一个存在、但 `discoverSoulApps()`
   返回空，守卫打印明确错误并 `exit 1`。让"扫了个寂寞"在 lint 阶段即炸。

### 回归测试 `scripts/check-soul-app-boundaries.test.ts`

补 Soul 侧覆盖（当前完全缺失）：

1. **真违规被捕获**：临时根造一个带 `soul-app.manifest.json` 的 app，违规 import 放在
   **非 src 子目录**（如 `host-adapter/bad.ts` import `@zonease/aiworker-core`），断言守卫
   `status !== 0` 且 stderr 含该文件路径。这是会卡住"修复前"实现的核心用例。
2. **官方 app 被发现**：导出 `discoverSoulApps()` 供测试直接断言 `length > 0` 且含 hr/qa/custom。
   前置改造：脚本现为 top-level 立即执行（`:57-73` 模块加载即跑扫描并设 `exitCode`），import 即触发副作用；
   需把执行体包进 `if (import.meta.main) { ... }`（或 `main()`），让 `discoverSoulApps` 等函数可被纯导入测试。
3. **测试文件豁免**：app 测试文件 import Host 包不报错。

### 文档措辞 `docs/architecture.md`

IMPORT-001 行的"Enforced by"改为准确列出两个真实执行点：`scripts/check-soul-app-boundaries.ts`
（经 `lint`）+ 其回归测试，以及 `aiworker app validate`（`scanPrivateImports`）。不在本次接入或
收敛 validate 白名单（runtime 漏扫留作后续）。

## H6 顺手清理

- 删除空目录 `packages/gateway`、`packages/gateway-proto`（`2026-05-13-gateway-fleet-removal` 残留）。
- `docs/architecture.md` Repository Map 补登 `packages/soul-app-workbench`（Soul 共享 UI 库）与
  `apps/aiworker-custom`（官方 Soul App）。

## 验证

- `bun scripts/check-soul-app-boundaries.ts`：本地跑通，确认现在扫到真实 Soul 代码且 repo 当前无新违规。
- `bun test scripts/check-soul-app-boundaries.test.ts`：新增 Soul 侧用例通过；并人工确认"修复前实现"会让
  真违规用例失败（防止再次共谋）。
- `bun run lint`：守卫接入处整体通过。
- `bun run docs:check`：文档措辞与 Repository Map 改动通过合同检查。

## 非目标

- 不收敛 `aiworker app validate` 的 `scanPrivateImports` 白名单（`runtime/` 漏扫留作后续小跟进）。
- 不动 H2/H3/H4——它们各自独立 spec。H1 修好后守卫会自动开始报出 H2 的违规点，由 H2 整改承接。
