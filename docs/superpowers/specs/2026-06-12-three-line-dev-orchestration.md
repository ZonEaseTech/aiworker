# 三线开发编排（worker 独立 / host 独立 / host-worker 联调）

- 日期：2026-06-12
- 状态：编排约定（developer/agent 照此推进；非 canonical 合同，优先级低于 `AGENTS.md` 与 `docs/architecture|protocol|runtime` 等 canonical docs）
- 来源：闭门造车审计（`tmp/aiworker-audit-2026-06-10/`）+ 2026-06-12 三线边界再审计（architect/security 双 APPROVE）+ 社区最佳实践调研
- 目的：让三条部署线**能独立开发、又能干净协同**——把已是构造级的隔离写明，把两条缝的协议定死。

---

## 0. 一句话模型

**不是 3 条平级并行线，而是 2 条真·并行（worker / host）+ 1 个依赖前两者的接合点（联调）。**

- worker 独立、host 独立：包前缀互斥 + `worker-*↛host-*` inversion guard + 拆发版门（#26），三重隔离已是**构造级**，并行分支/agent 几乎不撞。
- host-worker 联调：不独占包，拥有 wire 契约 `worker-control-protocol`，经「over-the-wire 协议 + env 注入接口」跨两 plane，**绝不靠代码 import 跨 plane**。它是缝，不是第三条平行线。

2026-06-12 再审计实证：切片 2 Host 真分发（#29-#35）落地后，4 条硬不变量全 HOLD（见 §4）——这套缝纪律被真实整合工作验证住了。

## 1. 线归属（= CODEOWNERS 的 path 映射）

| 线 | 拥有的包 / app | 发版产物 | CI 发版门 | npm dist-tag 入口 |
|---|---|---|---|---|
| **worker 独立** | `apps/worker-cli` `apps/worker-web` `packages/worker-runtime` `packages/worker-daemon` | `@zonease/aiworker-cli` | `release:check` | `npm i @zonease/aiworker-cli` |
| **host 独立** | `apps/host-cli` `apps/host-web` `packages/host-control` | `@zonease/aiworker-host-cli` | `release:check:phase2` | `npm i @zonease/aiworker-host-cli` |
| **host-worker 联调** | wire 契约 `packages/worker-control-protocol`；跨改两 plane 的 provision/tunnel/凭证路径 | 随两个 CLI 一起发 | 集成测试（phase2 浏览器门 + 真 provision e2e） | — |
| **共享底座** | `packages/soul-descriptor` `soul-sdk` `engine-bridge` `engine-projection` `storage-sqlite` `fs-layout` `ui` `cli-doctor`；`souls/*` | 被全线消费 | 全仓 `typecheck` + `test:contracts`（每 PR 跑，= 争用区自动绊线） | — |

## 2. 独立开发：怎么各跑各的

1. **分支前缀按线**：`worker/<slug>`、`host/<slug>`、`integ/<slug>`、`shared/<slug>`、`docs/<slug>`。
2. **CODEOWNERS 自动路由 review**（`.github/CODEOWNERS`）：改 worker-* 找 worker owner、改 host-* 找 host owner、改协议/共享底座找 tech-lead。一个 path 一个 owner，避免 review 疲劳。
3. **CI 门已分线**：
   - 每 PR 跑 `lint` + `checks`(typecheck + test:contracts)——确定性、全仓、抓共享底座破坏。
   - tag 发版跑分线门：`release:check`(worker) 与 `release:check:phase2`(host) 是 release.yml 两个**无 `needs` 耦合**的 job，host flaky 卡不住 worker（#26）。
4. **inversion guard 是自动安全网**：`tests/architecture/inversion-guards.test.ts` 强制 `worker-*↛host-*` 等，每 PR 经 `test:contracts` 跑——并行 agent 误耦合当场红，不靠人审。
5. **并行 agent/worktree**：worker 线与 host 线文件互斥，可并行隔离 worktree 跑；联调线碰共享缝，串行或显式协调（见 §3）。

## 3. 协同：两条缝 + 一个争用区

### 3.1 干净缝 = wire 契约 `worker-control-protocol`（好管，契约先行）
- **协议改动一律 additive、向后兼容**：新增字段 `optional`、新增帧用 discriminated-union 成员、`WORKER_CONTROL_PROTOCOL_VERSION` 非破坏不 bump。
- **契约先行**：联调需要新 wire 消息（如切片 2 的 `credential_acquire`）时，**协议改动先落**（两侧可消费的 schema），再让 worker + host 各自实现。
- **flow-gated 兼容**：新帧只在两端都新时才触发（worker 发 acquire / host 发 grant），旧端不受影响。
- 实证：`soulDescriptor` optional（旧 Host 仍解析、无需 bump）、`credential_*` typed frames——切片 2 照此做、再审计 HOLD。

