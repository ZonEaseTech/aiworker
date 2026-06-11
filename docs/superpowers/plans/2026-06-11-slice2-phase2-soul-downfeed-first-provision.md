# 切片 2 Phase 2 聚焦实现计划 —— soul 真下发 + first-provision 引导 + 重启自愈

- 日期：2026-06-11
- 状态：**pending approval**（聚焦实现规划轮，未执行）。评审：**Architect = SOUND-WITH-CONCERNS（concern 全并入）/ Critic = APPROVE（无剩余 must-fix）**。
- 父计划：`docs/superpowers/plans/2026-06-11-slice2-host-real-distribution.md`（§3 Phase 2 段，设计已定型）
- 前置：Phase 1（诚实投递 + resolveApiKey）已合 main（PR #29 `e9fff3e3`）
- 范围：切片 2 Phase 2 = soul 真下发 + first-provision 引导 + 重启自愈 + worker_id 守卫。**不含** Phase 3（LLM 凭证注入）。
- 侦察基线：main `e9fff3e3`，已勘验（见 §0）。

> 本轮把父计划已批准的 Phase 2 **设计**落成**可执行步骤**，并解决父计划遗留的开放决策（descriptor 下发载体细节、first-provision 入口、持久 token 落点、三源 restart-state 权威）。

---

## 0. 侦察基线（main `e9fff3e3`，已勘验）

**A. bootstrap 路径**
- `bootstrapWorkerApp`（`packages/worker-daemon/src/modes/worker.ts:125`）启动序列：DB → orchestrator → `bootstrapOfficialSoulApps`（L178）→ `resolveSingleActiveWorker`（L182）→ `kind==='single'` 才 `createRuntimeForWorker`+`init`（L190-194）→ 注册路由 → **`kind==='single'` 才 `maybeProvisionCheckIn`+`connectWorkerAccessTunnel`（L738-755）**。
- **C2 确认**：裸机 `kind==='none'` → 既不建 runtime、也不 check-in/建 tunnel。
- **PROJ-1（c0f4def3）与本期关系（已纠正）**：PROJ-1 改 `runtime.ts:1282 repairWorkspaceLayouts`（`runtime.init()` 内 workspace 投影调和）。**注意本期 D2 的 `createSoulWorker` 确实调 `runtime.init()`（orchestrator:198-199）→ 即触 PROJ-1 面**，并非「不碰」。安全成立的真正理由是**幂等/重启安全**：CLI 首次 provision 的 init 跑零 workspace = repair no-op，daemon boot 的 init 与普通重启同构（PROJ-1 已硬化）。本期不修改 `repairWorkspaceLayouts` 本身。

**B. provision 客户端 + access token**
- `maybeProvisionCheckIn`（`provision-client.ts:192-198`）触发 = `kind==='single'` **且** env 有 `AIWORKER_HOST_URL`+`AIWORKER_PROVISION_TOKEN`。
- access token 纯 in-memory（`input.access.token`，`sendHello` L335-337）；重连重放同一 token、**从不 re-check-in**（L244 仅 warn）、**从不落盘**、boot 不恢复。
- provision CLI（`apps/worker-cli/src/aiworker.ts:1658-1666`）：**只设 2 个 env + `daemonForeground`，不建 worker**。

**C. check-in + worker_id UNIQUE**
- `handleCheckIn`（`host-server.ts:753`）：`verifyAndConsumeProvisionToken`（L762）→ `markAssignmentCheckedIn`（L766，**首次写 worker_id**）→ `issueAssignmentAccessToken`（L773）→ 回 `{access, assignment:{…soulReleaseRef…}}`（**只回 ref，不回 descriptor**）。
- `host_assignments.worker_id` nullable（`schema.ts:10`），`createAssignment` 不写（留 NULL）；UNIQUE 索引（`schema.ts:32`）对 NULL 互异 → **碰撞只在 `markAssignmentCheckedIn` 的 UPDATE（`storage/host/index.ts:353`）**；handler 无 try/catch → 第二次同 worker_id check-in 抛未处理异常（≈500，需确认冒泡）。

