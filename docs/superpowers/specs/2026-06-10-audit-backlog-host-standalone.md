# 审计 backlog:host 独立 (host standalone)

- 日期:2026-06-10
- 状态:tracking backlog(来自闭门造车审计,逐条可追踪)
- 来源:tmp/aiworker-audit-2026-06-10/report.md + findings.json
- 范围:Host 控制面自身(Phase 2 控制面) —— auth/Logto(auth-\*)、host-web、host 控制面是否过度建造(系统级 SL-1 的 host 部分)。Host 是可选控制面:Soul 发布/分发/管理/权限分配/connector 授权/Worker provisioning。
- 相关线:auth-3(worker list 恒空)与 auth-5(token 哈希)虽按前缀归此线,但主题属 provision/check-in/token,与 host-worker 联调 spec 的 WAT-2(token TTL)成对;auth-1(手搓 OIDC)是系统级 SL-5(全仓默认手搓)在 host 侧的实例,SL-5 伞 finding 在 worker 独立 spec。
- 说明:本轮审计未产出独立 host-web ID 的 finding(host-web 的 UI 交互在更早的 host-web UX 轮次已收;本 backlog 的 host 侧问题集中在 auth/控制面建造度)。WWB-\* 全部是 worker-web,不在此线。

## 概览

本线 finding 计数(5 条 auth + 1 系统级):
- high:SL-1(host 过度建造,系统级)
- medium:auth-1(手搓 OIDC)、auth-3(worker list 恒空)
- low:auth-2(死 Bearer provider)、auth-4(死状态机)、auth-5(scrypt 误用)
- 已解决:0;全部 ⬜ 待办。
- 驳回:本线无。

## Findings

### SL-1 · 整个 Phase 2 控制面对一个未发布的 standalone-first v1 是过度建造 `[high][premature-scope][⬜ 待办]` `[系统级]`

