# 切片 3 聚焦实现计划 —— LiteLLM 托管网关（per-worker virtual key 真签发/撤销/限额）

- 日期：2026-06-11
- 状态：**pending approval**（聚焦实现规划轮，未执行）。评审：**Architect = SOUND-WITH-CONCERNS / Critic = APPROVE（§4 真兑现确认；revoke-by-alias + mint-gate-revokedAt + Step0 三门 G-a/G-b/G-c + codex hypothesis 等 must-fix 全并入）**。
- 父计划：`docs/superpowers/plans/2026-06-11-slice2-host-real-distribution.md` §7（方向）；承接 Phase 3 `docs/superpowers/plans/2026-06-11-slice2-phase3-llm-credential-injection.md`（broker 接口 + credential 帧 + EngineCredentialStore = 本切片 drop-in 地基）
- 前置：切片 2 全三 Phase 已合 main（PR #29/#31/#33）
- 范围：把 Phase 3 的「org-key 原样下发（非派生、无 per-worker 撤销）」**升级为 LiteLLM 真签发 per-worker virtual key（受限/可即时撤销/短 TTL/限额/审计）**，作 Phase 3 `HostCredentialBroker` 接口的 drop-in adapter。**对接外部已部署的 LiteLLM，不在本仓自建网关**（plan §1.4/§7）。
- 侦察 + 调研基线：main `b6f45c56`，已勘验代码 + 调研 LiteLLM 官方文档（见 §0）。

> **本切片才真正兑现蓝图 §4 的「master key 永不离开 Host；worker 只持受限/可撤销/短 TTL 派生 key」**——Phase 3 的 org-key 是该承诺的 mode-conditional deviation，本切片是其 conform 实现。

---

## 0. 基线（侦察 main `b6f45c56` + LiteLLM 文档调研）

### 0.1 Phase 3 地基（drop-in 接缝，复用）
- **broker 接口** `apps/host-cli/src/host-credential-broker.ts:48-53`：`HostCredentialBroker { mint(profile, providerKind) → HostCredentialGrant; revoke(handle) → HostCredentialRevokeResult }`，**当前同步**。`HostCredentialGrant`（:18-27）`{providerKind, gatewayUrl, token, expiresAt}`；`HostCredentialHandle`（:30-33）`{providerKind, profile}`；`revoke` org-key 返 `{supported:false}`。LiteLLM 适配器接缝 = **纯注释、无 stub**（:40-46）。
- **协议帧 + 注入 + refresh 链**（`worker-control-protocol` credential 帧 / `EngineCredentialStore` / executor 第三层 / `provision-client` computeRefreshDelayMs）：**复用无需改**——真 token 填 `token`、真短 TTL 填 `expiresAt`，短 TTL 落 `(MARGIN, MAX_DELAY~24.8d]` 自动触发周期 refresh。**约束：单 key TTL 须 < ~24.8 天 cap**。
- `EngineCredentialStore` 现仅 `claude-code→anthropic` 映射（codex 因 Phase 3 OAuth 顾虑 unmapped）。
- secret-guard：virtual key 是 `sk-...` → 已被 `engine-bridge SECRET_VALUE_RE` 的 `(sk-)[\w-]{8,}` 覆盖。

### 0.2 三处缺口（= 本切片核心新建）
1. **broker 同步 → async**：LiteLLM `/key/generate`/`/key/block` 是 async HTTP，须把 `mint`/`revoke` 改 `Promise<...>`（唯一接缝签名 breaking change，同步改 `host-server.ts:294` 调用方 + org-key 适配器 + 测试）。
2. **撤销闭环（最大缺口，三件必须同期建）**：
   - **无 host operator 撤销入口**：`revokeAssignment`（`storage-sqlite/src/host/index.ts:467`）**零生产调用方**，host-cli 无 revoke 子命令/endpoint。
   - **4401 是被动的**：仅 worker 下次发 hello（重连/重启）才触发，已连 worker 不被立即踢；且 4401 只清 worker 内存 token，**不撤销 LiteLLM 侧 key**。
   - **无 per-worker key handle 持久化**：mint 单向下发不回写，撤销时无从找回 worker 的 virtual key。
3. **Host 配置无 master key**：org-key env（`AIWORKER_GATEWAY_<PROFILE>_<PROVIDER>_*`）无 master key / endpoint；本仓无任何 LiteLLM 基建（deploy/ 无位置）。

