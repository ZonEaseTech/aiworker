# 切片 2 实现计划 —— Host 真分发（真投递 + soul 真下发 + LLM 受限 token 注入）

- 日期：2026-06-11
- 状态：**pending approval**（ralplan 共识计划，iteration 2，未执行）
- 父蓝图：`docs/superpowers/specs/2026-06-10-aiworker-onboarding-chain-design.md` §6
- 阶段：Phase 2（切片 1 已在 main `b6d49347` / PR #24 完成并发 rc.11）
- 范围裁决：用户 2026-06-11 选「只做切片 2」（不含切片 3 自建网关）
- 评审：iteration 1 Architect = SOUND-WITH-CONCERNS / Critic = ITERATE → 修订；**iteration 2 Architect = SOUND / Critic = APPROVE（consensus 达成，无剩余 must-fix）**。

> **范围诚实声明（评审强制）**：切片 2 经两轮评审证实**不是一个 PR，而是 1 个可立即执行的干净 PR + 2 个需各自聚焦执行轮的设计-构建工程**。本计划据此显式三段拆分，并标出每段的 MVP 边界与执行前置。**只有 Phase 1 是「批准即可执行」**；Phase 2/3 已设计定型，但执行前各需一轮聚焦实现规划（因其改动 protocol/token 模型并撞 PROJ-1 重启面）。

---

## 0. 侦察基线（已勘验，commit `b68c859d`/main；含两轮评审的精确化修正）

**已就绪可复用（连接 spine 全真）：**
- assignment 创建 → provision token 一次性消费 → check-in → access token 签发 → WS 反向隧道（含 socket 级指数退避重连 + 半开探测，tunnel-restart-resilience）。
- Host 已持久化 soul release 全文：`host_soul_releases.descriptor_json`（#23 `cba697f0`），publish 时 `assertNoLiteralSecrets` 守卫；DB 层 `getSoulRelease(releaseRef)` 已存（host-server 未调）。

**三处缺口（= 本切片工作面）+ 评审精确化：**
1. **投递只记账不诚实**：`apps/host-cli/src/provisioning-target-adapters.ts:27,65` `deliveryStatus` 硬编码字面量 `'delivered'`，纯拼命令串无真执行（false-green）。
2. **soul 下发链路断裂**：`apps/host-cli/src/host-server.ts:681-691` `toSoulReleaseView()` 剥掉 descriptorJson；无 endpoint 暴露全文；worker 侧 `soulReleaseRef` 进了 check-in receipt（`packages/worker-control-protocol/src/index.ts:50-55`）但从不被消费；worker 永远用本地 bundle descriptor。
3. **LLM 注入不存在**：`packages/worker-runtime/src/worker/executor.ts:272-275`（注意：在 **worker-runtime**，非 worker-daemon）native 引擎 env = `sanitizeEngineEnv() + engine.env` 纯透传。`packages/worker-runtime/src/worker/engine-env.ts:3-13` 的 `sanitizeEngineEnv` 会**剥掉 `AIWORKER_`/`WORKER_`/`OD_` 前缀的所有变量** → 注入的 `ANTHROPIC_*`/`OPENAI_*` 因无此前缀可存活，但注入必须作为 `engine.env` 之后的**第三层 merge**，且载体变量名不得用被剥前缀。

**评审修正的两处分析错误（本版已纠正）：**
- **M2**：`resolveApiKey`（`executor.ts:543-553`）服务的是 **BYOK 模式**（`apiKeyRef`，executor.ts:360），只认 `env:NAME`/裸名，**不在 C-opt1 注入路径上**。修它的前缀 bug 对凭证注入毫无作用——两件事必须分开。
- **M3**：`gatewayProfileRef` **不是「无消费方的孤儿」**——其校验 schema `parseWorkerAssignmentEnvelope` 在 `worker.ts:262` 已被消费。真实缺口是：(a) `host_assignments` 表**无对应列**（`storage-sqlite/src/host/schema.ts:5-33` 只有 `metadataJson`）；(b) 它在 **assignment envelope**（protocol:35-43）而非 **check-in receipt**（protocol:50-55）；(c) 其 `refine()` 要求 `env:/secretref:/$`，裸 profile 名如 `"litellm-prod"` 校验失败。

---

## 1. RALPLAN-DR 决策摘要

