# 切片 2 Phase 3 聚焦实现计划 —— LLM 凭证注入（仅 org-key 适配器）

- 日期：2026-06-11
- 状态：**pending approval**（聚焦实现规划轮，未执行）。评审：**Architect = SOUND-WITH-CONCERNS / Critic = APPROVE（must-fix 全并入；含术语铁律 scope/title 收口）**。
- 父计划：`docs/superpowers/plans/2026-06-11-slice2-host-real-distribution.md`（§3 P3、§2.2、§4；设计已定型）
- 前置：Phase 1（诚实投递 / resolveApiKey）+ Phase 2（first-provision + 持久 0600 token + 4401 撤销 + descriptor 下发）均已合 main（PR #29/#31）
- 范围：把 LLM 凭证注入 native 引擎子进程环境，**仅 org-key 适配器（文档化 deviation：下发的是 org key 原样 —— 非派生、无 per-worker 撤销、无短 TTL）**；**真派生/受限/可撤销/短 TTL 凭证留切片 3**（LiteLLM `/key/generate` 自有签发闭环）。术语铁律见 §1.1.2。
- 侦察基线：main `87bc5cb3`，已勘验（见 §0）。

---

## 0. 侦察基线（main `87bc5cb3`，已勘验）

**Phase 3 在 host/worker 两侧均为 greenfield**：全仓无 broker/mint/org-key/`ANTHROPIC_*`/`OPENAI_*` 注入代码。

**A. 引擎 env 注入点**
- `executor.ts:270-275`：native env = `{...sanitizeEngineEnv(), ...(engine.env ?? {})}`。`engine-env.ts:3` `sanitizeEngineEnv` 只剥 `AIWORKER_`/`WORKER_`/`OD_`，**不剥 `ANTHROPIC_*`/`OPENAI_*`** → 注入作**第三层 merge** 存活，载体变量名不得用被剥前缀。
- DI 缝：`ExternalEngineExecutorOptions`（`executor.ts:68-73`）现只有 `processManager` 等；加 `credentialProvider?`。
- engineId 分流：`localEngineDefinitions`（`executor.ts:99-205`）键 `'claude-code'`/`'codex'`/`'cursor'`（剔除）/`'gemini'`（已有静态 `env` = 范式）。
- **核心集成缝**：executor 经 `LocalWorkerRuntimeOptions.executor` 注入（`worker.ts:96,145`），`connectWorkerAccessTunnel` 是并列调用（`worker.ts:761`），**两者互不相连** → 需共享内存 store 同挂两边。

**B. access-token 帧通道**
- 帧 union `workerAccessFrameSchema`（`worker-control-protocol/src/index.ts:120-127`）：hello/request/response/ping/pong/close。worker onmessage（`provision-client.ts:378-419`）处理 request/ping/pong；host（`host-server.ts:190-266`）处理 hello/response/close/ping。
- **方向性**：现有 request/response 是 **host→worker** 转发（host 侧 pending correlation）；`credential_acquire` 是 **worker→host 反向**（worker fire-and-forget 或自建 pending）。
- Phase 2 持久 access 三元组（`access-token-store.ts`）+ 4401 撤销（`provision-client.ts:309` 清 token+停重连）已就绪；重连（含重启经 `readPersistedWorkerAccess`）重发 acquire = 凭证恢复路径。

**C. gatewayProfileRef + secret-ref**
- `gatewayProfileRef` 在 **assignment envelope**（`worker-control-protocol/src/index.ts:40-42`，refine 拒裸名）、**非 check-in receipt**、`host_assignments` **无该列**（只 `metadataJson`，`schema.ts:22`）、**零消费方+零 producer**（生产 check-in 路径不构造 envelope）= 全孤儿。
- worker `resolveApiKey`（`executor.ts:546-560`）：`$`/`env:`/裸名→`process.env`；`secretref:`→诚实未实现。**host 侧无任何 secret-ref/org-key 解析**（只读 `AIWORKER_HOST_*` 配置 env）。

**D. WAT-1**：损坏仅 `bodyText` HTTP 转发（protocol `bodyText`:86/94、`provision-client.ts:480/488` `response.text()`、`host-server.ts:171-174` 15s 超时）。新 typed 帧不碰这些。

