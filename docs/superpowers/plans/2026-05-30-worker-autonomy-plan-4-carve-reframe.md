# Worker 自治倒置 · Plan 4：worker-runtime 遗留 `Host*` 命名 reframe + G2/G4 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（推荐）或 executing-plans 逐 task 执行。步骤用 `- [ ]`。**执行隔离**：在隔离 git worktree（从 `codex/aiworker-refactor-dev-loop` tip fork，建议名 `worker-autonomy-plan4`）内执行，跑 `bun run typecheck && bun run test:contracts && bun run lint && bun run test` 验证后再合回。

**Goal:** 把 worker 自治包 `worker-runtime` 里残留的旧「Host-launches-engine」模型命名 reframe 为 worker 词汇（`HostRuntime`→`WorkerOrchestrator` 等），并把 inversion-guards 的 G2/G4 从 `test.todo` 提升为非空真断言。

**Architecture:** 5-plan 系列第 4 阶段。Plan 2 rename + Plan 3 全新建 host-control 已完成 master spec §6 的 carve 实质；C1/G3 禁止把剩余 worker 逻辑搬进 host-control（见 design doc §1 对账）。本 plan **不搬码、不改运行时行为**——是纯命名 reframe（行为由既有测试集回归把关）+ 两条结构守卫提升。

**Tech Stack:** Bun workspaces、TypeScript、`bun:test`、eslint（antfu/perfectionist）。

**门命令：** `bun run typecheck`、`bun run test:contracts`、`bun run lint`、`bun run test`、`bun run docs:check`。

**依据：** design doc `docs/superpowers/specs/2026-05-30-worker-autonomy-plan-4-carve-reframe-design.md`（§3 命名映射、§4 G2/G4、§5 边界）。

---

## 已定设计决策（执行者遵守）

1. **不搬码到 host-control**（C1+G3 禁止）；**不动 protocol 层** `HostedSoulApp`/`buildHostedSoulApp` 及其本地包装 `getHostedSoulApp`/`listHostedSoulApps`/`getHostedSoulAppSafely`。
2. **纯命名 reframe + 文件/目录迁移 + G2/G4 提升**。无运行时行为改动；正确性靠「改名前后既有测试全绿 + typecheck」。
3. **不在本 plan 改**：`createHost`（worker-cli 本地 wrapper）、`convergeHostAfterCliUpgrade`（CLI 本地导出）等**非 worker-runtime 导出**的 CLI 本地 `Host` 名；`VerticalSoul` 等非 `Host` 遗留名；G1/G3/G5/G6。
4. **改名机制**：逐符号按词边界替换 → `bun run typecheck` 作安全网（旧符号删除后任何漏改引用必报错）→ `bunx eslint --fix` 修 import/key 字母序（H→W 改序会触发 perfectionist 排序）→ 跑受影响包测试。
5. **消费面（已勘定，HEAD accd564e）**：
   - orchestrator 簇 → `apps/worker-cli/src/aiworker.ts`、`packages/worker-daemon/src/modes/worker.ts`、index.ts。
   - api-identity 簇 → `packages/worker-daemon/src/modes/worker.ts`、index.ts。
   - soul-catalog 簇 → `packages/soul-app-runtime/src/index.ts`、`worker-runtime/src/orchestration/orchestrator.ts`、`soul-app/registry.ts`、`soul-app/registry.test.ts`、index.ts。
   - **pinned doc/test 依赖**：`docs/testing.md`(Required Test Areas worker-runtime 块)、`scripts/check-doc-contract.ts`(line ~432 精确钉同块)、`tests/architecture/refactor-contract.test.ts`(activeSources 含 `host/runtime.ts`；forbidden 含 `listHostSoulCatalog().templates`)。

## 边界

- ✅ 迁 `worker-runtime/src/host/`→`src/orchestration/`(runtime→orchestrator)、reframe §3 命名、同步全部消费方与 pinned doc/test、提升 G2/G4、更新 memory。
- ❌ 不搬码到 host-control、不建 host-control deferred 面、不改协议层 `Hosted*`、不改 CLI 本地 `createHost`/`convergeHost*`、不改 G1。

---