### 1.1 原则（Principles）
1. **诚实优先于绿灯**：投递状态、soul 下发、凭证就绪、**重启后是否仍能跑**都不得谎报。
2. **descriptor-only 边界**：Host 把 descriptorJson 当不透明字符串存/取/下发，绝不解析领域字段。
3. **master key 永不离开供给侧；worker 只持受限/可撤销凭证**；AIWorker 自有 DB/log/receipt/diagnostic/descriptor 绝不落 secret 真值（native CLI 自身凭证落盘是引擎关注点）。
4. **复用已认证通道，但区分凭证的「生命周期」**：descriptor 是一次性安装（搭一次性 check-in），**凭证是可续租约（必须搭可重放的 access-token 通道，绝不搭一次性 provision-token check-in）**——这是 Architect 的核心 synthesis，纠正了 iteration 1「全搭 check-in」的原则冲突。
5. **不自建网关，且不预建网关适配器**：切片 2 只发 `org-key` 适配器；保留 broker **接口** 作切片 3 接缝，但 LiteLLM `/key/generate` 实现**推迟到切片 3**（Critic：建在切片 2 = 越审计「冻结 Phase 2」线）。

### 1.2 决策驱动（top 3）
1. **Secret 爆炸半径**：凭证流转路径最易把 secret 带进 log/diagnostic/DB。
2. **分发 worker = 无头 + 非技术员工 + 会重启**：必须零交互拿到 soul + 凭证，**且重启后自愈**（非技术员工不会 re-provision）。
3. **审计「冻结 Phase 2 抛光」+ PROJ-1 重启面**：取低风险解、砍网关镀金；凡触 restart/token 模型的改动与当前 `fix/proj1-restart-lock` 协调。

### 1.3 可行选项（每子目标 ≥2，附就地失效理由）

**A 真投递落点：**
- **A-opt1（选）自包含命令 + 诚实状态**：`deliveryStatus ∈ {command_generated, executed, failed}`；local/docker `--execute` 可选真 spawn，aissh 永远命令串（运营者执行）。✅ 低风险、对齐「一条命令=开箱即用」、不踩脆弱远程执行。
- A-opt2 Host 全自动远程执行 aissh：❌ 远程执行脆弱（记忆 `rc11-deploy-aissh-fix`：aissh upload 失败、host 仅 bun）+ 踩审计镀金。降级为 local/docker 可选、aissh 不自动。

**B soul descriptor 下发：**
- **B-opt1（选）check-in 响应内嵌 descriptorJson**：descriptor 是**一次性安装**，正好契合一次性 check-in 通道。✅ 零新 endpoint、最少 wire。
- B-opt2 独立 access-token 鉴权 descriptor endpoint：✅ 支持 soul 热更新重拉。→ 留作热更新需求出现时的演进。

**C 凭证投递+续期（拆分，Architect synthesis）：**
- **C-opt1（选）投递与续期分离**：*初始*凭证可搭 check-in 响应（首回合零延迟）；*续期与重启后重获*走 **access-token 鉴权通道**（隧道新帧 `credential_acquire`/`credential_refresh`，复用持久 access token），凭证仅内存持有。✅ 既复用已认证通道，又给凭证真正的可续租约——解决 C1。
- C-opt1-naive（iteration 1 原案，淘汰）：凭证全搭一次性 check-in。❌ check-in 消费 provision token 单次、隧道重连只重放 access token 从不 re-check-in（`provision-client.ts:331-337`）→ 短 TTL 凭证**无续期路径**、重启即死。
- C-opt2 provision 命令 env 注入凭证：❌ secret 进命令串/`ps`/history（违 secret-guard）。**但承认其唯一优点 = 持久化跨重启存活**——本计划用「access-token 通道重启后重获」替代该优点，而非否认它（Critic skeptic 视角）。
- C-opt3 worker 各自 OAuth：❌ §4 已证 B2B 非技术不可行。

---

## 2. 架构设计（修订版，含凭证生命周期 + first-provision 引导）

### 2.1 数据/控制流