### 3.2 脏缝 = worker-runtime 注入点（`executor.ts` env merge + `engine-env.ts`）⚠️
EB-1 resume 与切片 2/3 LLM 注入都伸进**同一文件**。这是**共享所有权区**，不是联调线地盘：
- **接口注入，不引 host**：注入走 `EngineCredentialProvider` 接口（worker-runtime 只认抽象接口，具体 `EngineCredentialStore` 在 worker-daemon），worker-runtime **零 host import**。
- **正交共存**：resume 改 args、凭证注入改 env（第三层 merge），不共享 mutation。改这文件前先确认不踩对方区。
- **touch-protocol**：同一时刻一个 owner 串行改 executor.ts 的 env/args 构造区；两线都要动时，先在协议/接口层定缝、再各自实现，不在实现文件里硬碰。

### 3.3 争用区 = 共享底座（soul-descriptor/engine-bridge/storage-sqlite/ui…）
改一处涟漪多线。**靠每 PR 的全仓 `typecheck` + `test:contracts` 当自动绊线**；改 secret 检测/redaction 等多份手搓项时，收敛到单一真源（审计 PROJ-3/SL-5）。

## 4. 硬不变量（CI 守 + 再审计 HOLD）

| # | 不变量 | 守卫 |
|---|---|---|
| 1 | `worker-*↛host-*`（worker 侧零 host import） | inversion-guards G2/G3 + grep，13/0 |
| 2 | descriptor-only（Host 把 descriptorJson 当不透明串，只读 identity.id/name display，不解析领域字段） | inversion-guards G4 + `forbidden-host-domain-schema` |
| 3 | 脏缝接口注入（worker-runtime 不引 host 概念，与 EB-1 正交共存） | code review + §3.2 touch-protocol |
| 4 | 协议 additive 向后兼容 | `index.test.ts` 向后兼容用例 + 不 bump 版本 |
| 5 | secret 不落盘（凭证仅内存，不进 DB/log/receipt/descriptor/access-token 文件/OpenAPI） | security review + redaction |

## 5. 独立发版（解 worker 不能单独 GA 的机制卡点）

**现状卡点**：`v*` tag 在一个 tag 上同发 worker-cli + host-cli **同版本**；打干净 `v1.0.0` 会把 host-cli 也推上 `latest`，而 host 是 Phase-2/过度建造——你不想 host 一起 GA。

**约定（社区标准 = 两个独立产品用独立版本号）**：release.yml 加 **per-line tag**，与既有 `v*`（同发两包）**并存、非破坏**：

```text
worker-v<version>   → 只发 worker-cli（release-worker job），渠道由 -rc.N/clean 派生
host-v<version>     → 只发 host-cli（release-host job）
v<version>          → 旧组合 tag,同发两包（保留向后兼容）
```

- 各 job 用 `if: startsWith(github.ref_name, '<prefix>') || startsWith(github.ref_name, 'v')` 选择性运行；版本断言/渠道派生剥各自前缀。
- **worker GA = 打 `worker-v1.0.0`** → 只把 worker-cli 的 `latest` 切到 v1，host 不动。host 自己按 `host-v*` 节奏走。
- 这是「两个独立产品独立版本」的社区标准做法（[Nx fixed-vs-independent](https://www.epicweb.dev/tutorials/versioning-and-releasing-npm-packages-with-nx/nx/fixed-vs-independent-versioning-in-nx)），对 2 个发版产物用 tag-pattern 即足，**不引 changesets/turborepo**（包/复杂度未到，避免过度建造；规模涨了再升级）。

> 顺带：host-cli 的 `latest` 现误指 `1.0.0-rc.1`，切独立发版时一并校正。

## 6. 不做（YAGNI / 留未来）

- **turborepo / nx**：现 2 发版产物 + 拆发版门已给线独立 gating，全仓 typecheck/contracts 够快；包/CI 时长涨上来再上（社区 2026：小仓 bun workspace 够用）。
- **changesets**：2 个 CLI 手工 bump 廉价；出现第 3 个可发布包或要自动 changelog 时再上 `fixed`/`independent` group。
- **自建网关**：切片 3（LiteLLM per-worker key），不在本编排范围。

## 7. 当前线状态锚点（2026-06-12）

- **worker 线**：EB-1/PROJ-1 已修上 main；离切 `worker-v1.0.0` GA 差 WDLM-1/3/4(守护生命周期) + EB-4净部分(引擎网络默认+披露)（见 worker-standalone backlog）。
- **host 线**：审计判过度建造；按需最小推进，别再抛光。
- **联调线**：切片 2 Host 真分发已落地（#29-#35），边界 HOLD；**部署门 = org-key blast radius 要 gate 在切片 3 per-worker key 之后才放给真实不可信员工**（见 host-worker-integration backlog 再审计新增项）。