**D. soul descriptor 安装 + 绑定**
- 安装 API：`POST /api/app-installation/install`（worker.ts:287）→ `installAppDescriptor`(inline) / `installAppFromPath` → `installSoulDescriptor`（`soul-app/registry.ts:63`）→ `upsertSoulApp` 写 worker DB `soul_apps.manifest_json`（无独立 descriptor 表）。
- **关键 gap**：`engineAssetSourceForWorker`（orchestrator L233-242）仅当 `sourceKind==='descriptor-path'` 注入 engine 资产，**`inline` 返回 null**。→ **下发必须走 descriptor-path**。
- `createSoulWorker`（orchestrator L173-205）：`createWorkerLock`（进程内单-active 锁）→ `requireAvailableSoul`（soul 必须 catalog available）→ C2 单-active 检查 → `upsertWorker({appId: soul.id…})`（绑定）。「终生不变」= 无改 appId 的 API 表面（非显式不可变约束）。
- receipt `workerAssignmentReceiptSchema`（`worker-control-protocol/src/index.ts:50-55`）`.strict()`，加字段须显式声明。

**E. worker-home 持久状态**
- worker home = `<home>/workers/<workerId>`（`fs-layout`，含 `assertSafeWorkerId` 守卫）；`aiworker.db` 同级。
- **全仓零 0600/chmod 先例** → 持久 access token 是**全新 secret 边界**，无先例可抄。

---

## 1. 解决父计划遗留的开放决策（本轮裁决）

| 决策 | 裁决 | 依据 |
|---|---|---|
| **D1 descriptor 下发载体** | check-in receipt 内嵌 descriptorJson（B-opt1）；worker 落盘到 `<worker-home>/soul.descriptor.json` 后走 **`installAppFromPath`（descriptor-path sourceKind）** | 一次性安装契合一次性 check-in；descriptor-path 才注入 engine 资产（§0-D 关键 gap，inline 会丢资产） |
| **D2 first-provision 入口** | **provision CLI 命令做引导**（非改 bootstrap gating）：CLI 进程 check-in → 收 descriptor+access → 本地安装 descriptor + `createSoulWorker` 绑定 → **持久化 access token** → 再 `daemonForeground`；daemon boot 读持久 token 连 tunnel、**不重复 check-in** | 保持 bootstrapWorkerApp gating 不变；check-in 只发生一次（CLI），token 单次消费不冲突；与 D3 持久 token 天然耦合 |
| **D3 持久 access token 落点** | `<worker-home>/access-token`（独立文件，`writeFile mode:0o600` + chmod 兜底）；**非** worker.db（DB 文件无法 0600）。boot 读回喂 `connectWorkerAccessTunnel` 的 `input.access` | 独立文件可 0600；worker-home 有 `assertSafeWorkerId` 守卫；与「DB 不存字面 secret」边界区分（本地 0600 文件是另一信任域） |
| **D4 worker_id 守卫落点** | **决策点在 `handleCheckIn`**：新增 storage read helper `getCheckedInAssignmentByWorkerId(workerId)`，handler 在调 `markAssignmentCheckedIn` **前**预判——同 worker_id 同 assignment → **幂等**回既有 receipt；异 assignment 抢占 → **诚实 4xx**；storage 层 UPDATE 的 UNIQUE 抛仅作最后兜底，绝不让它到达响应。**绝不 500** | 碰撞钉在 UPDATE（§0-C，storage/host/index.ts:353）；策略是请求级语义属 handler，幂等优先 |
| **D5 三源 restart-state 权威** | 权威序：**worker.db（有无 active worker，本地真源）> 持久 token-file（能否免 check-in 重连）> provision env（是否首次引导信号）**。冲突矩阵见 §2.3 | 本地 DB 是 worker 身份唯一真源；token-file 仅是重连凭证；env 仅触发信号 |
| **D6 check-in once 统一** | daemon `maybeProvisionCheckIn` 改为：**持久 token 存在 → 读回用之、跳过 check-in**；否则 provision env+token 在 → check-in + 持久化 token（兼容「daemon 首次直接带 env 启动」路径） | 消除 CLI check-in 与 daemon check-in 的双重消费冲突 |