```
运营者 assign ─► createAssignment(soulReleaseRef, gatewayProfileRef@metadataJson)
                   └─ deliverProvisioningTarget() ─► 自包含命令 + 诚实 deliveryStatus

员工裸机 `aiworker provision --host --token`   ← 新：first-provision 引导入口(Phase 2)
  ├─[首次] check-in(消费 provision token, TLS)
  │        ◄── { accessToken, soulReleaseRef, soulDescriptor }   ← 新：descriptor 内嵌(B)
  │        ├─ installAppDescriptor(soulDescriptor) + 创建并绑定本地 worker  ← 破循环依赖(C2)
  │        └─ 持久化 access token 到 worker-home(0600, capability token)  ← 新：重启可重连(C1 前置)
  ├─[重启] worker 已存在 + provision env 仍在 + token 已消费
  │        └─ 跳过 check-in、复用已绑 worker、用持久 access token 重连隧道  ← restart 幂等分支(撞 PROJ-1)
  └─ 建反向隧道(已存在) ─► hello(access token)
        └─ credential_acquire 帧 ─► Host broker.mint() ─► { engineKind, baseUrl, token, expiresAt }  ← 凭证走 access-token 通道(C)
           worker 内存持有 → 近过期发 credential_refresh → 重连(含重启后)重发 acquire

session 首回合 → worker-runtime executor spawn:
  env = sanitizeEngineEnv() + engine.env + EngineCredentialProvider.get(engineKind)   ← 第三层 merge(M2 dataflow)
       claude: ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN
       codex:  OPENAI_BASE_URL + OPENAI_API_KEY (需先处理其 OAuth 偏好)
       cursor-agent: 不在注入名单(§4)
```

### 2.2 凭证跨模块边界数据流（M2，iteration 1 完全缺失）
- 定义 `EngineCredentialProvider` 接口（落 worker-runtime 或共享包），**作 executor options 注入**（与现有 `processManager` 同模式，DI 缝，可注 fake）。
- `worker-daemon` 的 provision-client 经 access-token 通道 acquire/refresh 到凭证后，写入该 provider 的内存槽。
- `worker-runtime` 的 executor 在 spawn 时 `provider.get(engineKind)`，作 `engine.env` **之后**的第三层 merge（载体变量不用被 `sanitizeEngineEnv` 剥的前缀）。
- 无凭证时 provider 返回空 → 回落切片 1 的「auth-aware 优雅失败」引导（诚实降级，非崩溃）。

### 2.3 secret 边界全景（横切）
- 派生 token 流转：Host 内存 ← broker ← org-key secret-ref；→ TLS（check-in 响应 / `credential_acquire` 帧）→ worker 内存 → 引擎 env。
- **绝不经过**：descriptor、host.db、worker.db、receipt、log/diagnostic、OpenAPI 示例、UI。
- 持久化 access token（capability token，非 provider secret）写 worker-home `0600`，不入 worker.db 明文。**脱敏须结构化字段级（或给 token 打 tag/前缀）**——access token 是无前缀不透明随机串，engine-bridge 共享 `SECRET_FORMAT_ALTERNATION` 是 provider-shaped 正则、**抓不住它**；不得只声明「纳入脱敏」而靠通用正则（Architect Rec.1，P2 轮落实）。
- 复用 engine-bridge 共享 `SECRET_FORMAT_ALTERNATION`（`engine-bridge/src/index.ts:54`）做新路径脱敏，**不新增第 10 个正则**。

---

## 3. 分阶段实现（每段独立可验、独立 PR；只有 Phase 1 批准即可执行）

### ✅ Phase 1 —— 诚实投递 + 两个独立正确性修复【批准即可执行，MVP】
独立、低风险、零 secret、零 protocol 改动，立即可发。

- **P1-T1 诚实 deliveryStatus**（✅ 已实现 2026-06-11）：`deliveryStatus` 类型改 `'command_generated' | 'executed' | 'failed'`，当前恒产出 `command_generated`（Host 只生成投递命令、不真执行）；host-server assignment 响应自动透传（host-server.ts:662）；host-web 类型 widening；operatorHint 诚实化（命令须由运营者执行）。
  - **实现裁决：`--execute` 真 spawn 推迟 Phase 2。** 理由（诚实原则）：在 Phase 2 first-provision 引导落地前，执行当前 provision 命令只会起空 daemon（C2 循环依赖，worker 不会真 bootstrap），此时标 `executed` 本身就是新 false-green。故 `executed`/`failed` 作类型保留位，待 Phase 2 命令真能产出可跑 worker 时再产出。