**E. BYOK ≠ Phase 3**：`runByokExecutor`（`executor.ts:357`）executor 自己 fetch；Phase 3 = 注入 env 让 native 引擎自己用，按 `executionMode` 分流，**不经 byok executor**。

**F. secret-guard**：共享 `SECRET_VALUE_RE`（`engine-bridge/src/index.ts:54-55`）抓 `sk-`/`Bearer`/kv；**无前缀 org key 是盲区**。executor **从不 log env 对象**（只 redacted stdout/stderr，`executor.ts:293-294`/`redactEngineLog:538`）。

---

## 1. RALPLAN-DR 决策摘要

### 1.1 原则
1. **凭证不入 AIWorker 自有存储/log**：注入的凭证（无论 org key 还是切片 3 派生 token）绝不入 descriptor/host.db/worker.db/`access-token` 文件/log/receipt（仅 TLS + worker 内存；native CLI 自身落盘是引擎关注点）。
2. **「master key 永不离开 Host」是 mode-conditional 目标，非 org-key v1 现实（Architect must-fix·诚实）**：
   - 切片 3 网关适配器：Host 持 master key、给每 worker 签发**真派生的、受限、可撤销、短 TTL** 的 per-worker key —— 此时该原则成立。
   - **org-key 适配器（Phase 3 唯一发的模式）= 明确 deviation**：适配器把**原始 org key 原样**（**非派生**）经帧下发到每个 worker，native CLI 落盘（`~/.claude/.credentials.json` 0600）。**爆炸半径 = 任一 worker 沦陷即整 org key 沦陷、影响全员、无 per-worker 撤销**。即 org key **确实离开 Host 到达每台员工机**。
   - **术语铁律**：org-key 模式的下发物**一律称「下发的 org key（as-is）」，绝不称「派生/derived/受限 token」**——「派生」仅切片 3 适用。`revoke()` 返 not-supported（不假成功），receipt/文档/UI 显式标「无 per-worker 撤销，撤销需轮换 org key 影响全员」。
3. **凭证搭已认证 access-token 通道**（typed 帧，非 bodyText）——复用 Phase 2 持久 token + 重连恢复，不造新控制面。
4. **不自建网关、不预建 LiteLLM**：只 org-key 适配器；broker 接口 + 帧形状须使切片 3 真签发为 drop-in adapter swap（零协议改动）。

### 1.2 决策驱动（top 3）
1. **Secret 爆炸半径**：注入路径 + 新帧 + Host mint 错误体最易泄漏 → 决定脱敏两分支 + 不落盘 + 测试覆盖。
2. **无头非技术员工**：零交互拿凭证就能跑；凭证恢复（重启/重连）自愈。
3. **审计「冻结 + 不镀金」**：org-key MVP，不建网关签发闭环（切片 3）。

### 1.3 可行选项（每决策附就地失效理由）

**D1 凭证投递帧**
- **D1-opt1（选）独立 typed 帧 `credential_acquire`/`credential_refresh`**：字段（engineKind/baseUrl/token/expiresAt）直接在帧体，JSON round-trip。✅ **不受 WAT-1 影响**（侦察 D 实锤：WAT-1 仅 bodyText），小 JSON 无损。
- D1-opt2 塞进 request/response `bodyText`：❌ 继承 WAT-1 有损 + 15s 超时。**淘汰**。

**D2 凭证存放**
- **D2-opt1（选）共享内存 `EngineCredentialStore`**：bootstrap 作用域建，同挂 executor options + tunnel input；executor spawn 时按 engineId 读注入；tunnel acquire 应答写入。**仅内存，进程级单例，撤销/重连清空**。✅ 跨模块缝合 + 绝不落盘。
- D2-opt2 落 `access-token` 文件：❌ 该文件 schema 严格 + capability token 专用，混入 provider secret 破 Phase 2 契约 + 落盘 provider secret 违原则 1。**淘汰**。

