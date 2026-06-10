# 拆发版门：worker / Phase 2 双门双 job + PR 确定性门

- 日期：2026-06-10
- 状态：设计稿（已获用户口头批准 "通过"，待 spec review → writing-plans）
- 范围：CI / 发版配置改动。**零 worker/host 运行时代码改动。**
- 触发：闭门造车审查（`tmp/aiworker-audit-2026-06-10/report.md`）的 `ci-split`、`TGA-4`、`release-check-monolithic` 三条 finding。本轮是"双线互不影响"战略下车道 A 的解锁第一步。

---

## 1. 问题陈述（带代码证据）

1. **发版门把 worker 和 host/Phase2 焊死。** `package.json` 的 `release:check` 是一条 16 段 `&&` 链，把 worker 测试与 host/Phase2 测试（`test:browser:phase2`、`smoke:host-dist-release`、`bun run test` 中的 host-cli/host-web 部分）串在一起。`release.yml` 在一个 `v*` tag 上用这条门同时发 `worker-cli` + `host-cli`。**后果**：host 的 flaky 测试（host-lifecycle tmux 5000ms、phase2 三 spec 首跑常 flake）一红，整个 tag（含 worker）就发不出去。

2. **PR/push 阶段只跑 lint。** `lint.yml` 在 PR + push:main 只跑 `lint` + worker-web 几步；`typecheck` 和 `test:contracts`（`testing.md` 自认的 "primary guardrail"）全推到 tag 才跑。**后果**：broken main 只在 tag 时才发现（rc.8/9/10 反复撞门的根因）。

3. **`release:check` 尾部冗余。** 链尾 `bun run check` = `typecheck && lint`，与链中已独立列出的 `typecheck`/`lint` 完全重复（`release-check-monolithic` 的干净赢）。

## 2. 目标与边界

- **目标**：worker v1 能独立发版，host 的 flaky 测试再也卡不住它；真回归在 PR 阶段就拦下，不拖到 tag。
- **约束**：纯 CI/发版配置，不碰任何 worker/host 运行时代码（零冲突面）。
- **决策（用户已选）**：
  - 拆分深度 = **Level 2**：worker / host 在同一个 `v*` tag 上变成两个互不依赖的 job，host 门红不连累 worker；两包版本暂仍锁同号（不引 changesets）。
  - 本轮范围 = **同时补 PR 门**（typecheck + test:contracts）。

## 3. 设计

### 3.1 package.json —— 一条门拆成两条 + 去重 + 新增分组脚本

**worker 门 `release:check`（全确定性，worker v1 独立发版靠它）**，按序：

```
docs:check → test:contracts → test:protocol → test:cli →
test:browser:freeform → typecheck → lint → build →
smoke:dist-release → smoke:standalone-release →
smoke:standalone-runtime → smoke:npm-package → test:worker
```

- **保留 `test:browser:freeform`**：worker 自己的质量证明（TGA-4：当年靠它抓到"静态门全绿但 chat 没接线"的盲区，移走 = 重开盲区）。
- **去掉尾部 `bun run check`**：与第 6、7 位的 `typecheck`/`lint` 重复。
- `typecheck`/`lint`/`build` 是全仓确定性命令，放 worker 门内同时覆盖 host 编译。
- 末位 `bun run test` 替换为 **`test:worker`**（只跑非 host 包测试，把 host flaky 测试排除出 worker 门）。

**phase2 门 `release:check:phase2`（新增，host，可能 flaky）**，按序：

```
host build → test:browser:phase2 → smoke:host-dist-release → test:host
```

- `host build`：因为 host job 独立（无 `needs`），`smoke:host-dist-release` 需要 host-cli dist 已构建；故 phase2 门自带 host 构建步，不依赖 worker 门的 `build`。
- `test:browser:phase2` 自身已 `--filter '@zonease/aiworker-host-web' build`（保留现状）。

**新增两个分组脚本**：

- `test:host` = `bun run --filter '@zonease/aiworker-host-*' test`（精确圈住 host-cli 的 host-lifecycle tmux flake、host-web vitest、host-control）。
- `test:worker` = host 的补集。**实现决策**：优先用 bun 负向 filter `bun run --filter '!@zonease/aiworker-host-*' test`；若 bun 负向 filter 行为不符预期（R1），回退为显式枚举 worker + shared 包。实现时实跑验证哪条可用。

### 3.2 .github/workflows/release.yml —— 一个 tag，两个互不依赖的 job