---

## 2. 架构设计

### 2.1 first-provision 引导流（裸机，D2）

```
员工裸机 `aiworker provision --host --token`
  │ 1. CLI 进程 HTTP check-in 到 Host（消费 provision token）
  │    ◄── { access.token, assignment:{ soulReleaseRef, soulDescriptor(新), workerId } }
  │ 2. 写 <worker-home>/soul.descriptor.json + installAppFromPath(descriptor-path)
  │    └─ 确保 descriptor 成 catalog-available（createSoulWorker 的 requireAvailableSoul 前置）
  │ 3. createSoulWorker({ appId: soulId, workerId })  ← 绑定 soul（终生不变）
  │ 4. 持久化 access token → <worker-home>/access-token (0600)
  │ 5. daemonForeground()
  ▼
daemon boot（bootstrapWorkerApp）
  │ resolveSingleActiveWorker() → 现在 kind==='single'（worker 已建）
  │ maybeProvisionCheckIn(): 持久 token-file 存在 → 读回、跳过 check-in（D6）
  │ connectWorkerAccessTunnel(access=持久token)  ← tunnel 起
  ▼ 员工开箱即用（Phase 3 再注入 LLM 凭证；本期引擎走切片 1 native 登录/优雅失败）
```

### 2.2 重启自愈流（D3）

```
daemon 进程重启（worker 已存在 + <worker-home>/access-token 在）
  │ resolveSingleActiveWorker() → kind==='single'
  │ maybeProvisionCheckIn(): 读 <worker-home>/access-token → 跳过 check-in
  │ connectWorkerAccessTunnel(access=持久token) → 重连（无需 re-provision）
  ▼ 自愈成功
异常分支（D5 冲突矩阵）：token-file 在但 Host 侧 assignment 已撤销
  │ tunnel hello 被 Host 拒（verifyAssignmentAccessToken 失败）
  └─ 诚实降级：清本地 token-file + emit 可操作「需重新 provision」提示，**非静默死重连循环**
```

### 2.3 三源 restart-state 权威矩阵（D5，Architect Rec.2）

| worker.db active? | token-file? | provision env? | 行为 |
|---|---|---|---|
| 有 | 有 | 任意 | 重启自愈：读 token 重连，跳过 check-in（§2.2） |
| 有 | 无 | 有 | daemon 首启带 env：check-in + 持久化 token（D6） |
| 有 | 无 | 无 | 既有 worker 无 provision 背景：正常本地运行，不连 tunnel |
| 无 | 任意 | 有 | first-provision 引导（§2.1）；token-file 若残留先清（无 worker 的 token 无意义） |
| 无 | 任意 | 无 | 纯本地裸 daemon：无操作（现状） |

**两个运行时失败分支（非独立输入态，Architect 澄清）：**
- **撤销冲突**（= row1「有/有」的运行时失败分支）：token 重连被 Host 拒（`verifyAssignmentAccessToken` 失败）→ 清 token + 诚实「需重新 provision」提示（§2.2），非静默死循环。
- **消费 token 部分失败恢复（Architect must，新增）**：row2/row4 的 check-in 假设成功，但 provision token 单次消费——若 check-in 消费 token 后、持久化 token-file（D3 step4）或 `createSoulWorker` 提交**前**进程崩溃，下次 boot 落 row2/row4 却持已消费 token → re-check-in 401 → 死 daemon、无降级。**修法**：把 §2.2 的诚实降级扩展到「consumed-token 401」——检测到 401 即清 env 驱动状态 + emit 可操作「provision 已中断，需重新 provision」，绝非静默死 daemon。