**D3 broker profile 选择 + org key 存储**
- **D3-opt1（选）Host broker config（env）+ per-assignment 选择器走 metadataJson**：Host 配置 profile（baseUrl + org-key secret-ref，env 驱动）；assignment 可选在 `metadataJson` 带 profile 名（裸名，不受 envelope refine 约束）；缺省用 default profile。✅ 不碰孤儿 `gatewayProfileRef`（在错线上）、不改 envelope refine、无 DB 迁移。
- D3-opt2 接通 `gatewayProfileRef`（父计划原议）：❌ 它在 worker-config envelope（非 check-in/credential 路径）、refine 拒裸名、需迁移——**错线**（纠正父计划 §1 D 的「接通占位」）。**默认退役 gatewayProfileRef**（孤儿 + 无 producer/consumer，留着诱 future「接占位」churn；除非切片 3 网关有具体用途，作 tracked 决策）。

**D4 org key secret-ref 形态（Host 侧）**
- **D4-opt1（选）`env:NAME`/`$NAME` 解析 + baseUrl 配对 env**：与 worker `resolveApiKey` 同前缀集风格，host 侧新建解析（worker 的在 worker-runtime 不能跨用）；`secretref:` 同样诚实未实现（无 secret manager）。✅ v1 现实形态、一致诚实边界。

---

## 2. 架构设计

### 2.1 凭证注入数据流

```
Host 配置(env): AIWORKER_GATEWAY_<PROFILE>_BASE_URL + _KEY_REF(env:ORG_KEY) [+ default profile]
   │
worker tunnel hello(Phase2,access token 鉴权)成功
   │ worker 发 credential_acquire{ engineKind }    ← typed 帧(worker→host)
   ▼
Host handleWorkerAccessSocketMessage credential_acquire 分支:
   ws.data.workerId + 帧 assignmentId → 查 host_assignments → metadataJson.profile(或 default)
   → broker.mint(profile, engineKind)
       org-key 适配器:解析 env:ORG_KEY + baseUrl,token = org key **原样**(非派生/非签发,故 expiresAt 缺省/远期)
       切片3 网关适配器(未实现):调 /key/generate 铸真派生短 TTL key
   → 回 credential_grant 应答{ engineKind, baseUrl, token, expiresAt }   ← typed 帧(独立 type,非复用 response)
   ▼
worker onmessage 收应答 → 写 EngineCredentialStore(内存)
   │ 近 expiresAt → 发 credential_refresh 重 mint
   │ 重连(含重启 readPersistedWorkerAccess 恢复三元组→hello)→ 重发 acquire = 恢复
   ▼
session 首回合 executor spawn:
   env = {...sanitizeEngineEnv(), ...engine.env, ...credentialProvider.envFor(engineId)}  ← 第三层
        claude-code → ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN
        codex       → OPENAI_BASE_URL + OPENAI_API_KEY (codex OAuth 偏好注意,见 pre-mortem 3)
        cursor      → 剔除(不注入,CLI 不让外部 key 路由)
        其余(gemini/opencode/qwen) → 不在 org-key v1 注入名单(留扩展)
```

### 2.2 EngineCredentialStore 生命周期 + 构造顺序（Critic 前瞻 #1 + Architect must-fix·顺序）
- **进程级单例**，**必须在 `bootstrapWorkerApp` 顶部（`worker.ts:~137`，与 `runtimes`/`workerAccessTunnels` 同处）创建**——因 executor 在 `worker.ts:143-144` 流入 `createWorkerOrchestrator`、runtime 在 `:191` `createRuntimeForWorker`+`init()` 绑定，**均早于 tunnel 的 `:761`**。store 必须**先于两个消费方存在**：建于顶部 → 注入 `createWorkerOrchestrator` 的 executor options（`credentialProvider`）→ **同一实例**交 `:761` `connectWorkerAccessTunnel`。计划早期「~761 创建」是**倒序的**（那时 executor 已建好绑死，拿不到 store）→ credentialProvider 会 undefined、注入静默 no-op。**测试断言 executor 收到的 credentialProvider 非 undefined。**
- `set(engineKind, credential)`（acquire/refresh 应答写）/ `envFor(engineId)`（executor spawn 读，按 engineId→provider 映射）/ `clear()`（4401 撤销 / 进程退出）。
- **线程/并发**：单进程内顺序，spawn 读快照；刷新原子替换。**绝不持久化、绝不 log**。
- 无凭证时 `envFor` 返空 → 回落切片 1 auth-aware 优雅失败引导（诚实降级，非崩溃）。