## Task 1：迁移 `src/host/` → `src/orchestration/`（含 runtime→orchestrator 文件改名，无符号改名）

**Files:**
- Move: `packages/worker-runtime/src/host/runtime.ts` → `src/orchestration/orchestrator.ts`
- Move: `packages/worker-runtime/src/host/runtime.test.ts` → `src/orchestration/orchestrator.test.ts`
- Move: `packages/worker-runtime/src/host/identity-provider.ts` → `src/orchestration/identity-provider.ts`
- Move: `packages/worker-runtime/src/host/identity-provider.test.ts` → `src/orchestration/identity-provider.test.ts`
- Modify: `packages/worker-runtime/src/index.ts`、`docs/testing.md`、`scripts/check-doc-contract.ts`、`tests/architecture/refactor-contract.test.ts`

- [ ] **Step 1: git mv 四个文件**
```bash
cd packages/worker-runtime/src
git mv host/runtime.ts orchestration/orchestrator.ts
git mv host/runtime.test.ts orchestration/orchestrator.test.ts
git mv host/identity-provider.ts orchestration/identity-provider.ts
git mv host/identity-provider.test.ts orchestration/identity-provider.test.ts
cd -
# host/ 应已空；确认
ls packages/worker-runtime/src/host 2>/dev/null || echo "host/ removed ok"
```
> `git mv` 自动建 `orchestration/`。注意：`orchestrator.ts` 内的相对 import（`../soul-app/...`、`../worker/...`）从 `host/` 与 `orchestration/` 同深度，**无需改**。

- [ ] **Step 2: 改 orchestrator.test.ts 的自引用 import**
在 `packages/worker-runtime/src/orchestration/orchestrator.test.ts`：把 `from './runtime'` 改为 `from './orchestrator'`（`identity-provider.test.ts` 的 `from './identity-provider'` 不变）。

- [ ] **Step 3: 改 index.ts 的两处 re-export 路径**
在 `packages/worker-runtime/src/index.ts`：
- `} from './host/runtime'` → `} from './orchestration/orchestrator'`
- `} from './host/identity-provider'` → `} from './orchestration/identity-provider'`

- [ ] **Step 4: 改 refactor-contract.test.ts 的 activeSources 路径**
在 `tests/architecture/refactor-contract.test.ts`（约 line 1005，test `'Host Soul catalog exposes capabilities instead of a template collection'` 的 `activeSources`）：把 `'packages/worker-runtime/src/host/runtime.ts'` 改为 `'packages/worker-runtime/src/orchestration/orchestrator.ts'`。
> 该测试用 `readRepoFile()` 读这些文件，路径失配会抛错。

- [ ] **Step 5: 改 docs/testing.md 的 worker-runtime 测试块（重排字母序）**
在 `docs/testing.md`「Worker runtime tests」代码块，把
```text
packages/worker-runtime/src/
  config/worker.test.ts
  host/identity-provider.test.ts
  host/runtime.test.ts
  index.test.ts
  soul-app/registry.test.ts
  worker/engine-env.test.ts
  worker/executor.test.ts
  worker/local-engine-resolver.test.ts
  worker/runtime.test.ts
```
改为（`orchestration/` 排在 `index` 后、`soul-app` 前）：
```text
packages/worker-runtime/src/
  config/worker.test.ts
  index.test.ts
  orchestration/identity-provider.test.ts
  orchestration/orchestrator.test.ts
  soul-app/registry.test.ts
  worker/engine-env.test.ts
  worker/executor.test.ts
  worker/local-engine-resolver.test.ts
  worker/runtime.test.ts
```

- [ ] **Step 6: 同步 check-doc-contract.ts 钉的同块字符串**
在 `scripts/check-doc-contract.ts`（约 line 432），把精确字符串
```
'packages/worker-runtime/src/\n  config/worker.test.ts\n  host/identity-provider.test.ts\n  host/runtime.test.ts\n  index.test.ts\n  soul-app/registry.test.ts\n  worker/engine-env.test.ts\n  worker/executor.test.ts\n  worker/local-engine-resolver.test.ts\n  worker/runtime.test.ts',
```
改为
```
'packages/worker-runtime/src/\n  config/worker.test.ts\n  index.test.ts\n  orchestration/identity-provider.test.ts\n  orchestration/orchestrator.test.ts\n  soul-app/registry.test.ts\n  worker/engine-env.test.ts\n  worker/executor.test.ts\n  worker/local-engine-resolver.test.ts\n  worker/runtime.test.ts',
```
（与 Step 5 文本逐行一致）