### 2.4 secret 边界（D3 新边界 + Architect Rec.1）
- 持久 access token 是 **capability token**（非 provider secret）：授权本 worker 重连自己的 tunnel，不授 LLM 访问。爆炸半径 = 冒充一个已 provision 的 worker 重连，受 access token TTL（host.db 24h）+ 可撤销约束。
- **结构化脱敏**（非通用正则）：access token 无前缀、engine-bridge 共享 `SECRET_FORMAT_ALTERNATION`（provider-shaped）**抓不住它**。须：(a) 给持久 token 打可识别 tag/前缀，或 (b) 在已知字段做结构化 redaction；并把 `<worker-home>/access-token` 路径纳入 e2e 哨兵扫描。
- 落盘 `0o600` + chmod 兜底（Windows 无效需注记）；descriptor.json 不含 secret（publish 时 `assertNoLiteralSecrets` 已守）。

---

## 3. 分步实现（每步独立可验、独立 PR；canon 与对应步同 PR）

### P2-Step1 —— 协议 + Host：check-in 内嵌 descriptor + worker_id 守卫
- **canon 先行**：`docs/protocol.md` 给 `workerAssignmentReceiptSchema` 加 `soulDescriptor`（不透明字符串 = descriptorJson）字段语义 + secret 边界（descriptor opaque、不解析领域字段）。
- **协议**：`worker-control-protocol/src/index.ts:50-55` 加 `soulDescriptor: z.string().min(1).optional()`（`.strict()` 下显式声明；optional 兼容旧 host，不 bump 版本）。
- **Host 填充**：`host-server.ts:777-789` handleCheckIn 按 `checkedIn.soulReleaseRef` 调 `getSoulRelease(releaseRef)`（storage host/index.ts:518）取 `descriptorJson` 填进 `assignment.soulDescriptor`；ref 无对应 release → 诚实 4xx（不静默空 soul）。**descriptor-only**：Host 不解析领域字段。
- **worker_id 守卫（D4）**：`handleCheckIn` 包 `markAssignmentCheckedIn` —— 同 worker_id 再 check-in 幂等返回既有 receipt（同 assignment）/ 诚实 4xx（异 assignment 抢占），**绝不 500**。可在 storage 层加「按 worker_id 查既有 checked_in assignment」前置判定。
- **验证**：worker-control-protocol 契约（receipt 带/不带 soulDescriptor 往返 + `.strict()` 兼容）；host check-in 单测（按 ref 取 descriptor、缺失诚实失败、同 worker_id 幂等/拒绝不 500）。

### P2-Step2 —— worker：first-provision 引导（破 C2 循环依赖）
- **provision CLI（D2）**：`aiworker.ts provisionCommand` 重构——`daemonForeground` 前先：(a) HTTP check-in 到 Host；(b) 写 `<worker-home>/soul.descriptor.json` + `installAppFromPath`（**descriptor-path**，§0-D 关键）；(c) **`enableApp(soulId)`**（Architect 坐实的 must-fix 桥接，见下）；(d) `createSoulWorker({appId: soulId, workerId})` 绑定；(e) 持久化 access token（→ P2-Step3）。
  - **catalog-availability 桥接 = `enableApp`（已坐实，非「待核实」）**：`installAppFromPath` 落 soul_app 状态 `'installed'`（registry.ts:70），但 `requireAvailableSoul` 要 `findCatalogSoul(id).status==='available'`，而 `projectedSoul.status==='available'` **当且仅当**行 `'enabled'`（soul-descriptor registry.ts:100，`'installed'`→投影 `'coming_soon'`）；且 `engineAssetSourceForWorker` 也要 `enabled`+`descriptor-path`（orchestrator:236）。**漏 `enableApp` → `createSoulWorker` 抛 `SOUL_NOT_AVAILABLE`、引擎资产返 null**。故 install 与 create 之间**必须**显式 `enableApp(soulId)`。