### 2.3 secret 边界（高危横切）
- 凭证流转（org-key v1 = **org key 原样**，非派生）：Host 内存 ← org-key 适配器 ← `env:ORG_KEY` → TLS credential 帧 → worker EngineCredentialStore 内存 → 引擎 env。**绝不经** descriptor/host.db/worker.db/`access-token` 文件/log/diagnostic/receipt/OpenAPI/UI（AIWorker 自有面；native CLI 自身落盘是引擎关注点，但 org-key 模式落盘的是整把 org key —— 见原则 2 爆炸半径）。
- **脱敏（Architect 收窄特征）**：共享 `SECRET_VALUE_RE`（`engine-bridge:55`）**已能抓** `sk-`/`sk-ant-`、`Bearer …`、`token=…`、以及 JSON key 名（`api_key`/`authorization`/`password`/`secret`/`token`）下的值——真 OpenAI/Anthropic org key 与 `"token":"…"` 帧字段**都在覆盖内**。**真正残留盲区窄**：不在识别 key 名下的裸 token、或嵌进 baseURL 的 token。→ 对该窄残留用**已知值脱敏（`redactWorkerAccessToken` 式）**；P3-T4 测试**靶向裸/嵌-baseURL token**，别测「无前缀=全盲」的幻象。
- 新增 credential 帧 + Host mint 路径 + mint 错误体**绝不打印 token**；executor env 注入本身不 log（侦察 F 确认）。

---

## 3. 分步实现（每步独立可验、独立 PR；canon 与对应步同 PR）

### P3-Step1 —— 协议：credential typed 帧（canon 先行）
- `docs/protocol.md`：文档化 credential 帧、字段语义（engineKind/baseUrl/token/expiresAt）、**WAT-1 边界说明**（typed 帧非 bodyText、不入 host pending map 故不受 15s 超时、不受损）、secret 边界（token 仅内存、不落盘/log）。
- **帧必须是独立 type（Architect must-fix·a）**：`worker-control-protocol/src/index.ts:120-127` union 加**三个不同 type** `.strict()` 帧——`credential_acquire`（worker→host 请求）、`credential_refresh`（worker→host 续期请求）、`credential_grant`（host→worker 应答，**绝不复用 `response` type**，否则撞 HTTP 转发 pending 语义）。`engineKind` enum（`'anthropic'|'openai'`，cursor 不在）。
- **worker 必须加 inbound 分支（Architect must-fix·a）**：worker `onmessage`（`provision-client.ts:378-419`）现仅处理 `request`/`ping`/`pong`，**无 inbound 应答分支** → 必须加 `credential_grant` 分支写 store。acquire 走 fire-and-forget（首回合若早于 acquire 完成 → 空 store 优雅失败，见 AC#1b），不强制 worker 侧 pending correlation。
- **验证**：协议契约（三帧 round-trip + 拒非法 + engineKind enum + `credential_grant` 不与 `response` 混淆）。

### P3-Step2 —— Host：broker 接口 + 仅 org-key 适配器 + credential_acquire 分支
- broker 接口 `EngineCredentialBroker { mint(profile, engineKind) → {engineKind,baseUrl,token,expiresAt}, revoke(handle) }`。**仅 org-key 适配器**：host 侧 secret-ref 解析（`env:`/`$`→env，`secretref:`→诚实未实现）解出 org key + baseUrl；`revoke()` 返 **not-supported**（不假成功，文档/receipt 标「无 per-worker 撤销，撤销需轮换 org key 影响全员」deviation）。
- Host config（env 驱动）：profile 表（baseUrl + key-ref）+ default；`handleWorkerAccessSocketMessage`（`host-server.ts:190-266`）加 `credential_acquire` 分支——`ws.data.workerId` + 帧 assignmentId → 查 host_assignments → `metadataJson.profile`（或 default）→ `broker.mint` → 回应答帧。**绝不 log token / mint 错误体含 token**。
- LiteLLM `external-gateway` 适配器**仅留接口接缝**（不实现，切片 3）。
- **验证**：broker org-key 单测（注 fake env、mint/revoke not-supported）；host credential_acquire 分支单测（注 fake broker、按 profile mint、缺 profile 用 default、错误不泄 token）。