- [ ] **Step 7: 验证（typecheck + 迁移包测试 + docs:check）**
Run:
```bash
bun run --filter '@zonease/aiworker-worker-runtime' typecheck
bun test packages/worker-runtime/src/orchestration
bun run docs:check
```
Expected: typecheck exit 0；orchestration 两个 test 文件全 pass；`docs contract ok`。
> 此时类仍叫 `HostRuntime`（符号未改），仅文件/目录迁移，编译与测试应不受影响。

- [ ] **Step 8: commit**
```bash
git add packages/worker-runtime/src docs/testing.md scripts/check-doc-contract.ts tests/architecture/refactor-contract.test.ts
git commit -m "refactor(worker-runtime): 迁 src/host→src/orchestration（runtime→orchestrator），同步 pinned doc/test 路径"
```

---

## Task 2：reframe orchestrator 簇符号

**符号映射：**
- `HostRuntime` → `WorkerOrchestrator`
- `createHostRuntime` → `createWorkerOrchestrator`
- `HostRuntimeOptions` → `WorkerOrchestratorOptions`
- `CreateHostSoulWorkerInput` → `CreateSoulWorkerInput`
- `CreateHostSoulWorkerResult` → `CreateSoulWorkerResult`
- `HostOfficialSoulAppBootstrap` → `OfficialSoulAppBootstrap`

**Files:**
- Modify: `packages/worker-runtime/src/orchestration/orchestrator.ts`、`packages/worker-runtime/src/index.ts`、`apps/worker-cli/src/aiworker.ts`、`packages/worker-daemon/src/modes/worker.ts`

- [ ] **Step 1: 在上述 4 文件按词边界替换 6 个符号**
逐符号全替换（保持 `HostedSoulApp`/`getHostedSoulApp`/`listHostedSoulApps` 不动——它们不在本簇）。注意 worker-cli 的 `createHost(...)` 本地函数名**不改**（它内部调用 `createWorkerOrchestrator`）；`convergeHostAfterCliUpgrade` 名不改，但其签名里 `ReturnType<HostRuntime['bootstrapOfficialSoulApps']>` 的 `HostRuntime`→`WorkerOrchestrator`。worker-daemon `worker.ts` 里 `host: HostRuntime` 字段类型与 `const host = createHostRuntime(` 调用改名（字段名 `host` 可保留）。

- [ ] **Step 2: 确认无残留旧符号**
Run: `grep -rnE "\b(HostRuntime|createHostRuntime|HostRuntimeOptions|CreateHostSoulWorkerInput|CreateHostSoulWorkerResult|HostOfficialSoulAppBootstrap)\b" packages apps --include=*.ts | grep -v node_modules`
Expected: 空输出。

- [ ] **Step 3: eslint --fix 修 import/key 字母序**
Run: `bunx eslint --fix packages/worker-runtime/src/index.ts packages/worker-daemon/src/modes/worker.ts apps/worker-cli/src/aiworker.ts packages/worker-runtime/src/orchestration/orchestrator.ts`

- [ ] **Step 4: 验证**
Run:
```bash
bun run --filter '@zonease/aiworker-worker-runtime' typecheck
bun run --filter '@zonease/aiworker-worker-daemon' typecheck
bun run --filter '@zonease/aiworker-cli' typecheck
bun test packages/worker-runtime/src/orchestration
bunx eslint packages/worker-runtime packages/worker-daemon apps/worker-cli
```
Expected: 全 typecheck exit 0；orchestration 测试 pass；eslint 0。

- [ ] **Step 5: commit**
```bash
git add packages/worker-runtime apps/worker-cli packages/worker-daemon
git commit -m "refactor(worker-runtime): HostRuntime→WorkerOrchestrator 等 orchestrator 簇 reframe"
```

---

## Task 3：reframe api-identity 簇符号