### 0.3 LiteLLM API（官方文档调研，docs.litellm.ai）
- **`/key/generate`** POST + master key Bearer：`duration`("24h"/"30d")、`max_budget`+`budget_duration`、`rpm_limit`/`tpm_limit`、`models`、`metadata`（绑 worker_id 审计）、`key_alias`。返回 `{key: "sk-...", info:{...expires}}`，**明文一次性**，DB 存 hash。
- **`/key/block`**（取字面 key，立即拒、可逆）/ **`/key/unblock`** / **`/key/delete`**（取 `keys[]`/`key_aliases[]`，永久）。per-key 隔离 + master key 不动（强证据推断）。
- **master key**：env `LITELLM_MASTER_KEY`（须 `sk-` 开头），只作 admin endpoint Bearer，**绝不嵌入 virtual key**。
- **审计**：`/key/info?key=`、`/spend/logs`、`/global/spend/report?group_by=key`，metadata 绑 worker_id。
- **引擎对接**：同 proxy 多协议——claude-code→`ANTHROPIC_BASE_URL=proxy`+`ANTHROPIC_AUTH_TOKEN=virtual key`（打 `/v1/messages`）；codex→`OPENAI_BASE_URL`+`OPENAI_API_KEY=virtual key`（打 `/v1/chat/completions`）。
- **部署**：docker + Postgres（key DB = 撤销真相源），HA 靠共享 Postgres(+Redis)。**撤销状态真相源 = LiteLLM Postgres，AIWorker 只存 handle 做发起方**。
- **三处文档未逐字确认（须代码外真 proxy 实验坐实）**：(a) per-key 隔离/master 不动的逐字陈述；(b) OpenAI+Anthropic 双协议同 proxy「同时」并存；(c) block/过期的精确 HTTP 状态码。

---

## 1. RALPLAN-DR 决策摘要

### 1.1 原则
1. **master key 永不离开 Host（本切片真正兑现）**：master key 仅 host-side `mint` 调 `/key/generate` 作 Bearer 用；下发给 worker 的是**派生 virtual key**（受限、独立、可撤销），非 master。master key 入 secret-guard、绝不入 descriptor/DB/log/帧。
2. **per-worker 受限/可撤销/短 TTL 派生 key（兑现蓝图 §4 真主张）**：每 worker 一把 LiteLLM virtual key，绑 budget/rpm/TTL + worker_id metadata；撤销一个员工 = `/key/block` 该 key，不影响他人、不动 master key。
3. **复用 Phase 3 链，不重造**：协议帧/注入/refresh/store 不改（除 broker 接口 async）；secret-guard sk- 已覆盖。
4. **对接外部 LiteLLM，不自建网关**（plan §1.4/§7）：Host 持 endpoint URL + master key-ref；LiteLLM 部署是运营者 infra（文档化最小 docker 形态，不进本仓热路径/不进 Caddy）。
5. **撤销真相源在 LiteLLM**：AIWorker 存 handle 做发起方，LiteLLM Postgres 是裁决方；TTL 短作 backstop（handle 丢失也自然过期）。

### 1.2 决策驱动（top 3）
1. **撤销闭环正确性**：撤销必须真生效（LiteLLM /key/block）+ 立即踢已连 worker + 找得回 handle——三缺口同期建，否则「撤销」是空头。
2. **master key 爆炸半径**：master key 是 root（可签任意 key）；新增 host→LiteLLM Bearer + HTTP 错误体是高危泄漏面。
3. **审计未坐实的文档点**：双协议并存 + block 状态码须代码外真实验坐实（同 EB-1），不拍脑袋进 canon。

### 1.3 可行选项（每决策附就地失效理由）

**D1 broker async 改造**：唯一选项——`mint`/`revoke` 改 `Promise`，同步调用方一起改。无替代（LiteLLM 是 HTTP）。

**D2 撤销 = block vs delete**
- **D2-opt1（选）block（默认）+ 短 TTL backstop**：员工离岗 block（可逆，复职 unblock 同 key）；短 TTL 兜底（handle 丢也自然过期）。✅ 可逆 + 审计 spend 留存。
- D2-opt2 delete：永久不可逆。→ 作「彻底注销」显式选项，非默认。

**D3 host operator 撤销入口形态**
- **D3-opt1（选）host-cli 子命令 `aiworker-host assignment revoke <id>`**（本地 admin，调 revokeAssignment + broker.revoke + 主动 close）。✅ 避开 HTTP operator-auth 死墙（记忆 rc11：session iron-session cookie + provision token hash + dev-admin 被无视，HTTP 撤销端点要重做 operator auth）。
- D3-opt2 HTTP `/api/host/assignments/:id/revoke`：✅ 远程可调。❌ 需接 operator auth（死墙，成本高）。→ 留 Phase-2-host-web 演进，本切片走 CLI。