- **P1-T2a（独立修）`resolveApiKey` 前缀一致性**：接受协议允许的 `secretref:`/`$`（消除 validator/resolver 发散）。**与凭证注入无关**（M2），纯 BYOK 正确性。
- **P1-T2b（铺路）secret 正则不发散承诺**：枚举当前 7-9 处声明点（nice-to-have：`storage-sqlite/{worker,host}/index.ts`、`engine-projection/.../workspace-projection.ts`、`engine-bridge/src/index.ts`、`worker-daemon/.../error-handler.ts`、`worker-daemon/.../settings.ts`、`soul-sdk/src/index.ts`、`host-lifecycle.ts:627`、`worker.ts:1373`），保证 Phase 3 新路径复用 engine-bridge 共享源、**不新增第 10 个**。
- **canon**：本段无 protocol 改动；testing.md 标 deliveryStatus 三态 forcing function。
- **验证**：host-cli adapter 单测（三态）、resolveApiKey 前缀单测、`bun run --filter '@zonease/aiworker-host-cli' test`。

### ⏸ Phase 2 —— soul 真下发 + first-provision 引导 + 重启自愈【设计定型，执行前需聚焦规划】
本段是 Critic 指出的「被低估的主工作量」，改动 daemon bootstrap + 撞 PROJ-1 重启面，须与 `fix/proj1-restart-lock` 协调。

- **P2-T1 Host check-in 内嵌 descriptor**（canon 先行）：先改 `docs/protocol.md` 给 `workerAssignmentReceiptSchema` 加 `soulDescriptor`（不透明字符串）字段语义；再 check-in handler 按 `soulReleaseRef` 调 `getSoulRelease` 把 descriptorJson 放进响应；descriptor-only：Host 读路径不解析领域字段（仅协议层 identity 读允许）；ref 无对应 release → 诚实 4xx，不静默空 soul。
- **P2-T2 first-provision 引导破循环依赖（C2）**：新增**先于 `activeResolution.kind==='single'`** 的 provision-bootstrap 入口——`aiworker provision` 用 token 驱动一次 check-in（无需预存 worker）→ 收 descriptor → `installAppDescriptor` → 创建并绑定 worker → 转入正常 single-active 路径。worker 绑定 soul「终生不变」(AGENTS.md)，soul = Host descriptor，不走本地 `--app` 选择器。
- **P2-T3 重启幂等分支 + worker 侧 access token 持久化（C1 前置 / PROJ-1 协调）**：restart 时（worker 已存在 + provision env 仍在 + provision token 已消费）→ 跳过 check-in、复用已绑 worker、用**持久化的 access token** 重连隧道。这正是 tunnel-restart 当年 defer 的「worker 自身重启 re-check-in」Layer 2，须与 PROJ-1 一并设计。
- **P2-T4 re-provision / worker_id-UNIQUE 守卫**：`host_assignments_worker_id_unique_idx`（`storage-sqlite/src/host/index.ts:86`）使「为已存在 worker_id 再建 assignment」撞 500（= rc.11 记忆里的冲突）。决策：要么提供幂等 re-provision 解绑/复位路径，要么 `revoke`+重发明确 not-supported 诚实报错——不得 500。
- **P2-T5 权威 restart-state 源（Architect Rec.2）**：持久 token-file 会成为 restart 状态的**第三个真源**（与 PROJ-1 的 DB active-worker + lock 并存），三源是 stale-state bug 温床。P2 轮须定义三方冲突时谁权威，并加 AC：**「token-file 在但 Host 侧 assignment 已撤销」→ 干净 re-provision 提示，绝非静默死重连循环**。
- **canon**：protocol.md（receipt + soulDescriptor）与本段**同 PR 合并**（M4，纠正 iteration 1 把 canon 全堆 Phase 4）。
- **验证**：worker-control-protocol 契约（receipt 带 soulDescriptor 往返 + 大/非法 descriptor 用例）；host check-in 单测（按 ref 取、缺失诚实失败）；**provision 集成测试：fresh-box 引导 + restart 复用 + re-provision 守卫**（注入 fake host）。