- **D2 双 init 诚实说明（纠正 §0-A/R1 前提）**：`createSoulWorker` **确实**调 `createRuntimeForWorker`+`runtime.init()`（orchestrator:198-199）→ `repairWorkspaceLayouts`（即 PROJ-1 面），且首次 provision 在 CLI 与 daemon boot 各跑一次（双 init）。**安全成立但理由是幂等而非「不碰」**：CLI 的 init 跑在零 workspace 的新 worker 上 = repair no-op；daemon boot 的 init 与普通重启同构，PROJ-1 已硬化为重启安全幂等。实现裁决：daemon bootstrap 对「刚由 CLI 建好的 worker」可跳过 re-init，或接受幂等双 init（须显式记为有意 no-op，不再声称「不碰 runtime.init」）。
- **幂等**：provision 命令重跑（worker 已建）→ 不重复 check-in（token 已消费），走重启自愈路径（D5 矩阵「有 worker」行）。
- **验证**：provision 集成测试（注 fake Host）——fresh-box 无预存 worker → check-in → 装 descriptor → 建并绑 worker → daemon 起后 `kind==='single'`；descriptor-path 注入 engine 资产断言（非 inline）；幂等重跑不双 check-in。

### P2-Step3 —— 重启自愈：持久 access token + 重连免 check-in + 撤销冲突
- **持久 token（D3）**：新建 `<worker-home>/access-token` 读写模块——`writeFile(path, token, {mode:0o600})` + chmod 兜底；boot 读回。**结构化脱敏**（§2.4，Architect Rec.1）：打 tag/前缀或字段级 redaction，纳入诊断/log 脱敏。
- **daemon check-in 统一（D6）**：`maybeProvisionCheckIn` 改——持久 token 在 → 读回跳过 check-in；否则 env+token 在 → check-in + 持久化。
- **重连免 check-in（D5）**：`connectWorkerAccessTunnel` 用持久 token；重启后 boot → 读 token → 连 tunnel，无 re-provision。
- **撤销冲突（D5 矩阵末行）**：tunnel hello 被 Host 拒（access token 失效）→ 清本地 token-file + emit 可操作「需重新 provision」提示，**非静默死重连循环**。
- **验证**：单测（token 0600 读写 + 脱敏）；集成（重启读回重连免 check-in；token 在但 Host 撤销 → 清 + 诚实提示，不死循环）。

### P2-Step4 —— canon 叙事 + Phase 2 独立 e2e gate
- **canon**：`docs/runtime.md`（first-provision 引导 + 重启自愈 + 持久 token 边界）、`docs/architecture.md`（真分发数据流补 descriptor 下发段）。
- **e2e（进 Phase 2 独立门，不焊 v1 release:check）**：真 Host + 真 `aiworker provision`（fake/真 soul release）→ 断言 descriptor 真到 worker + worker 绑定 + tunnel ready；**真 daemon 重启后自动重连、无需 re-provision**；扫 `<worker-home>/access-token` 外的 log/DB 无 token 哨兵子串（token-file 本身 0600 单列）。

---

## 4. Pre-mortem（6 场景）