- **`release-worker`**：checkout/setup/install/playwright → assert worker 版本==tag → `bun run release:check` → 编译四平台二进制 → 打包 bundles → smoke release artifacts → 派生 channel → 发 `worker-cli` → 挂 GitHub Release 二进制资产。
- **`release-host`**：checkout/setup/install/playwright → assert host 版本==tag → `bun run release:check:phase2` → 派生 channel → 发 `host-cli`。
- **两 job 无 `needs` 互相依赖** → 并行、各自成败。**host 门红 → 只 host-cli 不发，worker-cli 照发**。这是解锁点。
- 版本断言拆开：worker job 断言 worker-cli 版本==tag，host job 断言 host-cli 版本==tag（两包仍按约定一起 bump 到同号，但门与发布独立）。
- GitHub Release 二进制只在 worker job 创建（host 不建 release）。

### 3.3 .github/workflows/lint.yml —— 补 PR 确定性门

新增 `checks` job，PR + push:main 触发：

```
bun run typecheck
bun run test:contracts
```

- 都是确定性、无 engine auth、无 browser、不碰 flaky。
- **不加 `bun run test`**（它扬到 host flaky）。现有 lint job 与 worker-web 几步保留不动。

### 3.4 自锁契约同步（必须，否则 docs:check 当场红）

`scripts/check-doc-contract.ts` 现在强制**三方完全相等**：`release:check`（package.json）=== `testing.md` 的「Current Release Gates」列表 === `expectedReleaseGateCommands`（脚本内数组），顺序一字不差；另在 748-774 行锁死 release.yml 必须是"release:check → compile → package → smoke → publish → attach"单一流程。拆门**必须连这套校验逻辑一起改**：

- **`docs/testing.md`「## Current Release Gates」段（约 219-249 行）**：从一个列表改成记**两个门**（worker 门 + phase2 门），更新聚合断言措辞（说明 worker / phase2 各自的 aggregator）。
- **`scripts/check-doc-contract.ts`**：
  - `expectedReleaseGateCommands`（595-611）拆成 worker / phase2 两个期望数组。
  - `documentedReleaseGateCommands()` 解析逻辑改成从 testing.md 解析两个列表。
  - 等值校验（613-633）：分别校验 `release:check` === worker 列表、`release:check:phase2` === phase2 列表。
  - release.yml 结构断言（748-774）：适配两-job 形态（worker job 含 compile/package/smoke-artifacts/attach；host job 含 phase2 门 + 发 host-cli）。
  - 必需子串集（468-476）：更新第 473 行那段写死的 gate 列表字符串为两段。
  - 保留 562、875-901 对 `test:browser:phase2` 的既有断言（该脚本仍存在，只是归到 phase2 门）。

## 4. 验收口径（DoD）

1. `bun run release:check` 本地 exit 0，且 **grep 证实** `test:browser:phase2` / `smoke:host-dist-release` / `test:host` **均不在** worker 门内。
2. `bun run release:check:phase2` 本地 exit 0（host 三 spec 首跑可能 flake；按既有惯例隔离重跑判 flake，不视为失败）。
3. `bun run docs:check` exit 0（证明 3.4 三处锁定已同步、无遗漏）。
4. `bun run typecheck` + `bun run test:contracts` exit 0（PR 门跑的就这俩）。
5. `release.yml` 中 `release-worker` 与 `release-host` 两 job 之间**无 `needs` 依赖**（人工核对 + 可加一条 contract 断言）。
6. 全程零 worker/host 运行时代码改动（`git diff` 只动 package.json / 两个 workflow / testing.md / check-doc-contract.ts / 本 spec）。

## 5. 明确不做（YAGNI，留后续轮）

- 不引 changesets、不拆 tag、不动版本号同步机制（= Level 3 彻底独立车道）。
- 不硬化 host 三个 flaky spec 本身（TGA-4 的 option b，独立一轮）。
- 不重构 check-doc-contract.ts 的"精确子串脆性"（TGA-5，独立一轮）——本轮只在它现有机制内同步。
- 不动 worker/host 任何运行时逻辑（EB-1 失忆 / PROJ-1 重启锁死是车道 A 的后续轮）。

## 6. 风险与协调

- **R1 — bun 负向 filter 行为**：`--filter '!@zonease/aiworker-host-*'` 若不按预期排除，回退显式枚举。实现时实跑验证。
- **R2 — 自锁契约连锁**：3.4 任一处漏改，`docs:check` 立即红。实现必须把 package.json / testing.md / check-doc-contract.ts / release.yml 四处作为一个原子改动一起验。
- **R3 — host job 独立性**：`release-host` 无 `needs` 才能做到"host 红不连累 worker"；若实现时误加 `needs: release-worker` 会重新耦合，验收第 5 条专门拦这个。
- **R4 — 共享工作树**：当前工作树干净、无 peer churn，是干净下手窗口；提交前重新核对 git status，只 stage 本改动涉及的文件。