### ⏸ Phase 3 —— LLM 受限 token 注入（仅 org-key 适配器）【设计定型，执行前需聚焦规划，安全核心】
- **P3-T1 broker 接口 + 仅 org-key 适配器**：定义 `EngineCredentialBroker { mint(assignment), revoke(handle) }`。**只实现 `org-key`**（从 Host secret-ref 解析一把 org key + baseUrl；`revoke()` 显式返回 **not-supported**，绝不假成功——文档/receipt/UI 标「无 per-worker 撤销，撤销需轮换 org key 影响全员」deviation）。LiteLLM `external-gateway` 适配器仅留**接口接缝**，`/key/generate`+`/key/block` 实现**推迟切片 3**。
- **P3-T2 gatewayProfileRef schema 决策（M3）**：(a) 迁移决策——存 `host_assignments.metadataJson` vs 新列；(b) ref 形态决策——profile 选择器用裸名需独立字段 or 放宽 refine（现 refine 只容 `env:/secretref:/$`）。接通到 broker profile 选择。
- **P3-T3 凭证走 access-token 通道注入引擎 env（C-opt1 + M2 dataflow）**：隧道加 `credential_acquire`/`credential_refresh` 帧（access token 鉴权）；Host 经 broker.mint 返回凭证；worker 写 `EngineCredentialProvider`；executor 第三层 merge 注入（claude `ANTHROPIC_*` / codex `OPENAI_*`，codex 处理 OAuth 偏好；cursor-agent 剔除）。重连（含重启后）重发 acquire = 凭证恢复路径。**WAT-1 依赖（Architect Rec.3）**：`credential_acquire`/`credential_refresh` 帧必须经受 WAT-1（隧道帧 SSE/二进制损坏 high）最终修复——P3 设计须把帧 round-trip 完整性与 WAT-1 修复对齐，勿在坏帧协议上叠新帧。
- **P3-T4 撤销 + secret-guard 测试（R4）**：org-key revoke not-supported 诚实化；全注入路径脱敏契约测试——裸 token/`Authorization: Bearer`/`api_key=`（含包在 `{data}/{text}` 自由文本）在 DB 写/log/diagnostic/响应日志被脱敏，复用共享正则。
- **canon**：runtime.md（注入落点 + 按引擎表 + cursor-agent 剔除）与本段同 PR 合并。
- **验证**：broker 单测（注 fake，不真调网关）；注入路径脱敏契约测试；engine env 注入单测（注 fake credential，断言 env 含变量且不落 log）；provider DI fake。

### Phase 4 —— 收尾 canon 叙事 + Phase 2 独立 e2e gate
- **P4-T1 canon 叙事**：architecture.md（真分发数据流 + 切片 2/3 成熟度边界）、testing.md（切片 2 forcing functions）、product-baseline（分发场景 soul/凭证下发）。
- **P4-T2 真 provision e2e gate（§8，进 Phase 2 独立门，不焊 v1 release:check）**：真 Host stop/restart + 真 provision + 真 soul 下发 + 真 env 注入（fake broker，不烧真额度）；断言 descriptor 真到达、env 真含注入变量、**重启后再跑一回合仍成功**、**全 log/DB 扫描无 token 哨兵子串**。

---

## 4. Pre-mortem（deliberate 模式，6 场景；新增 3 个评审指出的最高实际风险）

**场景 1（新增·最高危）—— first-provision 循环依赖未破，provision 出空 daemon。** check-in 被 `kind==='single'` 门控，裸机无 worker→check-in 不触发→空 daemon。信号：无「fresh-box 无预存 worker」集成用例。缓解：P2-T2 专门 bootstrap 入口先于 single-active；集成测试覆盖 fresh-box。

**场景 2（新增·最高危）—— 凭证重启丢失无恢复。** 凭证仅内存，daemon 重启即丢；re-provision 撞 worker_id UNIQUE 500。信号：测试只跑一次 fresh provision。缓解：C-opt1 续期/重连走 access-token 通道 + P2-T3 持久 access token 重启重连 + P2-T4 UNIQUE 守卫；AC 加「重启后再跑一回合」。

**场景 3（新增）—— re-provision 换 soul / worker_id 冲突行为未定义。** worker soul「终生不变」，但 re-provision 带 soulReleaseRef，若与已绑不同（或相同但撞 UNIQUE）行为未定义。缓解：P2-T4 明确——同 soul 幂等复用、异 soul 拒绝（终生不变）、绝不 500。