**D4 key handle 持久化形态 + 撤销 key 引用（Architect must-fix·b：解 block-vs-alias 矛盾 + in-flight 时序洞）**
- **矛盾**：`/key/block` 取**字面 virtual key**，但卫生要求不存明文 key（D4 存 alias）、D2 要可逆 block——三者不能组合（存 alias 却 block 不了字面 key）。且 mint **回写 handle 在 mint 返回后**，撤销若撞 in-flight mint（回写前）→ handle 缺失 → key 活到 TTL = 假撤销（正是 org-key deviation 被批的失败模式）。
- **D4-opt1（选）确定性 alias + revoke-by-alias（对 LiteLLM 自己的视图撤销，非 AIWorker 持久明文）**：mint 时 `key_alias = f(assignmentId, providerKind)`（确定性，如 `aiw-<assignmentId>-<providerKind>`）+ `metadata.worker_id/assignmentId`；revoke 按 **alias/metadata** 让 LiteLLM 找到 key 撤销，**不依赖 AIWorker 持久的 key 引用**。→ **时序无关**（即便 mint 从未回写、撤销也能按 alias 撤）+ 对齐「撤销真相源在 LiteLLM」(§1.1-5)。新列 `host_assignments.gatewayKeyHandlesJson`（providerKind→**确定性 alias**，非明文 key）仅作审计/可见性记录，**不是撤销的必需依赖**。需 DB 迁移。
- **Step0 门控**：「`/key/block` 是否接受 `key_alias`？」是 §S3-Step0 硬门（见下）。若 block 仅接受字面 key → revoke 改「先按 alias `/key/list` 查出字面 key 再 block」或「delete-by-alias（牺牲可逆）」，documented 分支。
- D4-opt2 存明文 key：❌ 新 secret-at-rest 违 §1.1。D4-opt3 metadataJson：❌ 语义混 + 守卫。

**D5 codex 注入恢复（Phase 3 cut 的反转）—— hypothesis-under-test，非断言（Architect honesty fix）**
- **诚实纠正**：「LiteLLM 解除 codex OAuth 顾虑」是**未坐实、很可能为假**的断言。LiteLLM 路由改的是请求**去哪**（若 codex 用 env key），**不改** codex 的凭证**偏好**——codex 偏好存储的 `~/.codex/auth.json` OAuth（engine-credential-store.ts:24-25 注释 + codex doctor 警告）。Phase 3 的 ANTHROPIC_API_KEY 修是 **env 变量**问题；codex 的坎是**存储-OAuth-文件**机制，清 OPENAI_API_KEY 碰不到它。
- **D5-opt2（默认）维持 codex unmapped**：直到 S3-Step0 的 **G-b** 实测坐实「codex 在有存储 OAuth + 注入 env key 时实际优先 env key」。
- D5-opt1（门控恢复）：仅当 G-b 坐实 env key 优先 → 扩 `ENGINE_ID_TO_PROVIDER` 加 `codex→openai` + eager openai。canon 标 codex 恢复门控于实测。

**D6 部署**
- **D6-opt1（选）对接外部 LiteLLM**：Host 配 `_ENDPOINT`+`_MASTER_KEY_REF`+`_MODE=litellm`。✅ 合 plan §7、不进本仓热路径。LiteLLM 部署 = 运营者 infra（RUNBOOK 文档化最小 docker+Postgres 形态）。
- D6-opt2 本仓自部署 LiteLLM：❌ plan §7 明禁、deploy/ 无位置、Caddy 单上游模型不匹配。

---

## 2. 架构设计

### 2.1 签发 + 注入流（drop-in，复用 Phase 3 链）

```
Host 配置(env): AIWORKER_GATEWAY_<PROFILE>_MODE=litellm
   + _ENDPOINT(LiteLLM proxy URL) + _MASTER_KEY_REF(env:LITELLM_MASTER_KEY)
   │
worker tunnel hello(已认证)→ credential_acquire{providerKind}(复用 Phase3 帧)
   ▼
Host credential 分支(host-server.ts:277)→ broker.mint(profile, providerKind)  [async]
   LiteLLM 适配器:POST {endpoint}/key/generate (master key Bearer)
     body: {duration(短TTL), max_budget, rpm_limit, models, metadata:{worker_id, assignmentId}, key_alias}
     ← {key: "sk-virtual...", info:{expires}}
   **回写 handle**:把 key_alias/id 持久化到 host_assignments.gatewayKeyHandlesJson[providerKind] (D4)
   → credential_grant{providerKind, gatewayUrl=endpoint, token=virtual key, expiresAt=真短TTL}(复用帧)
   ▼
worker EngineCredentialStore.set → executor 第三层注入(复用):
   claude-code → ANTHROPIC_BASE_URL=endpoint + ANTHROPIC_AUTH_TOKEN=virtual key (打 /v1/messages)
   codex(若 D5 门控通过) → OPENAI_BASE_URL=endpoint + OPENAI_API_KEY=virtual key (打 /v1/chat/completions)
   近真短 TTL → credential_refresh(复用)→ 重新 mint 新 virtual key
```