### P3-Step3 —— Worker：EngineCredentialStore + tunnel 帧 + executor env 注入
- `EngineCredentialStore`（新文件，worker-daemon）：内存 set/envFor/clear（§2.2）。
- `connectWorkerAccessTunnel`（`provision-client.ts`）：hello 成功后发 `credential_acquire`；onmessage 收应答写 store；近 expiresAt 发 `credential_refresh`；重连（含重启）重发 acquire。store 经 input 注入。
- `executor.ts`：`ExternalEngineExecutorOptions` 加 `credentialProvider?`；spawn env 第三层 merge `credentialProvider.envFor(engineId)`（engineId→provider env 映射，claude-code/codex 注入、cursor 剔除）；无凭证返空回落优雅失败。
- `worker.ts` bootstrap：建 store 同挂 executor + tunnel。
- **验证**：store 单测；tunnel acquire/refresh/重连重获单测（注 fake socket）；executor 第三层注入单测（注 fake provider，断言 env 含 ANTHROPIC_*/OPENAI_*、cursor 不注入、无凭证回落）。

### P3-Step4 —— secret-guard 两分支 + 契约测试 + codex OAuth + canon
- 脱敏两分支（§2.3）：有前缀走共享正则、无前缀走已知值脱敏；接进可能含 token 的新路径（credential 帧 log 守卫、mint 错误体）。
- **P3-T4 脱敏契约测试**：注入凭证（org-key v1 = org key 原样，有/无前缀）在 host.db/worker.db/log/diagnostic/credential 帧 dump/mint 错误体被脱敏/不出现；哨兵 token 扫描（靶向裸 token + 嵌 baseURL token 的窄残留）。
- **codex OAuth 负向测试（Critic 前瞻）**：codex 偏好 OAuth、需 `/logout` 才用 env key；headless 无法非交互 logout 时 env key 是否静默败给 OAuth → 加负向测试 + 诚实降级/文档说明。
- canon：`docs/runtime.md`（引擎 env 凭证注入落点 + 按引擎表 + cursor 剔除 + org-key deviation + 凭证仅内存边界）；`docs/architecture.md`（凭证注入管线 Phase3 + 切片 2/3 成熟度边界：org-key v1 vs 切片 3 网关签发）。
- **验证**：脱敏契约 + codex 负向 + canon docs:check。

### P3-Step5 —— Phase 3 独立 e2e + 全验证
- e2e（进 **Phase 2/3 独立门**，不焊 v1 release:check）：真 provision + credential_acquire + 引擎 env 真含注入变量 + **重连后重获** + **全 log/DB 无 token 哨兵**（注 fake broker，不烧真 provider 额度）。
- 全包 typecheck/test/lint + 独立 code-reviewer + code-review-graph + PR。

---

## 4. Pre-mortem（6 场景，deliberate）