1. **inline 安装丢 engine 资产**：下发若误走 inline → `engineAssetSourceForWorker` 返 null（§0-D）→ worker 装了 soul 但引擎资产缺失、跑不动。缓解：P2-Step2 强制 descriptor-path + 断言 engine 资产注入。
2. **持久 token 泄进 log**：无前缀 token 共享正则抓不住。缓解：§2.4 结构化脱敏 TDD 先写 + e2e 哨兵扫描 token-file 外全路径。
3. **撤销后死重连循环**：token-file 在但 Host 撤销 → 当前重连循环会无限退避重试。缓解：D5 末行——hello 被拒即清 token + 诚实提示停循环。
4. **first-provision 与 daemon check-in 双消费**：CLI check-in 消费 token 后 daemon 又 check-in → 第二次 401。缓解：D6 统一——持久 token 在则 daemon 跳过 check-in。
5. **catalog availability 断层（已坐实）**：`installAppFromPath` 落 `'installed'`，但 `requireAvailableSoul` 要 `'available'`（须 `'enabled'`）→ **漏 `enableApp` 必抛 `SOUL_NOT_AVAILABLE` + 引擎资产 null**。缓解：P2-Step2 显式 `enableApp(soulId)`；集成断言 `engineAssetSourceForWorker` 非 null（同时证 enabled + descriptor-path，捕两种失败）。
6. **worker_id UNIQUE 仍 500**：D4 守卫漏某路径（如 storage 层直抛）。缓解：契约测试断言同 worker_id 再 check-in 返幂等/4xx、grep 确认无未 catch 的 markAssignmentCheckedIn 调用。
7. **双 init 触 PROJ-1 自锁回归（Critic 补）**：CLI 建 worker 的 init + daemon boot 的 init 都跑 `repairWorkspaceLayouts`，正撞 `fix/proj1-restart-lock` 稳定的重启面。缓解：P2-Step2 的 init 裁决（daemon 对刚建 worker 跳过 re-init **或** 接受幂等双 init 作有意 no-op）**须用测试钉死**——集成断言双 init 后无 `PROJECTION_RECEIPT_STALE` 自锁回归，不留作纯「实现裁决」。

---

## 5. 扩展测试计划

| 层 | 覆盖 | 注入/隔离 |
|---|---|---|
| **unit** | 持久 token 0600 读写 + 结构化脱敏；worker_id 守卫幂等/拒绝；descriptor 落盘 + descriptor-path 安装 | 全注 fake，不真 spawn |
| **contract** | receipt 带/不带 soulDescriptor 往返 + `.strict()` 兼容；同 worker_id check-in 不 500 | worker-control-protocol |
| **integration** | first-provision fresh-box 全链（check-in→装→建绑 worker→tunnel）；重启读回重连免 check-in；撤销冲突清 token+诚实提示；幂等重跑不双 check-in | in-proc fake Host |
| **e2e（Phase 2 独立门）** | 真 Host + 真 provision + 真 descriptor 下发 + **真 daemon 重启自愈** + token-file 外零哨兵 | 真 Host/worker 进程 |
| **observability** | 撤销/重连失败诚实告警；deliveryStatus（Phase1）联动 | —— |

---

## 6. ADR

- **Decision**：check-in 内嵌 descriptorJson 下发（descriptor-path 安装）；provision CLI 做 first-provision 引导（check-in→装→建绑 worker→持久 token→起 daemon）破 C2；持久 access token（0600 新边界 + 结构化脱敏）+ daemon check-in 统一（持久 token 在则跳过）实现重启自愈；worker_id 守卫不 500；三源权威 worker.db>token-file>env。
- **Drivers**：无头非技术员工零交互 + 重启自愈；secret 边界（新增 0600 capability token）；不撞 PROJ-1（D2 触 runtime.init 但幂等/重启安全，不改 repairWorkspaceLayouts）。
- **Alternatives considered**：descriptor 走 inline（淘汰：丢 engine 资产）；first-provision 改 bootstrap gating（淘汰：撞单-active 不变量，provision CLI 引导更隔离）；token 存 worker.db（淘汰：DB 无法 0600）；独立 descriptor endpoint（留 soul 热更新演进）。
- **Why chosen**：把一次性（descriptor）与可重连（token）分别落在契合的载体；CLI 引导隔离首次复杂度、daemon boot 只读持久状态；新 secret 边界用独立 0600 文件 + 结构化脱敏明确围栏。
- **Consequences**：worker-home 新增 `soul.descriptor.json` + `access-token`（0600）两文件；首个仓内 0600 先例（须立 chmod/redaction 范式）；provision CLI 变重（从「设 env 起 daemon」变「引导 + 起 daemon」）；descriptor-path 依赖须保 catalog availability 桥接。
- **Follow-ups**：Phase 3 LLM 凭证注入（复用本期持久 token 通道 + access-token 鉴权帧，含 WAT-1 前置）；soul 热更新走独立 endpoint；appId-immutable 显式断言（若需）。

