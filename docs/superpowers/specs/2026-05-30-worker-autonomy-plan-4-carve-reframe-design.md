# Worker 自治 · Plan 4：carve 对账 + worker-runtime 遗留 `Host*` 命名 reframe + G2/G4 — 设计 Spec

- 日期：2026-05-30
- 状态：已确认设计，待转 implementation plan
- 范围类型：destructive refactor（1.0 前允许），命名 reframe + 守卫提升 + spec 对账
- 上游权威：`docs/superpowers/specs/2026-05-30-worker-autonomy-engine-launch-inversion-design.md`（master spec）；本文件是其 §6 carve-point 1–3、§9 step 5、§10 G2/G4 的 Plan 4 落地设计。

## 1. 背景：carve 已被 Plan 2+3 基本完成

Master spec §6 列出 4 个 carve-point，措辞为「把 `host-runtime/src/*` 按 C1–C3 切开 → worker-runtime + host-control」。该措辞写于 **Plan 2 机械 rename 之前**。实际状态：

- **carve-point 4**（`src/worker/*` + BYOK executor → worker-runtime）：**Plan 2 的 `host-runtime → worker-runtime` rename 已完成**，BYOK 偏差已 re-home 到 worker-runtime。无剩余动作。
- **carve-point 1–3**（`host/runtime.ts`、`host/identity-provider.ts`、`soul-app/registry.ts`）：读三份源文件后确认它们**全是 worker 独立运行所必需的 worker 侧代码**——本地 soul-app 注册表、create worker、per-worker runtime（启动 engine）、worker 自身 broker API 的 bearer 鉴权。「Host」是旧「Host-launches-engine」模型的遗留命名。
- 真正的控制面（远程 worker registry + assignment 信封）**已是 Plan 3 全新建的 `host-control`**，并非从 worker-runtime carve 而来。

### 与 master spec 的对账（不悄悄缩小 spec）

> Master spec §6 carve-point 1–3 与 §9 step 5（“carve 4 个 carve-point 跨 worker/host 切开”）已被 Plan 2（rename 搬走 `worker/*`）+ Plan 3（全新建 host-control）覆盖。**C1（worker 脱 Host 独立）+ C3/G3（worker-\* 禁 import host-\*）在结构上禁止把剩余 worker 侧逻辑搬进 host-control**——一旦搬，worker-runtime 必须反向 import host-control，违反 G3 且破坏 standalone。

证据（在 `HEAD accd564e` 上）：

- `@zonease/aiworker-engine-bridge`（engine 启动机制）的依赖方仅 `worker-cli` / `worker-daemon` / `worker-runtime`（+ 自身）；`host-control` / `host-cli` / `host-web` 零引用。
- `host-control` 仅导出 `WorkerRegistry` / `createWorkerRegistry`；无 session/invocation/projection/engine/secret/domain。
- `createHostRuntime` / `HostRuntime` / `createLocalBearerAuthProvider` 的消费方仅 `apps/worker-cli/src/aiworker.ts` 与 `packages/worker-daemon/src/modes/worker.ts`（均 worker 侧）；host-\* 零消费 worker-runtime。

**结论：Plan 4 不搬码到 host-control，也不建 host-control 的 deferred 面（master spec §11 已 deferred connectors / delivery-profile 数据模型 / 非 web transport）。Plan 4 的实质是两件事：**

1. **reframe** worker-runtime 里的遗留 `Host*` 命名，兑现 master spec §1「杀掉 Host-launches-engine 心智模型，让下个 agent 不跑偏」的目的——自治 worker 包不应再出口 `Host*` 词汇。
2. **提升 G2/G4** 从 `test.todo` 为非空（non-vacuous）真断言。

## 2. 决策记录（已锁定）

| # | 决策 | 结论 |
|---|---|---|
| P4-D1 | carve 是否搬码到 host-control | **否**。C1+G3 禁止；控制面已由 Plan 3 host-control 承担；deferred 面不在本 plan |
| P4-D2 | 编排器类名 | `HostRuntime` → **`WorkerOrchestrator`**（`createWorkerOrchestrator` / `WorkerOrchestratorOptions`）；与 per-worker 的 `LocalWorkerRuntime` 区分 |
| P4-D3 | protocol 层 `Hosted*` 是否动 | **不动**。`HostedSoulApp` / `buildHostedSoulApp` 来自 `soul-protocol`（共享协议层），改它要动 protocol + 所有 souls/SDK，超 Plan 4；其本地包装函数 `getHostedSoulApp` / `listHostedSoulApps` / `getHostedSoulAppSafely` 一并保留（「Hosted」= 已注册，语义与协议类型一致） |
| P4-D4 | reframe 规则 | 凡「Host」表示**控制面 / 旧本地壳**含义的一律去掉；仅协议类型派生的「Hosted」保留 |
| P4-D5 | `src/host/` 目录 | 移除，两文件迁入 `src/orchestration/`（精确文件名在 writing-plans 期定） |
| P4-D6 | G2/G4 断言形态 | 沿用 Plan 3 的「枚举包目录 + 负向归属」法，确保非空（见 §4） |
| P4-D7 | 非范围 | `VerticalSoul` 等其它非 `Host` 遗留命名不在本 plan；host-control deferred 面不在本 plan |

## 3. 命名映射（worker-runtime 本地）

### 保留（protocol 层 / 协议派生，reframe 排除）

`HostedSoulApp`、`buildHostedSoulApp`（来自 `@zonease/aiworker-soul-protocol`）、`getHostedSoulApp`、`listHostedSoulApps`、`getHostedSoulAppSafely`。

### reframe（遗留控制面 / 旧壳框架命名 → worker 词汇）