1. **注入凭证（org key 原样）泄进新帧 log / mint 错误体（最高危——org-key 模式泄的是整把 master secret）**。缓解：P3-T4 脱敏测试 TDD 先写；credential 帧/mint 路径强制脱敏；e2e 哨兵扫全 log/DB。
2. **裸/嵌-baseURL token 逃过共享正则**（窄残留，§2.3 收窄后）。缓解：该窄残留走已知值脱敏，契约测试**靶向裸 token + 嵌 baseURL token**在持久路径被脱敏（非测「无前缀=全盲」幻象）。
3. **codex 因 OAuth 偏好忽略注入的 `OPENAI_*` → 静默用错账号**（Critic 前瞻 + Architect 锐化）。缓解：负向测试坐实行为；**作具体分支**——若 headless 无法非交互 `/logout` 让 env key 生效，则 **org-key v1 明确「codex 注入 documented-unsupported」**（诚实拒绝 + 可操作提示），**而非静默败给 OAuth**。claude 路径不受此限。
4. **凭证 session 中途过期 → 引擎失败 / org-key 远期 expiresAt 掩盖撤销**（Critic nice-to-have）。缓解：refresh-before-expiry 定时 + 重连重获；过期失败诚实可操作消息（非裸 exit code），复用切片 1 优雅失败。**org-key 模式 expiresAt 缺省/远期不得变相关掉唯一 liveness 检查**——撤销仍靠 4401（Phase 2 通道）即时停连 + 清 store，不依赖 TTL 过期。
5. **EngineCredentialStore 生命周期/并发回归**（Critic 前瞻 #1）。缓解：进程级单例、spawn 读快照、刷新原子替换、绝不持久化；测试覆盖 set→envFor→clear。
6. **org-key deviation 被当可撤销给假安全感**。缓解：`revoke()` not-supported 显式；receipt/文档/UI 标「撤销需轮换 org key 影响全员」；真撤销=切片 3。

---

## 5. 扩展测试计划

| 层 | 覆盖 | 注入/隔离 |
|---|---|---|
| **unit** | broker org-key mint/revoke(not-supported)；EngineCredentialStore set/envFor/clear；executor 第三层注入(engineId 分流/cursor 剔/无凭证回落)；host credential_acquire 分支；脱敏两分支 | 全注 fake，不真 spawn/不真调网关/不真烧额度 |
| **contract** | credential 帧 round-trip + engineKind enum + 拒非法；**注入路径脱敏**(有/无前缀 token + org key 在 DB/log/diagnostic/帧 dump/mint 错误体) | worker-control-protocol + 共享/已知值脱敏 |
| **integration** | tunnel hello→acquire→store→executor 注入全链；refresh-before-expiry；重连(含重启)重获；4401 撤销清 store | in-proc fake Host + fake broker |
| **e2e(Phase2/3 独立门)** | 真 provision + 真 acquire + 引擎 env 真含变量 + 重连重获 + 哨兵零泄漏 | fake broker(不烧真额度)，真 worker 进程 |
| **codex 负向** | codex OAuth 偏好下注入 env key 行为 + 诚实降级 | fake/真 codex（按可行性） |
| **observability** | 凭证过期/撤销诚实告警；org-key deviation 局限可见 | —— |

**Forcing functions**：脱敏 gate + 真注入 e2e 进 **Phase 2/3 独立门**，不焊 v1 release:check。

---

## 6. ADR

- **Decision**：在 Phase 2 已认证 access-token 通道上加 `credential_acquire`/`credential_refresh` typed 帧（不受 WAT-1 影响），Host org-key 适配器 mint「org key + baseUrl」下发，worker 经共享内存 EngineCredentialStore 注入 native 引擎 env 第三层（claude→ANTHROPIC_*/codex→OPENAI_*/cursor 剔）；凭证仅内存、重连重获、4401 清空；仅 org-key（LiteLLM 留切片 3）。
- **Drivers**：secret 爆炸半径；无头零交互 + 重连自愈；审计不镀金（org-key MVP）。
- **Alternatives considered**：凭证塞 bodyText（淘汰：WAT-1 有损）；落 access-token 文件（淘汰：破 Phase 2 契约 + 落盘 provider secret）；接 gatewayProfileRef（降级：错线、refine 拒裸名、留 Phase-2-control 未来）；自建 LiteLLM 网关（推迟切片 3）。
- **Why chosen**：typed 帧绕开 WAT-1、复用已认证通道把 secret 限于 TLS+内存、org key 永不离 Host、注入在 executor 第三层（env 不 log）；org-key deviation 诚实标局限为切片 3 真撤销铺路。
- **Consequences**：新增 3 typed 帧（acquire/refresh/grant，独立 type）+ Host broker config(env) + EngineCredentialStore（顶部构造，§2.2）；**org-key 模式 = org key 原样下发到每 worker + native CLI 落盘 → 爆炸半径 = 任一 worker 沦陷即整 org key 沦陷、无 per-worker 撤销（Phase-2→3 落盘倒退：Phase 2 落盘的是有界可撤销 capability token，Phase 3 org-key 落盘的是整把 provider master secret）**；codex OAuth 可能需 logout，否则 codex 注入 v1 documented-unsupported（局限）；gatewayProfileRef 维持孤儿（Phase 3 不接）。
- **Follow-ups**：切片 3 LiteLLM 自有签发闭环（per-worker 真派生 virtual key + 真撤销 + 限额）= 本期 broker 接口 + 帧的 **drop-in adapter swap（零协议改动）**，**才真正兑现「master key 永不离开 Host」**；WAT-1 bodyText 修复（独立 high，与 credential 帧无关但同隧道）；**gatewayProfileRef 默认退役**（孤儿 + literal-secret-rejecting refine + 无 producer，留着诱future「接占位」churn；除非切片 3 网关适配器有具体用途）。