---

## 7. 风险与协调

- **R1 PROJ-1 边界（已纠正）**：本期 D2 的 `createSoulWorker` **确实调** `runtime.init()`（→`repairWorkspaceLayouts`，PROJ-1 面），且 CLI + daemon boot 双 init——安全成立的理由是**幂等/重启安全**（首次 provision repair 跑零 workspace = no-op；daemon init 与普通重启同构，PROJ-1 已硬化），**非「不碰」**。本期不修改 `repairWorkspaceLayouts` 本身。
- **R2 单-active 不变量**：first-provision 走 `createSoulWorker`（含 createWorkerLock + C2 检查），不绕锁、不加 DB unique index（product-bet #1 铁律）。
- **R3 新 0600 secret 边界**：无先例，须立范式（写入 mode + chmod 兜底 + 结构化脱敏 + e2e 哨兵），Architect Rec.1 must。
- **R4 catalog availability 派生**：P2-Step2 须先核实 `requireAvailableSoul` 与 `installSoulDescriptor` 的 available/installed 等价性（§0-D / pre-mortem 5），不确定则补桥接步。
- **R5 并发共享树**：实现前重核 git status，不 stage/revert 他人改动。

---

## 8. 验收标准（可测、可证伪）

1. 裸机 `aiworker provision --host --token`（无预存 worker）→ 自动拿 Host descriptor、descriptor-path 安装、`createSoulWorker` 绑定、daemon 起后 `kind==='single'` + tunnel ready；引擎资产经 descriptor-path 注入（非 inline 丢失）。
2. **daemon 重启后自动重连、无需 re-provision**（读持久 0600 token，跳过 check-in）。
3. 同 worker_id 再 check-in/再投递 → 幂等返回或诚实 4xx，**绝不 500**。
4. token-file 在但 Host 撤销 → 清 token + 诚实「需重新 provision」提示，**非静默死循环**。
4b. provision 在 check-in 消费 token 后、持久化/建 worker 前中断 → 下次 boot 检测 consumed-token 401 → 诚实「需重新 provision」提示，**非静默死 daemon**（Architect must）。
5. 持久 token 落盘 `0o600`；e2e 扫 token-file 外所有 log/DB/diagnostic：token 哨兵**零出现**。
6. canon（protocol↔Step1 / runtime+architecture↔Step4）与对应步同 PR。
7. Phase 2 测试在独立门通过，未焊 v1 release:check。

---

## 9. 执行前置

- 本计划经 Architect/Critic 共识后（**Architect SOUND-WITH-CONCERNS→concern 已并入 / Critic APPROVE**）→ 各 Step 可拆独立 PR 交 team/ralph 执行。
- **执行者 open question（Critic，非阻塞但须落实）**：(i) e2e soul-release 用真发布 vs fixture descriptor 须钉死，gate 才确定性；(ii) AC#5 哨兵扫描排除 token-file，但须额外断言 token-file 自身 0600 **且无其他路径**（diagnostic dump / support bundle / `doctor --probe`）读出并回显其内容；(iii) §0 路径/行号以执行时 re-anchor 为准（如 createSoulWorker init 实为 orchestrator:197-198）；(iv) Windows 0600 no-op——若无头 Windows worker 在 v1 分发范围内须补 ACL fallback，否则显式声明 Windows out-of-scope。
- **Phase 3（LLM 凭证注入）不在本轮**——复用本期持久 token 通道 + access-token 鉴权帧，另开聚焦轮（含 WAT-1 前置、broker org-key 适配器、EngineCredentialProvider DI、注入脱敏）。