### 2.2 撤销闭环（核心新建，三件同期）

```
运营者 `aiworker-host assignment revoke <assignmentId>` (D3 CLI 入口)
   │ 1. **revokeAssignment(assignmentId) 先跑**(set revokedAt,Critic must-fix·1 顺序)
   │    → 之后任何到达的 mint 被 gate 拒(见下)
   │ 2. 由 assignmentId 算确定性 alias = f(assignmentId, providerKind)(各 provider)
   │    (不依赖持久 handle——时序无关,即便 mint 未回写也能撤,D4)
   │ 3. 对每 provider alias: broker.revoke(alias/metadata) → LiteLLM POST /key/block
   │    (Step0 G-a 坐实 block 接受 alias 且 affects-all-historical;否则 documented 分支)
   │    → 撤销前夕已发的 mint(post-block 落)被确定性 alias block 兜住
   │ 4. **主动踢已连 worker**:accessRegistry.closeByAssignment(assignmentId) → ws.close(4401)(新增,
   │    按**内存 accessConnection.assignmentId** 找连接,非 DB lookup——revokeAssignment 已 null workerId)
   ▼
**mint 分支 gate(Critic must-fix·1 关键)**:host-server.ts:287 的 mint 分支当前用**未过滤 getAssignment(不检
revokedAt)**→ 撤销后已连 worker 的 refresh/acquire 仍会 mint 新活 key(证伪 AC#3)。**修:mint 前检 revokedAt,
已撤销则静默不 mint**。气密:撤销前发的 mint 被步骤 3 确定性 alias block;撤销后发的被此 gate 拒。closeByAssignment
对不可信 worker 不足恃(不 honor store.clear),故 LiteLLM 侧 block + host 侧 gate 才是真双保险。
worker(若在线)收 4401 → handleAccessRevoked: 停重连 + store.clear() + clearPersistedAccess(复用 Phase3)
worker(若离线)下次 hello → verifyAssignmentAccessToken 因 revokedAt 拒(已有)
   ▼ 双保险:LiteLLM 侧 key 已 block(引擎请求 401)+ worker 侧 token 已清 + access 已拒
```

### 2.3 secret 边界（master key 新高危面）
- master key 流转：Host env `LITELLM_MASTER_KEY` → host-side mint 的 `Authorization: Bearer`（host→LiteLLM HTTP）→ **绝不下发 worker、绝不入 descriptor/host.db/log/帧/错误体**。
- virtual key（`sk-...`）：LiteLLM → host 内存 → TLS credential 帧 → worker store → 引擎 env；`sk-` 已被 `SECRET_VALUE_RE` 覆盖。
- **新泄漏面靶向脱敏**：host→LiteLLM `/key/generate` 的 Bearer 头 + HTTP 错误体（含 master key 或返回的 virtual key）绝不 log；mint/revoke 错误经 `safeCredentialMintMessage` 式脱敏。AIWorker 只存 **handle（非明文 key）**。
- **确认 master key 前缀**（§0.3 需确认）：若 `sk-` 则已覆盖；若自定义格式须扩正则。

---

## 3. 分步实现（每步独立可验、独立 PR；canon 与对应步同 PR）

