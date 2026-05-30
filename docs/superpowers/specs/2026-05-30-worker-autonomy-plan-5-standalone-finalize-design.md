# Worker 自治 · Plan 5（收官）：G1 standalone 守卫 + browser 测试硬化 + cleanup + release:check — 设计 Spec

- 日期：2026-05-30
- 状态：已确认设计，待转 implementation plan
- 范围类型：destructive refactor 收官（1.0 前允许）；守卫提升 + 测试硬化 + 残留清理 + 全门验证
- 上游权威：master spec `docs/superpowers/specs/2026-05-30-worker-autonomy-engine-launch-inversion-design.md` §9 step 8–9、§10 G1。本文件是 5-plan 系列**最后一阶段**的落地设计。

## 1. 背景：release:check 已实跑，结果定范围

不同于 Plan 3/4（按计划跳过 release:check），本会话**实跑了 release:check 的全部重型门**（它们上次运行在 Plan 2 之前，是真正的未知数）。结果（HEAD fc594f1f，含 Plan 1–4）：

- **确定性门全绿**：`build`（3 bundles）、`test:cli`、4 个 `smoke:*`（dist-release / standalone-release / standalone-runtime / npm-package）、`typecheck`、`lint`、`test`、`test:contracts`、`docs:check`。**Plan 4 reframe 未在 bundle/smoke/CLI 层引入任何回归。**
- **唯一红**：`test:browser:freeform` —— 实证为**文档记录的环境性 flake**（`waitFor: Timeout 15000ms` 等 `micro-app[data-slot="soul-app-mounted-micro-app"]`；系统 load≈15 + 失败 run 泄漏 chromium 放大）。清理泄漏 chromium 后单跑 `freeform-mounted-workbench.spec.ts` `EXIT=0` 通过 → 确认是 flake 而非回归。

行为面的 **C1（worker standalone）证据已存在**：`freeform-golden-path.test.ts`（create→session→invocation→engine→`succeeded`，零 `host-*` 引用）+ 两个 browser spec，全程不起 host 进程、不碰 host-control/host-cli/host-web。

### 与 master spec 的对账（不悄悄缩小 spec）

> Master spec §9 step 9「删旧权威/旧名」已由 **Plan 1（canonical docs 全量重写为 Worker 自治）+ Plan 2/4（host-runtime/host-daemon→worker-*、apps/cli/web→worker-*、`Host*` 命名 reframe）** 完成。残留旧名仅存在于 `docs/superpowers/plans|specs/*` **历史记录文档**（描述各 plan 当时的状态/意图，**不重写**），以及两个 **0-tracked-file 的 untracked cruft 目录** `packages/host-runtime`、`packages/host-daemon`（rename 后的文件系统残渣，非 git 跟踪）。

**结论：Plan 5 = (A) 提升最后的 G1 守卫 + (B) 硬化 flaky browser 测试（release:check 唯一阻塞）+ (C) 残留清理 + (D) 全 release:check 收官验证。**

## 2. 决策记录（已锁定）

| # | 决策 | 结论 |
|---|---|---|
| P5-D1 | G1 形态 | **结构守卫锚行为金路径**：断言 `freeform-golden-path.test.ts` 存在、零 `host-*`/`aiworker-host` 引用、且 wired 进 `test:cli`。与 G3（包依赖方向）区分；非空（删证据或夹带 host 依赖即 fail） |
| P5-D2 | browser flaky | **硬化等待**：提高 micro-app mount 固定超时（env 可覆盖，默认 ~45s）+ 断言就绪处改等 `data-child-ready="true"` 条件信号，而非仅 `state:'attached'`/固定时间 |
| P5-D3 | 旧权威/旧名 | 已完成（Plan 1/2/4）；Plan 5 仅 `rm -rf` cruft 目录 + 记录对账；不重写历史 plan/spec 文档 |
| P5-D4 | Plan 4 残留 | 清 `orchestration/orchestrator.test.ts` 的 Host prose（`describe('Host runtime boundary')`、`function host()`） |
| P5-D5 | 范围 | 单一 Plan 5（四项小而内聚）；不拆子计划 |
| P5-D6 | 收官标志 | inversion-guards 达 **7 pass / 0 todo**（G0–G6 全真）；release:check 绿（browser 若需 rerun，如实说明） |

## 3. 组件

### A. G1 提升（`tests/architecture/inversion-guards.test.ts`）