**场景 4 —— 派生 token 泄进 log/diagnostic（高危）。** 缓解：P3-T4 脱敏测试 **TDD 先于** 注入实现；新路径强制共享正则；e2e 用哨兵 token grep 全 log/DB。

**场景 5 —— descriptor 撑爆 check-in 响应 / 解析失败炸 provision。** 缓解：解析失败诚实可操作错误（不静默空 soul）；设响应体大小阈值；超阈退 B-opt2 独立 endpoint；契约测大/非法 descriptor。

**场景 6 —— org-key deviation 被当可撤销给假安全感。** 缓解：org-key `revoke()` 显式 not-supported；receipt/文档/UI 标局限；真撤销=external-gateway/切片 3。

---

## 5. 扩展测试计划（deliberate 模式）

| 层 | 覆盖 | 注入/隔离 |
|---|---|---|
| **unit** | deliveryStatus 三态；resolveApiKey 前缀；broker mint/revoke(org-key not-supported)；按引擎 env 注入映射；EngineCredentialProvider DI；descriptor 解析失败 | 全注 fake（不真 spawn/不真调网关/不真读凭证） |
| **contract** | receipt 带 soulDescriptor 往返(+大/非法)；gatewayProfileRef ref 形态校验；**注入路径脱敏**（裸 token/Bearer/api_key= 含自由文本，DB/log/diagnostic/响应日志） | worker-control-protocol + 共享正则 |
| **integration** | provision fresh-box 引导→installAppDescriptor→绑 worker；**restart 复用 + access token 重连**；re-provision worker_id 守卫；凭证 acquire/refresh over access-token 通道 | in-proc fake Host + fake broker |
| **e2e（Phase 2 独立门）** | 真 Host stop/restart + 真 provision + 真 soul 下发 + 真 env 注入 + **重启后再跑一回合成功** + 哨兵 token 全 log/DB 扫描零命中 | fake broker（不烧真额度），真 Host/worker 进程 |
| **observability** | deliveryStatus=failed 可操作 hint；凭证续期/重获失败诚实告警；org-key deviation 局限可见 | —— |

**Forcing functions（§8）**：切片 2 脱敏 gate + 真 provision e2e 进 **Phase 2 独立门**，不焊 v1 确定性 release:check（遵审计成熟度隔离）。

---

## 6. ADR

- **Decision**：在已连通的 provision/隧道管道上补三件语义层工作——诚实自包含投递（P1）、check-in 内嵌 descriptor 下发 + first-provision 引导 + 重启自愈（P2）、凭证投递/续期分离经 access-token 通道注入引擎 env（P3，仅 org-key 适配器）。三段拆分，只有 P1 批准即执行。
- **Drivers**：secret 爆炸半径；无头非技术员工需零交互且重启自愈；审计冻结 + PROJ-1 重启面。
- **Alternatives considered**：凭证全搭一次性 check-in（淘汰：无续期、重启即死）；provision env 注入（淘汰：secret 进命令串，但其重启存活优点用 access-token 重获替代）；worker 各自 OAuth（淘汰：B2B 非技术不可行）；Host 全自动远程执行 aissh（降级 local/docker 可选）；切片 2 建 LiteLLM 网关（推迟切片 3：越审计冻结线）。
- **Why chosen**：descriptor（一次性）搭一次性 check-in、凭证（可续租约）搭可重放 access-token 通道——按生命周期匹配通道，把 secret 限于 TLS+内存，撤销=网关 block + 短 TTL（org-key 模式诚实标局限），对齐 §4 与「不自建网关」边界。
- **Consequences**：check-in 响应增大；派生 token 仍被 native CLI 落盘（引擎关注点）；worker 侧需持久化 access token（capability token，脱敏 + 0600）；org-key 撤销受限（deviation）；引入 broker 接口 + EngineCredentialProvider DI 为切片 3 铺路；P2 改动撞 PROJ-1 须协调。
- **Follow-ups**：切片 3 LiteLLM 自建网关闭环（per-worker virtual key 签发/撤销/限额）；soul 热更新走 B-opt2 独立 endpoint；审计 SL-5 secret 正则全量收敛（backlog）；WAT-1 隧道帧 SSE/二进制损坏（独立 high，与分发热路径相关）。