### S3-Step0 —— 代码外真 proxy 实验（前置，同 EB-1 法，不写产品码）
起 pinned docker tag 的 LiteLLM(+Postgres)，跑通五步闭环并记录**真实响应**：(1) `/key/generate`(带 metadata.worker_id+max_budget+duration+确定性 key_alias)→拿明文+alias；(2) 用该 virtual key 经 `ANTHROPIC_BASE_URL`(claude-code) **和** `OPENAI_BASE_URL`(codex) 各打真请求，**坐实双协议并存**；(3) `/key/block`→立即重打，**记录引擎拿到的真实状态码**；(4) `/key/info`+`/global/spend/report` 看 worker_id 可审计；(5) `/key/delete` 确认彻底失效。
**两个 gating 硬门（Architect must-fix·e，决定设计而非仅状态码）**：
- **G-a：`/key/block` 是否接受 `key_alias`（而非仅字面 key）？** 决定 revoke 机制（D4）能否 by-alias 撤销。**接受**→ revoke-by-alias 成立；**不接受**→ documented 分支（先 `/key/list` 按 alias 查字面 key 再 block，或 delete-by-alias 牺牲可逆）。
- **G-b：codex 是否 honor 注入的 virtual key 而非其存储的 `~/.codex/auth.json` OAuth？** 决定 D5 codex 恢复。注意这是**存储-OAuth-文件机制**，非 env 变量——LiteLLM 路由**不改变** codex 的凭证偏好，必须实测 codex 在有存储 OAuth + 注入 env key 下实际用哪个。**坐实 env key 优先**→ D5 恢复；**否则**→ codex 维持 unmapped。
- **G-c：`/key/generate` 对重复 `key_alias` 的语义 + `/key/block`(或 delete)-by-alias 是否影响全部同 alias 历史 key？（Critic must-fix·2，确定性 alias 是撤销承重件）** 每次正常 `credential_refresh` 都用同一 `f(assignmentId,providerKind)` alias 重 mint。三结局据此定 S3-Step1 refresh 行为：(i) **alias 须唯一** → refresh 用「先 block/delete 旧 alias 再 generate 新」或带 suffix（但撤销须能枚举）；(ii) **允许重复** → refresh 直接 generate，撤销 block-by-alias 须 affects-all；(iii) 二者皆否 → 退回持久 handle（牺牲时序无关，documented）。**G-c 必须先于 S3-Step1 实现 mint/refresh 坐实**。
**坐实 §0.3 三推断点 + G-a/G-b/G-c 后**才把字段表/状态码/机制 promote 进 spec/canon。结论写 tmp/ 实验记录（与 §0.3 同一 proxy run，一次跑完）。

### S3-Step1 —— broker async + LiteLLM 适配器 + Host 配置（canon 先行）
- **canon 先行**：`docs/protocol.md`/`runtime.md` 标 broker async + LiteLLM 模式（master key 不离 Host、virtual key 派生、撤销靠 /key/block）。
- broker 接口 `mint`/`revoke` 改 `Promise<...>`；同步调用方 `host-server.ts:294`（已在 async handler 内）+ org-key 适配器（包 async resolve）+ 测试一起改。
- `createLiteLlmCredentialBroker`：`mint` 调 `/key/generate`（Step0 坐实的字段：duration 短 TTL + max_budget + rpm + models + metadata{worker_id,assignmentId} + 确定性 key_alias）→ 返 grant（token=virtual key, gatewayUrl=endpoint, expiresAt=真过期）；`revoke(aliasOrHandle)` 按 alias 调 `/key/block`（默认）→ `{supported:true}`。**HTTP 调用加显式 timeout（Architect minor·a）**——现有 15s 超时只覆盖 request/response pending map，不覆盖 broker mint；hung LiteLLM 调用会 leak pending 连接 / 永久 stall fire-and-forget acquire。适配器 HTTP 错误**不在适配器内 raw-log**，throw 出去经 host-server `safeCredentialMintMessage` 脱敏（见 S3-Step5）。
- Host 配置：`AIWORKER_GATEWAY_<PROFILE>_MODE`(litellm|org-key) + `_ENDPOINT` + `_MASTER_KEY_REF`（复用 `resolveOrgKeyRef`/重命名 `resolveGatewaySecretRef`）；`host-lifecycle.ts:480` 按 mode 分流 org-key vs litellm 适配器。
- **refresh 重 mint 行为按 G-c 定（must-fix·2）**：每次 `credential_refresh` 用同一确定性 alias 重 mint —— 据 Step0 G-c 结论选「先 block/delete 旧 alias 再 generate」(alias 须唯一) / 「直接 generate + 撤销 block-affects-all」(允许重复) / 退回持久 handle(二者皆否)。**G-c 未坐实前不实现 refresh 重 mint**。
- **验证**：LiteLLM 适配器单测（**注 fake HTTP，不真调 LiteLLM/不烧额度**）：mint 发对 /key/generate 请求体(含确定性 alias) + 解析 sk- 返 grant；revoke 按 alias 调 /key/block；refresh 重 mint 行为(按 G-c)；master key 仅作 Bearer 不泄；HTTP timeout 生效。