- **现状/问题**:`AGENTS.md:35` 把 host-\* 定义为「Phase 2 休眠桩」、`AGENTS.md:25` + `architecture.md:23/47` 称控制面「永不在运行热路径上」,但实建是 **6215 非测试 LOC** 工作系统:host-cli ~5500(host-server.ts 1064 + host-lifecycle.ts 629 + Logto OIDC host-oidc-client.ts 369 + logto-app-config.ts 635 + host-session-cookie.ts 163)、host-web 2257、host-control 669、worker-control-protocol 479,加 worker-daemon 内 412 反向隧道。已部署生产 rc.10 两台互联、Phase 2.1 在生产真跑,而 standalone v1 至今未发 npm latest;发版长河(rc.2→rc.10)churn 主体是 Phase 2 —— 顺序倒置 + 真金白银维护税 + Phase 2 flake 焊进 v1 发版门。
- **证据**:`AGENTS.md:25/35`、`architecture.md:23/47`、`AGENTS.md:81`(pre-1.0 destructive-refactor 政策);host-\* LOC 统计见 report.md SL-1。
- **建议**:**不是「全砍」**(Phase 2.1 已部署、有真实员工在用,删除破坏已上线 managed-access),而是「冻结扩张 + 划成熟度边界」:(1) 立即停止把 Phase 2 抛光到产品级(停 host-web UX 迭代、停把更多打磨投入控制面)直到 v1 底座发布;(2) 把 standalone v1 发布(npm latest)提为第一优先作 forcing function;(3) 把 Phase 2 browser/tmux 测试移出 v1 确定性 release:check 改 Phase 2 独立门(见 worker 独立 spec TGA-4,已部分由 PR #26 落地);(4) Phase 2 新增能力一律 YAGNI 推迟到正式开工,借 AGENTS.md:81 —— 现在重建比背维护税划算。
- **状态**:⬜ 待办(总纲;本线 auth-\* 与 host-worker 联调 spec 的 SL-2/SL-4 是其具体落点)。

### auth-1 · 手搓 Logto OIDC Authorization-Code+PKCE,认证级 openid-client(jose 同作者)就在隔壁 `[medium][reinvented-wheel][⬜ 待办]`

- **现状/问题**:`host-oidc-client.ts` 手实现全套 confidential-client 流(discovery + per-issuer Map 缓存、PKCE S256、authorization-URL + state + nonce、code POST + Basic client_secret、id_token jwtVerify + nonce),CSRF state 校验手接在 host-server.ts;`jose ^6.1.0` 已是依赖。代码经核验正确 —— 这是维护面论证非 bug,手维护认证协议 RP 逻辑意味 token-endpoint auth method/discovery edge case/alg pinning 全是团队负担。
- **证据**:`host-oidc-client.ts:38-67`(discovery+cache)、`:224-256`(PKCE+state+nonce)、`:96-158`(code POST + id_token verify)、`host-server.ts:410`(state 校验);`jose ^6.1.0` 已 import。
- **建议**:用 [openid-client(panva)](https://github.com/panva/openid-client) 替换 discovery/PKCE/authorization-URL/code-exchange/id_token-verify 编排(~250/370 行),**保留**现有 stateless 签名 cookie session 与 returnTo allowlist。**明确不要采用 @logto/node** —— 其 getContext() session 模型会持久化 Logto token、违反 secret 边界。Phase 2 尚未发布,现在迁移成本最低(无生产迁移),应在 Phase 2 ship 前做。
- **状态**:⬜ 待办。

### auth-3 · WorkerRegistry + worker list 接线使该命令结构上恒返空列表 `[medium][known-pitfall][⬜ 待办]`

- **现状/问题**:`createWorkerRegistry()` 是 in-memory Map,CLI 每次调用新建 registry,`worker list` 打印 `registry.list()` 是唯一消费者;全仓无生产 `WorkerRegistry.register()/.assign()` —— server 注册的是不同对象 accessRegistry,故 `worker list` **结构上永远打印 `{"workers":[]}`**,侵蚀运营者信任。
- **证据**:`host-control/src/index.ts:32-51`(in-memory Map)、`aiworker-host.ts:498/506-509`、`host-server.ts:233`(注册的是 accessRegistry)、`host-server.ts:586`(listAssignments 真源)。
- **建议**:要么移除 `worker list` + WorkerRegistry 直到有持久化视图,要么用真实真源支撑 —— 命令名「worker list」**liveness 语义优先 accessRegistry**(当前已连接/check-in 的 worker;若意在「全部 assignment」则用 listAssignments())。**不要 ship 输出恒空的运营者命令。**
- **状态**:⬜ 待办(medium:误导但 Phase 2 off-hot-path,非 data-loss/security)。

### auth-2 · createLogtoAuthProvider(Bearer/M2M JWT 路径)+ 手搓 JWKS memo/retry 全建但从不接入运行的 Host `[low][unnecessary(downgraded)][⬜ 待办]`

- **现状/问题**:全仓 grep `createLogtoAuthProvider` 仅在定义 + test、零生产 caller;运行 server 只选 cookie 或 static provider;手搓 lazy jwksPromise memo + null-on-error retry wrapper **只存在于死代码内**(live OIDC 路径直调 createRemoteJWKSet 无 wrapper)。
- **证据**:grep(仅 logto-auth.ts:46 + test)、`host-server.ts:154-157`(只选 cookie/static)、`logto-auth.ts:68-90`(死 wrapper)、`host-oidc-client.ts:144`(live 路径无 wrapper)。
- **建议**:删 `apps/host-cli/src/logto-auth.ts` 及其 test 直到有真实 machine/API-token 消费者。日后真需 Bearer 路径时直调 jose `createRemoteJWKSet` 依赖其内建缓存/cooldown(默认 30000ms),不要重加 memo/retry wrapper。低优先 cleanup 非 security fix(不可达代码非活攻击面)。
- **状态**:⬜ 待办(medium→low downgrade)。

### auth-4 · 两套并行 assignment 状态机:声明式 canAdvanceAssignment 表零 caller,8 态中 3 态从不产生 `[low][unnecessary][⬜ 待办]`

- **现状/问题**:`assignment.ts` 8 态 union + allowedTransitions 表,`canAdvanceAssignment` 仅在定义 + test 引用、零生产 caller;真正强制是 storage 侧 WHERE-clause precondition(SQLite 原子 check-and-set);storage 只写 5 态,draft/needs_attention/archived 从不产生。
- **证据**:`assignment.ts:23-32/46`、grep(仅定义+test)、`storage-sqlite/src/host/index.ts:358-363/428-435/452-460/381-388`(WHERE-clause 强制)。
- **建议**:**删**惰性声明式 allowedTransitions/canAdvanceAssignment + 3 个不可达态。**不要采用「storage 查 canAdvanceAssignment」臂** —— 会把原子 WHERE-clause check-and-set 换成 TOCTOU-prone read-then-write。WHERE-clause precondition 机器留作单一真源。
- **状态**:⬜ 待办(low:死/误导代码非活缺陷)。

### auth-5 · scrypt 慢哈希用在 256-bit 随机 provision/access token 上,明文 SHA-256 即满足 breach-resistance `[low][contradicts-best-practice][⬜ 待办]`

- **现状/问题**:token = `prefix + randomBytes(32)`(~256 bit CSPRNG),`hashProvisionToken` 用 `scryptSync` memory-hard 默认,`verifyAssignmentAccessToken` 在**每个 WS 隧道 hello 帧** + 每次 check-in 跑 scrypt。对 ~256-bit CSPRNG token,salted SHA-256/HMAC 提供完全相同的 breach-resistance;adaptive KDF 是为保护**低熵密码**(OWASP Session Management)—— scrypt cost 零收益却烧 memory-hard CPU。
- **证据**:`storage-sqlite/src/host/index.ts:546-552`(token 生成)、`:554-558`(scrypt)、`:560-567 + 395-414`(每 hello/check-in 跑)、`host-server.ts:193`(hello invoke)。
- **建议**:高熵 awp_/awt_ token 用 salted SHA-256(或 HMAC-SHA256)替 scryptSync,保留 timing-safe 比较。scrypt/Argon2 留给未来低熵 secret。(注:finding 的「hot path docs want cheap」措辞不精确 —— 隧道 hello 是 Phase-2 控制面非 v1 doc-defined hot path,但 recommendation 独立成立。)
- **状态**:⬜ 待办(与 host-worker 联调 spec 的 WAT-2 token TTL 同属 Phase 2 token 模型)。

## 附录:已驳回(本线相关)

本线无被 verify 驳回的 finding。