---

## 7. 风险与协调

- **R1 并发共享工作树**：分支 `fix/proj1-restart-lock` 领先 main 4 提交；实现前重核 git status，不 stage/revert 他人改动。
- **R2 引擎注入通道随版本变**：codex 默认偏好 OAuth 需先 logout 才用 env key——注入前按各 CLI 当前文档核实，失败诚实降级为可操作引导（复用切片 1 优雅失败）。
- **R3 canon 先行**：protocol.md 与 P2 同 PR、runtime.md 与 P3 同 PR（已纠正 iteration 1 堆 Phase 4）。
- **R4 secret-guard 张力**：注入路径脱敏测试 TDD 先写。
- **R5 PROJ-1 协调**：P2-T3/T4 直接触 restart-lock 语义，与 `fix/proj1-restart-lock` 一并设计，勿各改各的。
- **R6 审计成熟度边界**：切片 2 测试进 Phase 2 独立门；不建 LiteLLM 网关（切片 3）。

---

## 8. 验收标准（可测、可证伪）

1. **P1**：assign 后 `deliveryStatus` 真实反映结果（不再硬报 delivered，恒为 `command_generated`）；`resolveApiKey` 前缀与写守卫一致、secretref 诚实失败。（`--execute` 真 spawn 已裁决推迟 Phase 2，见 P1-T1：pre-bootstrap 执行是新 false-green。）
2. **P2**：裸机 `aiworker provision --host --token` 后自动拿 Host descriptor、`installAppDescriptor` 成功、绑定 soul、无需本地 `--app`；**daemon 重启后无需 re-provision 自动重连**；re-provision 撞 worker_id 不 500（幂等或诚实拒绝）。
3. **P3**：worker 首回合 native 引擎 env 真含注入 `ANTHROPIC_BASE_URL/AUTH_TOKEN`（或 codex 对应），引擎用派生凭证真跑通一回合；**daemon 重启后再跑一回合仍成功**（凭证经 access-token 通道重获）——不是只在首个窗口绿（纠正 iteration 1 false-green AC#3）。
4. e2e 跑完扫所有 host.db/worker.db/log/diagnostic：token/org-key 真值（哨兵）**零出现**。
5. org-key 模式 receipt/文档显式标「无 per-worker 撤销」deviation；`revoke()` 返回 not-supported 而非假成功。
6. canon 与对应 phase **同 PR** 合并（protocol↔P2、runtime↔P3）。
7. 切片 2 测试在 Phase 2 独立门通过，未焊进 v1 确定性 release:check。

---

## 9. 执行前置（给批准后的实施轮）

- **Phase 1**：批准即可交 team/ralph 执行（自包含、低风险）。
- **Phase 2/3**：批准本设计后，各开**一轮聚焦实现规划**——P2 因撞 PROJ-1 重启面、P3 因 secret 注入安全核心，均需把本设计的 C1/C2 机制（first-provision 入口、access-token 凭证通道、持久 access token、worker_id 守卫、credential dataflow seam）落成可执行步骤，再交执行。不建议把 P2/P3 当「接线」一把梭。

**Critic 终审 3 条前瞻（带入 P2/P3 聚焦轮，非本设计缺陷）：**
1. **EngineCredentialProvider 内存槽生命周期**（P3 轮）：§2.2 命名了 DI seam，但未定内存槽归属——daemon 进程内单例？token 过期清空？并发 invocation 线程安全？这是 secret-in-memory 卫生最可能回归处，P3 须钉死。
2. **WAT-1 作显式前置**（P3 轮）：WAT-1 是独立 open high，若不先修，P3 帧工作被它阻塞——P3 轮须把 WAT-1 列为前置，而非仅「对齐」。
3. **P2-T5 冲突权威决策矩阵先于编码**（P2 轮）：三源 restart-state 谁权威，P2 轮须在编码前产出决策矩阵，否则正是 P2-T5 要防的 stale-state bug。
- **另两个实现者 open question（非阻塞）**：(i) 0600 token-file 路径须确认被 e2e 哨兵扫描覆盖（capability token 不被 provider 正则匹配）；(ii) codex headless 无法非交互 `logout` 时 env-key 是否静默败给 OAuth——P3 轮加负向测试。