### S3-Step2 —— key handle 持久化（D4，撤销前置）
- DB 迁移：`host_assignments` 加 `gatewayKeyHandlesJson`（providerKind→handle map，存 key_alias/id **非明文 key**）。
- `HostCredentialHandle`（broker 接口）扩携 handle（per-provider）。
- mint 成功后回写 handle 到 assignment（host-server.ts credential 分支，按 assignmentId）。
- **验证**：迁移测试；mint 回写 handle 单测；handle 非明文 key（assertNoLiteralSecrets 不误伤、且不存明文）。

### S3-Step3 —— 撤销闭环（核心新建）
- `accessRegistry.closeByAssignment(assignmentId)`（新增，**按内存 accessConnection.assignmentId 迭代找连接** ws.close(4401)；注意 accessRegistry 现仅按 workerId 索引、revokeAssignment 已 null workerId，故必须用内存连接的 assignmentId 不能 DB lookup）。
- **mint 分支 gate revokedAt（must-fix·1 关键）**：host-server.ts:287 credential 分支 mint 前检 `getAssignment(assignmentId).revokedAt`，已撤销则静默不 mint（防 mint-after-revoke 给已连 worker 发新活 key）。
- host-cli 子命令 `aiworker-host assignment revoke <id>`（D3），**顺序（must-fix·1）**：(1) `revokeAssignment` 先（set revokedAt，之后 mint 被 gate 拒）→ (2) 算确定性 alias → `broker.revoke(alias)` 对每 provider（兜撤销前夕的 mint）→ (3) `closeByAssignment`。诚实输出（revoke 成功/部分失败/**alias 从未 mint 也 clean no-op 不崩**）。
- **验证**：撤销集成测试（注 fake broker + fake ws）：**mint-after-revoke——已连 worker 撤销后发 refresh/acquire → mint 被 gate 拒不发新 key**（must-fix·1 核心断言）；revoke 调 /key/block + revokeAssignment + 主动 close；worker 收 4401 清 store；离线 worker 重连被拒；alias 从未 mint 的撤销 clean no-op。

### S3-Step4 —— codex 注入恢复（D5，门控）+ ANTHROPIC_API_KEY 冲突修复
- **门控**：仅当 Step0 坐实「codex 经 LiteLLM 用 virtual key 真跑通」→ 扩 `ENGINE_ID_TO_PROVIDER` 加 `codex→openai` + eager acquire 加 openai；否则维持 unmapped（canon 标 codex 仍受限直至坐实）。
- **ANTHROPIC_API_KEY 冲突修复（Phase 3 review follow-up，Architect confirm）**：注入 anthropic 时 unset/empty 冲突的 `ANTHROPIC_API_KEY`、注入 openai 时同样清 `OPENAI_API_KEY`（**两个 carrier 都覆盖**）使 Bearer/virtual key 无歧义胜出；Step0/e2e 的 real-engine gateway-routing 实跑坐实「**引擎真用注入的 token**」（非只 env 含载体）。
- **验证**：codex 注入单测（门控通过后）；冲突修复单测（注入时冲突 key 被清）；real-engine gateway-routing smoke（Step0 实验 + e2e）。

### S3-Step5 —— secret-guard（master key）+ e2e + canon
- master key 脱敏 = **验证路由 + 前缀，非从零建（Architect·d）**：`safeCredentialMintMessage`（host-server.ts:1038）**已**脱 `sk-`/`sk-ant-` + 任意 ≥32 串 + 截 240——master key 须 `sk-` 开头（§0.3）且 ≥32 → **已被覆盖**。本步只需：(1) 确保 LiteLLM 适配器 HTTP 错误**经此 catch**（不在适配器 raw-log）；(2) Step0 确认 master key 前缀 `sk-`（若自定义格式扩正则，但 ≥32 串规则已兜底）。
- **e2e（进 Phase 2/3 独立门 `release:check:phase2`，不焊 v1）**：**注 fake LiteLLM HTTP server**（应答 /key/generate 返 fake sk-+handle、/key/block）——真签发→注入 env→撤销调 /key/block→key 失活，**全程哨兵零泄漏**（master key + virtual key 不出现 log/DB）。
- canon：`architecture.md`（切片 3 自有签发闭环 + 切片 2/3 成熟度边界终态：org-key v1 → litellm 真签发；**显式标 §4「master key 永不离开 Host」由本切片真兑现，Phase 3 org-key 的「落盘整把 master secret」倒退至此解决——落盘物现为有界可撤销 virtual key**）；`runtime.md`（litellm 模式注入表 + 撤销闭环 + 审计 + master key 边界）；`docs/testing.md`（切片 3 forcing functions）；RUNBOOK 最小 LiteLLM docker+Postgres 部署形态（运营者 infra）。

---

## 4. Pre-mortem（6 场景）

1. **master key 泄漏（最高危——root 等同）**。缓解：master key 仅 Bearer、绝不下发/log/入帧；§2.3 靶向脱敏 TDD 先写；e2e 哨兵扫 master key 零命中；确认前缀在正则。
2. **撤销空头：block-vs-alias 矛盾 + in-flight mint 时序洞 + mint-after-revoke + refresh-alias 碰撞（key 活到 TTL=假撤销）**。缓解（Architect+Critic must-fix）：**双向覆盖**——(撤销→既有 key) revoke 按确定性 alias 对 LiteLLM 视图撤销不依赖持久 handle = 时序无关；(acquire/refresh→mint 方向) **mint 分支 gate revokedAt 拒撤销后 mint** + revokeAssignment 先跑设序；(refresh 重 mint) G-c 坐实 duplicate-alias 语义定行为。closeByAssignment 主动踢（对配合的 worker）；LiteLLM block + host gate 是对不可信 worker 的真双保险；短 TTL 仅额外 backstop。
3. **双协议/codex 经 LiteLLM 不通（文档未坐实）**。缓解：S3-Step0 真 proxy 实验门控 D5；不通则 codex 维持 unmapped、canon 诚实标。
4. **block 后引擎状态码未知 → worker 不优雅失败**。缓解：Step0 记录真实状态码 → worker 错误映射（复用切片 1 优雅失败）。
5. **TTL > refresh cap(~24.8d) 致不刷新**。缓解：LiteLLM key duration 设短（< cap），文档约束；refresh 链已有 cap 守卫。
6. **broker async 改造漏改同步调用方 → 编译/运行错**。缓解：grep 全调用方一起改（host-server.ts:294 + org-key 适配器 + 测试）；typecheck 独立验。

---

## 5. 扩展测试计划

| 层 | 覆盖 | 注入/隔离 |
|---|---|---|
| **代码外实验(Step0)** | 真 LiteLLM 五步闭环、双协议、block 状态码 | pinned docker（一次性，结论进 spec） |
| **unit** | LiteLLM 适配器 mint/revoke（注 fake HTTP）；broker async；handle 回写；closeByAssignment；codex 映射（门控）；ANTHROPIC_API_KEY 冲突清除 | fake HTTP，**不真调 LiteLLM/不烧额度** |
| **contract** | broker async 接口；handle 持久化形态；master key/virtual key 脱敏（host→LiteLLM Bearer+错误体+帧 dump 哨兵） | 共享/已知值脱敏 |
| **integration** | 撤销闭环（revoke→/key/block+revokeAssignment+closeByAssignment→worker 清 store）；离线 worker 重连被拒；mint→handle 回写→撤销全链 | in-proc fake LiteLLM + fake ws |
| **e2e（Phase2/3 独立门）** | 真签发→注入→撤销→key 失活 + 哨兵零泄漏（master+virtual key） + real-engine gateway-routing(坐实引擎真 honor) | fake LiteLLM HTTP server，真 worker 进程 |
| **observability** | 撤销成功/部分失败/handle 缺失诚实输出；per-worker spend 审计可见；block 后引擎优雅失败 | —— |

**Forcing functions**：master key 脱敏 gate + 真签发/撤销 e2e 进 **Phase 2/3 独立门**，不焊 v1 release:check。

---

## 6. ADR

- **Decision**：作 Phase 3 broker 接口的 LiteLLM drop-in 适配器（接口改 async），mint 调 `/key/generate` 签发 per-worker 受限 virtual key（budget/rpm/短 TTL/worker_id metadata），revoke 调 `/key/block`；新建撤销闭环（host-cli 撤销入口 + key handle 持久化 + 主动 closeByAssignment）；对接外部 LiteLLM（Host 持 endpoint+master key-ref），不自建。复用 Phase 3 协议帧/注入/refresh/store 不改。
- **Drivers**：撤销闭环正确性；master key 爆炸半径；文档未坐实点须真实验。
- **Alternatives considered**：delete 替 block（降级为彻底注销选项）；HTTP 撤销端点（降级：operator-auth 死墙，留 host-web 演进，本切片走 CLI）；metadataJson 存 handle（淘汰：语义混 + 守卫）；自建 LiteLLM（淘汰：plan §7 禁）；codex 维持 unmapped（门控回落）。
- **Why chosen**：drop-in 接口让切片 3 零协议改动接入；block 可逆 + 短 TTL backstop + 主动踢 = 撤销真生效；外接 LiteLLM 守边界、master key 不离 Host 真兑现 §4。
- **Consequences**：broker 接口 breaking 改 async（调用方一起改）；新 DB 列 + 迁移（handle map）；新 host-cli 撤销子命令 + accessRegistry.closeByAssignment；运营者须自部署 LiteLLM(+Postgres)（RUNBOOK 文档化）；master key 是新高危泄漏面；codex 恢复门控于 Step0 实验。
- **Follow-ups**：HTTP/host-web 撤销端点（需 operator auth）；per-worker spend 审计看板（LiteLLM /global/spend/report 已提供数据）；master key 轮换（LiteLLM 支持，带 grace period）；Portkey 托管替代（若需免运维控制面）。

---

## 7. 风险与协调
- **R1 master key 高危**：仅 Bearer、绝不下发/log；靶向脱敏 TDD 先写；e2e 哨兵。
- **R2 撤销闭环三缺口同期**：handle 持久化(S3-Step2) 必须先于撤销入口(S3-Step3)；缺一则撤销空头。
- **R3 文档未坐实**：S3-Step0 真 proxy 实验门控双协议 + codex + block 状态码，坐实才进 canon。
- **R4 broker async 波及面**：grep 全同步调用方一起改 + 独立 typecheck。
- **R5 不自建网关**：对接外部 LiteLLM，部署是运营者 infra（RUNBOOK），不进本仓热路径/Caddy。
- **R6 审计成熟度**：测试进 Phase 2/3 独立门；TTL < refresh cap。
- **R7 并发共享树**：实现前重核 git status。

---

## 8. 验收标准（可测、可证伪）
1. S3-Step0 真 proxy 实验记录：双协议并存 + block 状态码 + 五步闭环坐实（结论进 spec）。
2. worker 首回合 native 引擎用 **LiteLLM 签发的 per-worker virtual key**（非 org key 原样）经 proxy 真跑通；virtual key 绑 budget/rpm/短 TTL/worker_id metadata。
3. 运营者 `aiworker-host assignment revoke <id>` → LiteLLM `/key/block` 真调 + revokeAssignment + **已连 worker 被主动踢（4401）清 store** + 离线 worker 重连被拒；不影响他人 key。
3b. **mint-after-revoke 气密（must-fix·1）**：撤销后已连 worker 发 `credential_refresh`/`acquire` → host mint 分支 gate revokedAt **不发新 key**；撤销前夕发的 mint 被确定性 alias `/key/block` 兜住。**不依赖不可信 worker honor store.clear**。
4. master key + virtual key 真值**零出现**于 host.db/worker.db/log/diagnostic/credential 帧 dump/mint·revoke 错误体（哨兵扫描，含 host→LiteLLM Bearer 路径）。
5. master key **绝不下发 worker**（worker 只持派生 virtual key）；兑现「master key 永不离开 Host」。
6. codex 注入恢复**门控于 Step0 实验坐实**；未坐实则维持 unmapped + canon 诚实标。
7. ANTHROPIC_API_KEY 冲突修复 + real-engine gateway-routing 坐实「引擎真 honor 注入」。
8. canon（protocol/runtime↔Step1、architecture/testing↔Step5）同 PR；RUNBOOK 含最小 LiteLLM 部署。
9. 切片 3 测试在 Phase 2/3 独立门通过，未焊 v1 release:check。

---

## 9. 执行前置
- 本计划经 Architect/Critic 共识（**Architect SOUND-WITH-CONCERNS→并入 / Critic APPROVE**）→ **先做 S3-Step0 真 proxy 实验**（门控 D5 + 坐实 §0.3 三点 + G-a/G-b/G-c），**S3-Step0 必须先于 S3-Step1**（refresh 机制依赖 G-c 实测结果），再各 Step 拆独立 PR 交 team/ralph 执行。
- **执行者 open question（Critic advisory，非阻塞）**：(i) `accessRegistry` 现按 workerId 索引（`removeIfCurrent(ws.data.workerId,…)`），`closeByAssignment` 须新增 assignmentId 索引或廉价迭代连接找 assignmentId 匹配；(ii) `/key/block` 对从未 mint 的 alias（revoke-before-any-mint）须 clean no-op/404 不让 revoke CLI 报错（S3-Step3 诚实输出须覆盖「alias 从未 mint」）。
- LiteLLM 部署（docker+Postgres）是运营者 infra：本切片只做 AIWorker 侧适配器 + 撤销闭环 + 配置 + RUNBOOK 文档，不在本仓自部署网关。