**符号映射：**
- `HostIdentity` → `WorkerApiIdentity`
- `HostIdentityGrant` → `WorkerApiIdentityGrant`
- `HostAuthResult` → `WorkerApiAuthResult`
- `HostAuthProviderKind` → `WorkerApiAuthProviderKind`
- `HostAuthProvider` → `WorkerApiAuthProvider`
- `HostAuthMethod` → `WorkerApiAuthMethod`
- `HostAuthInput` → `WorkerApiAuthInput`

（`createLocalBearerAuthProvider`/`LocalBearerAuthProviderOptions` 不改——已是 worker 词汇。）

**Files:**
- Modify: `packages/worker-runtime/src/orchestration/identity-provider.ts`、`packages/worker-runtime/src/orchestration/identity-provider.test.ts`、`packages/worker-runtime/src/index.ts`、`packages/worker-daemon/src/modes/worker.ts`

- [ ] **Step 1: 在上述 4 文件按词边界替换 7 个符号**

- [ ] **Step 2: 确认无残留**
Run: `grep -rnE "\b(HostIdentity|HostIdentityGrant|HostAuthResult|HostAuthProviderKind|HostAuthProvider|HostAuthMethod|HostAuthInput)\b" packages apps --include=*.ts | grep -v node_modules`
Expected: 空输出。

- [ ] **Step 3: eslint --fix**
Run: `bunx eslint --fix packages/worker-runtime/src/index.ts packages/worker-runtime/src/orchestration/identity-provider.ts packages/worker-runtime/src/orchestration/identity-provider.test.ts packages/worker-daemon/src/modes/worker.ts`

- [ ] **Step 4: 验证**
Run:
```bash
bun run --filter '@zonease/aiworker-worker-runtime' typecheck
bun run --filter '@zonease/aiworker-worker-daemon' typecheck
bun test packages/worker-runtime/src/orchestration
bunx eslint packages/worker-runtime packages/worker-daemon
```
Expected: typecheck exit 0；测试 pass；eslint 0。

- [ ] **Step 5: commit**
```bash
git add packages/worker-runtime packages/worker-daemon
git commit -m "refactor(worker-runtime): HostAuth*/HostIdentity*→WorkerApiAuth*/WorkerApiIdentity* reframe"
```

---

## Task 4：reframe soul-catalog 簇符号

**符号映射：**
- `HostSoulCatalog` → `SoulCatalog`
- `listHostSoulCatalog` → `listSoulCatalog`
- `findHostSoul` → `findSoul`
- `findHostCapability` → `findCapability`
- `listHostCapabilitiesForSoul` → `listCapabilitiesForSoul`
- `HostCapability` → `SoulCapability`

（`listHostSoulCatalog` 内部方法 `this.listCatalog()` 名不含 Host，不改；`HostedSoulApp` 不改。）

**Files:**
- Modify: `packages/worker-runtime/src/soul-app/registry.ts`、`packages/worker-runtime/src/soul-app/registry.test.ts`、`packages/worker-runtime/src/orchestration/orchestrator.ts`（`WorkerOrchestrator` 用到 `HostSoulCatalog`/`listHostSoulCatalog`/`findHostSoul`/`findHostCapability`/`listHostCapabilitiesForSoul`/`HostCapability`）、`packages/worker-runtime/src/index.ts`、`packages/soul-app-runtime/src/index.ts`、`tests/architecture/refactor-contract.test.ts`

- [ ] **Step 1: 在上述文件按词边界替换 6 个符号**
注意 `HostCapability` 在 `orchestrator.ts` 与 `registry.ts` 各有一份 inline interface（`// -- inlined from deleted shared types --`），两处都改。

- [ ] **Step 2: 同步 refactor-contract.test.ts 的 forbidden 片段**
在 `tests/architecture/refactor-contract.test.ts` 同一 test 的 `forbidden` 数组：把 `'listHostSoulCatalog().templates'` 改为 `'listSoulCatalog().templates'`（其余 `'this.listCatalog().templates'`/`'catalog.templates'` 不含 Host，不改）。

- [ ] **Step 3: 确认无残留**
Run: `grep -rnE "\b(HostSoulCatalog|listHostSoulCatalog|findHostSoul|findHostCapability|listHostCapabilitiesForSoul|HostCapability)\b" packages apps tests --include=*.ts | grep -v node_modules`
Expected: 空输出。