把 `test.todo('G1: worker standalone golden path passes with Host absent')` 升为真 `test(...)`，断言：

1. `apps/worker-cli/src/freeform-golden-path.test.ts` 存在。
2. 其源码不含 `host-*` 包名 / `aiworker-host` / host-control 等 host 面引用（行为金路径 host-free）。
3. 它被 wired 进 `package.json` 的 `test:cli` 脚本（即 release:check 真的会跑这条自治证据）。

**非空性**：删除该测试文件、或在其中引入 host-* 依赖、或从 `test:cli` 摘除它，G1 都会 fail。**与 G3 区分**：G3 是包级 deps 方向；G1 锚定「行为自治证据存在且 host-free 且被执行」。复用文件内 `read()` helper。

### B. browser 测试硬化（`tests/browser/*.spec.ts`）

两个 spec 的 micro-app mount 等待：

- **提高固定超时**：当前 `freeform-cli-golden-path.spec.ts:132` `waitFor({ state: 'attached', timeout: 15_000 })`、`:376` `waitForFunction(..., { timeout: 15_000 })`、`freeform-mounted-workbench.spec.ts:117` `waitFor({ state: 'attached' })`（受 15s 默认约束）→ 统一改为一个**可由 env 覆盖的超时常量**（如 `AIWORKER_BROWSER_MOUNT_TIMEOUT_MS`，默认 45_000），容忍高负载。
- **条件化就绪等待**：断言「micro-app 已挂载就绪」处，改等真实就绪信号 —— mounted-surface 在子应用就绪时设 `data-child-ready="true"`（`apps/worker-web/src/worker/studio/mounted-surface.tsx:288`）。等 `micro-app[data-slot="soul-app-mounted-micro-app"][data-child-ready="true"]`（或等价 `waitForFunction` 读该属性），替代仅等 `state:'attached'`（元素存在 ≠ 子应用就绪）。

目标：`test:browser:freeform` 在 load≈15 下稳定通过，消除 flake（而非靠 rerun）。

### C. 残留清理

- `rm -rf packages/host-runtime packages/host-daemon`（均 0 tracked files；纯文件系统 cruft，非 git 提交内容）。
- `orchestration/orchestrator.test.ts`：`describe('Host runtime boundary')` → `describe('Worker orchestrator boundary')`；本地 `function host()` → `function orchestrator()`（及调用点）。纯测试 prose，行为不变。

### D. 收官验证

跑全 `bun run release:check` 绿。确定性门已在本设计阶段验证通过；B 落地后 browser 门应在负载下稳定。若 browser 仍需个别 rerun，完成声明须如实写明「release:check green, browser specs passed on rerun」，不谎报单次干净通过。

## 4. 边界

- ✅ 升 G1（结构守卫）+ 硬化两 browser spec mount 等待 + rm 两个 cruft 目录 + 清 orchestrator.test.ts Host prose + 全 release:check 验证 + 更新 memory。
- ❌ 不重写 `docs/superpowers/plans|specs/*` 历史文档；不动运行时行为（B 仅改测试等待策略，C 仅改测试 prose / 删 cruft）；不新增功能；不动 G0/G2–G6（已真）。

## 5. 验证与收官

- worktree `worker-autonomy-plan5`（从 codex/aiworker-refactor-dev-loop tip fork）内：`bun install`，A 后 `bun test tests/architecture/inversion-guards.test.ts`（G1 pass + 非空性注入验证），B 后 `bun run test:browser:freeform`（负载下稳定），最终全 `release:check`。
- code-review-graph（AGENTS.md，非 docs-only）。FF 合回 codex（复查共享树 [[concurrent-sessions-shared-tree]]）。
- 更新 memory [[worker-autonomy-inversion]]：**5-plan 系列完成**，G0–G6 全真（inversion-guards 7 pass / 0 todo），release:check 绿，engine 启动权倒置落地。

## 6. 测试策略

- G1：先确认当前结构通过（金路径已存在且 host-free），翻 todo→真断言，再注入违例验证非空性。
- B：硬化是测试基础设施改动；正确性由「负载下 `test:browser:freeform` 稳定通过」+「既有断言语义不变」证明（不放宽断言、只放宽/条件化等待）。
- C：rm cruft 不影响任何 tracked 内容；prose 改名由既有 orchestration 测试继续全绿证明行为不变。