---

## 7. 风险与协调
- **R1 WAT-1**：credential 帧走 typed（非 bodyText）即不受影响；**铁律=绝不塞 bodyText**。
- **R2 codex OAuth**：注入前按 codex 当前文档核实、负向测试坐实、失败诚实降级。
- **R3 secret-guard 张力**：无前缀盲区 → 已知值脱敏；P3-T4 TDD 先写。
- **R4 canon 先行**：protocol.md↔Step1、runtime.md↔Step4 同 PR。
- **R5 并发共享树**：实现前重核 git status。
- **R6 审计成熟度**：仅 org-key、测试进 Phase2/3 独立门。

---

## 8. 验收标准（可测、可证伪）
1. worker 首回合 native 引擎 env 真含注入 `ANTHROPIC_BASE_URL/AUTH_TOKEN`（claude）或 `OPENAI_BASE_URL/API_KEY`（codex，若 OAuth 不挡）；cursor 不注入；无凭证回落优雅失败。
1b. **首回合早于 acquire 完成**（fire-and-forget）→ 空 store 优雅失败（切片 1 fallback），**非崩溃**。
2. 凭证经 credential 帧（typed 独立 type，非 bodyText、非复用 response）下发；**daemon 重启/隧道重连后自动重获**（不需 re-provision）。
3. 注入凭证（org key 原样 / 切片3 派生 token）真值**零出现**于 host.db/worker.db/`access-token` 文件/log/diagnostic/credential 帧 dump/mint 错误体（哨兵扫描，靶向裸/嵌-baseURL token）。
3b. **store 构造顺序**：executor 收到的 `credentialProvider` 非 undefined（防 §2.2 倒序静默 no-op）。
4. org-key 模式 receipt/文档显式标「无 per-worker 撤销」deviation；`revoke()` 返 not-supported。
5. codex OAuth 偏好下行为有负向测试 + 诚实降级/文档说明。
6. canon（protocol↔Step1 / runtime+architecture↔Step4）与对应步同 PR。
7. Phase 3 测试在 Phase 2/3 独立门通过，未焊 v1 确定性 release:check。

---

## 9. 执行前置
- 本计划经 Architect/Critic 共识（**Architect SOUND-WITH-CONCERNS→并入 / Critic APPROVE**）→ 各 Step 拆独立 PR 交 team/ralph 执行。
- **执行者 open question（Critic advisory，非阻塞但须落实）**：(i) `credential_acquire` 是 worker→host 反向帧——Host 新分支须确保**为 assignment A 认证 hello 的 worker 不能 mint assignment B**（反向帧授权边界：`ws.data.workerId` + 帧 assignmentId 必须与 hello 鉴权的 assignment 一致，防伪造/越权 mint）；(ii) AC#3 哨兵扫「credential 帧 dump / mint 错误体」——须先确认确有能 dump 帧/错误体的代码路径（executor 从不 log env，§0-F），若无则该扫描是 vacuous absence，若有（如隧道 debug log）必须经两分支脱敏路由。
- **切片 3（LiteLLM 自有网关签发闭环）不在本轮**——复用本期 broker 接口 + credential 帧 + EngineCredentialStore，另开聚焦轮（per-worker virtual key 签发/撤销/限额）。