- [ ] **Step 4: eslint --fix**
Run: `bunx eslint --fix packages/worker-runtime/src/index.ts packages/worker-runtime/src/soul-app/registry.ts packages/worker-runtime/src/soul-app/registry.test.ts packages/worker-runtime/src/orchestration/orchestrator.ts packages/soul-app-runtime/src/index.ts`

- [ ] **Step 5: 验证**
Run:
```bash
bun run --filter '@zonease/aiworker-worker-runtime' typecheck
bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck
bun test packages/worker-runtime/src/soul-app packages/worker-runtime/src/orchestration
bun test tests/architecture/refactor-contract.test.ts
bunx eslint packages/worker-runtime packages/soul-app-runtime
```
Expected: typecheck exit 0；测试 pass；refactor-contract pass；eslint 0。

- [ ] **Step 6: commit**
```bash
git add packages/worker-runtime packages/soul-app-runtime tests/architecture/refactor-contract.test.ts
git commit -m "refactor(worker-runtime): HostSoulCatalog/listHostSoulCatalog 等 soul-catalog 簇去 Host reframe"
```

---

## Task 5：提升 G2（engine 启动符号只被 worker-* import）

**Files:**
- Modify: `tests/architecture/inversion-guards.test.ts`（约 line 54-55 的 `test.todo('G2...')`）

- [ ] **Step 1: 写真断言替换 test.todo**
复用文件内已有的 `packageDirsWithPrefix`/`zonaseDependencyNames`（Plan 3 加入）。替换 line 54-55 的注释+todo 为：
```ts
// G2 ↔ C2：engine 启动机制（engine-bridge）只被 worker-* 包依赖；host-* 不得引用 engine 启动。
test('G2: engine launch symbols are imported only by worker-* packages', () => {
  const hostDirs = packageDirsWithPrefix('host-')
  expect(hostDirs.length, 'expected at least one host-* package directory').toBeGreaterThan(0)
  for (const dir of hostDirs) {
    const deps = zonaseDependencyNames(dir)
    expect(deps, `${dir} must not depend on the engine-launch package`).not.toContain('@zonease/aiworker-engine-bridge')
  }
})
```
> 删除原 G2 注释里「rename 落地前目录还是 host-*」的措辞（G2 是包级、与 worker-runtime 内目录名无关）。

- [ ] **Step 2: 跑确认通过**
Run: `bun test tests/architecture/inversion-guards.test.ts`
Expected: G2 pass（结构已干净）；todo 计数 -1。

- [ ] **Step 3: 验证非空性（临时引入违例必失败）**
```bash
# 临时给 host-cli 加 engine-bridge 依赖
node -e 'const f="apps/host-cli/package.json";const p=require("./"+f);p.dependencies["@zonease/aiworker-engine-bridge"]="workspace:*";require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")'
bun test tests/architecture/inversion-guards.test.ts 2>&1 | grep -E "G2|fail" | head
# 还原
git checkout -- apps/host-cli/package.json
```
Expected: 注入后 G2 **fail**；`git checkout` 还原后再跑应恢复 pass。

- [ ] **Step 4: commit**
```bash
git add tests/architecture/inversion-guards.test.ts
git commit -m "test(contract): 提升 G2 真断言（host-* 不依赖 engine-bridge）"
```

---

## Task 6：提升 G4（host-control 无 session/invocation/projection/engine/secret 归属）

**Files:**
- Modify: `tests/architecture/inversion-guards.test.ts`（约 G4 的 `test.todo`）