| 现名 | 新名 |
|---|---|
| `HostRuntime` / `createHostRuntime` / `HostRuntimeOptions` | `WorkerOrchestrator` / `createWorkerOrchestrator` / `WorkerOrchestratorOptions` |
| `src/host/`（runtime.ts + identity-provider.ts） | `src/orchestration/` |
| `HostIdentity` / `HostIdentityGrant` | `WorkerApiIdentity` / `WorkerApiIdentityGrant` |
| `HostAuthResult` / `HostAuthProviderKind` / `HostAuthProvider` / `HostAuthMethod` / `HostAuthInput` | `WorkerApiAuthResult` / `WorkerApiAuthProviderKind` / `WorkerApiAuthProvider` / `WorkerApiAuthMethod` / `WorkerApiAuthInput` |
| `HostSoulCatalog` / `listHostSoulCatalog` | `SoulCatalog` / `listSoulCatalog` |
| `findHostSoul` / `findHostCapability` / `listHostCapabilitiesForSoul` / `HostCapability` | `findSoul` / `findCapability` / `listCapabilitiesForSoul` / `SoulCapability` |
| `CreateHostSoulWorkerInput` / `CreateHostSoulWorkerResult` | `CreateSoulWorkerInput` / `CreateSoulWorkerResult` |
| `HostOfficialSoulAppBootstrap` | `OfficialSoulAppBootstrap` |

保留无 `Host` 的既有 worker 词汇：`createLocalBearerAuthProvider` / `LocalBearerAuthProviderOptions`（已合适）。

`HostRuntime` 方法内的 `requireWorker` / `engineAssetSourceForWorker` 等无 `Host` 前缀，不变。

### 消费方同步

- `packages/worker-runtime/src/index.ts`：re-export 改名（16 处 `Host*` 导出）。
- `apps/worker-cli/src/aiworker.ts`：`createHostRuntime` 调用点、本地 `createHost(...)` 包装、`HostRuntime` 类型注解（最大消费方，1978 行）。
- `packages/worker-daemon/src/modes/worker.ts`：编排器与 identity provider 引用。
- 受影响 test：`host/runtime.test.ts`（随目录迁移）、`soul-app/registry.test.ts`（`findHostCapability` 等引用）、worker-cli/worker-daemon 测试中的引用。

## 4. G2/G4 非空断言（`tests/architecture/inversion-guards.test.ts`，沿用 Plan 3 枚举法）

- **G2 ↔ C2**：枚举 host-\* 包目录，断言其 `dependencies`/`devDependencies` **不含** `@zonease/aiworker-engine-bridge`（engine 启动机制包）；且 host-\* 源码不 import engine 启动符号。**非空性**：任一 host-\* 引入 engine-bridge 依赖即失败。删除 G2 旧注释（其把 `src/host/` 目录误当 `host-*` 包；G2 是包级、与 worker-runtime 内目录名无关——这也正是 rename 与守卫可分离的原因）。
- **G4 ↔ C3**：断言 `host-control` 的 deps **不含** `engine-bridge` / `engine-projection` / `worker-runtime` / `worker-daemon`；且 `host-control/src` 导出与源码**不出现** session / invocation / projection / engine / secret 归属符号（按受控 token 集匹配，避免误伤普通词）。**非空性**：host-control 引入上述任一即失败。
- G1（standalone 金路径）/ G3（worker-\*≠host-\*，Plan 3 已真断言）/ G5（已真断言）/ G6（已真断言）不在本 plan 改动；G1 留待 Plan 5。
- 同步更新 `tests/architecture/package-ownership.test.ts`（若改名触及其断言的符号）与 `docs/testing.md`（Inversion Guards 段：G2/G4 由 todo 升真）。如 `check-doc-contract.ts` 钉相关短语，同步。

## 5. 边界

- ✅ reframe worker-runtime 本地 `Host*` 命名 + 迁 `src/host/`→`src/orchestration/` + 同步消费方 + 提升 G2/G4 + 更新结构门/文档 + spec 对账记录。
- ❌ 不动 protocol 层 `HostedSoulApp`/`buildHostedSoulApp`；不搬码到 host-control；不建 host-control deferred 面（connectors/delivery/非 web transport）；不动 G1（Plan 5）；不动 `VerticalSoul` 等非 `Host` 遗留名；不改运行时行为（纯命名/结构 + 守卫）。

## 6. 验证与风险（沿用 Plan 2/3 纪律）

- worktree `worker-autonomy-plan4`（从 codex/aiworker-refactor-dev-loop tip fork）内：`bun install && bun run typecheck && bun run test:contracts && bun run lint && bun run test` 全绿（跳过全 release:check：无 CLI 产物/engine/browser 行为改动）。
- **Plan 2 同类风险**：(1) h→w 改名移动 import/key 字母序 → eslint `--fix` + 复核；(2) **分段路径/字符串字面量**含 `'host'` 的 grep（避免 contiguous-string 替换漏掉测试夹具）；(3) 改名是纯结构，行为不变，靠既有测试回归把关。
- code-review-graph（AGENTS.md 要求）后 FF 合回 codex/aiworker-refactor-dev-loop；更新 memory [[worker-autonomy-inversion]]：Plan 4 落地、G2/G4 真断言、下一步 Plan 5（G1 standalone 金路径 + 全 release:check + 删旧权威/名）。

## 7. 测试策略

纯命名 reframe 的正确性由「**改名前后既有测试集全绿**」证明（行为不变）。G2/G4 提升各自先确认**当前结构下通过**（pre-check deps/exports），再翻 `test.todo`→真断言，并验证「人为引入违例会失败」（非空性）。新增/迁移的 test 文件路径登记入 `docs/testing.md`。