- [ ] **Step 1: 写真断言替换 test.todo**
替换 G4 注释+todo 为：
```ts
// G4 ↔ C3：host-control 仅控制面，不得拥有 runtime/domain/secret——deps 不含 engine/worker 运行时包，
// 导出/源码不出现 session/invocation/projection/engine/secret 归属符号。
test('G4: host-control exposes no session/invocation/projection/engine/domain/secret ownership', () => {
  const deps = zonaseDependencyNames('packages/host-control')
  for (const forbiddenDep of [
    '@zonease/aiworker-engine-bridge',
    '@zonease/aiworker-engine-projection',
    '@zonease/aiworker-worker-runtime',
    '@zonease/aiworker-worker-daemon',
  ])
    expect(deps, `host-control must not depend on ${forbiddenDep}`).not.toContain(forbiddenDep)

  const source = read('packages/host-control/src/index.ts')
  for (const forbiddenOwnership of [/\bsession\b/i, /\binvocation\b/i, /\bprojection\b/i, /\bengine\b/i, /\bsecret\b/i])
    expect(source, `host-control source must not own ${forbiddenOwnership}`).not.toMatch(forbiddenOwnership)
})
```
> `read()` 已在文件内定义（Plan 1）。如未来 host-control 拆多文件，可扩为遍历 `src/*.ts`。

- [ ] **Step 2: 跑确认通过**
Run: `bun test tests/architecture/inversion-guards.test.ts`
Expected: G4 pass；inversion-guards 中**仅剩 G1 一个 `test.todo`**（G2/G4 已转真断言；G3/G5/G6/G0 早已真）。

- [ ] **Step 3: 验证非空性**
```bash
# 临时在 host-control/src/index.ts 顶部加一行含 forbidden 词的注释
printf '// engine session leak\n' | cat - packages/host-control/src/index.ts > /tmp/hc && mv /tmp/hc packages/host-control/src/index.ts
bun test tests/architecture/inversion-guards.test.ts 2>&1 | grep -E "G4|fail" | head
git checkout -- packages/host-control/src/index.ts
```
Expected: 注入后 G4 **fail**；还原后恢复 pass。

- [ ] **Step 4: commit**
```bash
git add tests/architecture/inversion-guards.test.ts
git commit -m "test(contract): 提升 G4 真断言（host-control 无 runtime/domain/secret 归属）"
```

---

## Task 7：worktree 整体验证 + 合回

- [ ] **Step 1: 全量门**
Run: `bun install && bun run typecheck && bun run test:contracts && bun run lint && bun run test`
Expected: 全绿；`test:contracts` 中 inversion-guards **仅剩 G1 一个 `test.todo`**（G2/G4 转真断言，G1 留 Plan 5）。
> browser 测试既存环境性 flaky（见 memory [[worker-autonomy-inversion]]），本 plan 未动 CLI 产物/engine/browser，不跑 release:check。

- [ ] **Step 2: code-review-graph**（AGENTS.md 要求，非 docs-only）
对分支 diff 跑 `detect_changes_tool`（base = 合回前 codex tip）。预期：纯命名 reframe，关注是否有漏改/越界。

- [ ] **Step 3: 合回**
用 finishing-a-development-branch：合回前复查主树 peer 改动（共享树 [[concurrent-sessions-shared-tree]]）；FF 入 `codex/aiworker-refactor-dev-loop`；合并后主树复跑 `test:contracts + typecheck`；移除 worktree + 删分支。

- [ ] **Step 4: 更新 memory [[worker-autonomy-inversion]]**：Plan 4 落地 HEAD、G2/G4 已真断言（inversion-guards 13 pass/1 todo，仅 G1 剩）、`src/host`→`src/orchestration` + `Host*`→`Worker*`/`Soul*` reframe 完成、下一步 Plan 5（G1 standalone 金路径 + 全 release:check + 删旧权威/名）。

---

## Self-Review（执行者完成后）

1. **Spec 覆盖**：reframe §3 全 6 簇符号（orchestrator/api-identity/soul-catalog + Create*/Official* + 目录迁移）→ Task 1-4；G2/G4 非空提升 → Task 5-6；spec 对账已在 design doc §1 记录。
2. **边界**：未搬码到 host-control、未动 protocol `Hosted*`、未动 CLI 本地 `createHost`/`convergeHost*`、未动 G1。
3. **pinned 依赖**：docs/testing.md + check-doc-contract.ts 同块、refactor-contract.test.ts 的 activeSources/forbidden 均已同步（Task 1/4）。
4. **类型一致**：新名在定义/re-export/消费方逐一对齐；`grep` 残留检查每簇为空；typecheck 作最终安全网。
5. **下一步**：Plan 5 = G1 standalone 金路径（Host 缺席全通）+ 全 release:check + 删旧权威/旧名。
