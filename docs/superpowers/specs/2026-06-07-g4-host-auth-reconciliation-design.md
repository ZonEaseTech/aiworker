# G4 ↔ Logto-auth 语义 reconciliation 设计

日期：2026-06-07

状态：已认可设计（brainstorming 收敛）。这是 A1 架构决策的决策记录 + 落地设计。

## Plain Judgment

最近的 Logto session-auth 工作（06-06/07）在 host-cli 引入了 Host 自身的登录认证，使 `tests/architecture/inversion-guards.test.ts` 的 **G4 inversion-guard** 在 host-* 源里报 ~15 处 `session`/`secret`/`domain` 归属违规，导致 **`test:contracts`（release:check 门）红**。

逐处核证后，那 ~15 处**每一个都是 Host 自身的 Logto 认证**（登录 session / OIDC client-session-app secret / email 域门），**没有一个**是 Host 拥有 Worker 的 chat session / native engine secret / domain 业务态。

`docs/architecture.md` 一方面写 "Host must not own session, invocation, projection, engine processes, domain state, or secrets"，另一方面 Phase 2.1 钦定 "Host as the enterprise URL and authorization boundary for employees"、managed access 走 "Host → Logto → assignment"。两句对 session/secret/domain 指**不同的东西**：前者指 **Worker 归属**，后者是 **Host 自身 auth**（Phase 2.1 合法职责）。

**裁定（用户确认）**：G4 的本意 = 禁 **Worker 归属**。Host 自身 Logto auth 合法。问题是**守卫不精确**，要编码这个区分——不是 Logto 代码越界要重构。

## 决策

采用**方案 A：Host-auth 模式排除（保持 deny-list）**。

否决的备选：
- 方案 B（auth sub-plane 文件隔离）：要先重构 `aiworker-host.ts`/`host-server.ts`/`host-lifecycle.ts` 这些 auth+控制混合文件，超出"只改守卫"的裁定。
- 方案 C（翻成 Worker 归属 match-list）：把 deny-list 退成 match-known-bad，**削弱守卫**——新越界用意外名字就漏。安全守卫不该变弱。

## 设计

### ① 严扫类（不变）：`invocation` / `projection` / `engine`
无歧义的 Worker-runtime 归属，Host 无合法用法。证据：改前全量扫描 host-* 源**只有** session/secret/domain 触发，这三个未出现。保持裸-token deny-list 原样严扫。

### ② 歧义类（精化）：`session` / `secret` / `domain`
扫描前先剔除一个**显式、可审计的 Host-auth 标识符 allowlist**，再对剩余内容做 deny 扫描。allowlist 按语义分三组、每组带理由注释：

- **登录 session**：`hostSession*`、`sessionAuth`、`sessionSecret`、`sessionCookie*`、`readUserFromSessionCookie`、`buildSessionAuthFromEnv`、`hasAnySessionEnv`、`assertHostSessionSecret`、`isHostSessionPayload`、`logtoSessionRequiredEnvKeys`、`hostSessionAuthEnv`
- **OIDC 凭证**：`clientSecret`、`mAppSecret`、`readApplicationSecret`、`*applicationSecret`、`deprecatedSecret`
- **email 域门**：`allowedEmailDomains`、`allowedDomains`、`emailBelongsToAllowedDomain`、`emailDomain`

实现层面：扫描在 `stripComments(read(file)).toLowerCase()` 之后；用一组小写化的 allowlist 子串/正则把上述标识符从 code 中 `replace(...,'')` 剔除，再跑 `code.includes(token)`。allowlist 是源码级常量 + 注释，集中在 G4 测试内（或就近 helper）。

### 为什么"显式 allowlist"而非"宽正则"
- **可审计**：一眼看清放行了哪些，不会因宽模式（`logto*`/`*secret`）意外放行将来真违规。
- **防后门**：窄到无法把"Host 拥有 Worker secret"伪装进去；新增 auth 标识符**必须显式加进 allowlist** = 强制一次 review（优点）。
- 代价：偶有维护，但每次触发有意识审查。

### 守卫意图注释更新
G4 的 doc-comment 从"host-* 不出现 session/invocation/projection/engine/domain/secret"改为准确表述：
> host-* 控制面不得携带 **Worker 的** session/invocation/projection/engine/native-secret/domain-业务态归属；Host **自身**的 Logto 登录 session / OIDC 凭证 / email 域门是 Phase 2.1 钦定的合法职责，按显式 allowlist 排除。

## Acceptance Criteria

- [ ] `bun run test:contracts` 转绿（G4 不再对 ~15 处 Host-auth 误报；其余 192 pass 保持）。
- [ ] `engine`/`invocation`/`projection` 仍裸-token 严扫（未被 allowlist 影响）。
- [ ] **负向断言**：构造一个伪造的真违规（host 源出现 `workerChatSession` 或 `engineSecret` 之类 Worker 归属标识符），G4 仍 fail——证明排除没削弱守卫、没开后门。
- [ ] allowlist 每条带语义分组注释；G4 doc-comment 更新为 Worker-归属 表述。
- [ ] 不改任何 host-* 产品源（这是改守卫，不是改 Logto 代码或重构）。

## Non-Goals

- 不重构 Logto auth 代码、不拆分 auth sub-plane（方案 B 已否决）。
- 不碰其余 A2-A5 预先存在门（host-single-serve / worker-runtime typecheck / repo lint / smoke migrationsReady）——本 spec 仅 A1；A2-A5 可在实现计划里作为同一"release:check 收绿"批次的并列项，但各自独立。
- 不动 WS2 / 拱顶石 / GA backlog。

## 关联

- 守卫：`tests/architecture/inversion-guards.test.ts` G4（约 :179-202）。
- 触发源：`apps/host-cli/src/{aiworker-host,host-lifecycle,host-oidc-client,logto-auth,host-server,host-session-cookie,logto-app-config}.ts`。
- 上游决策：`.omc/plans/ralplan-phase2-managed-access-rc.md`（WS1 已落地 commit 5cea7ef2）；本 A1 属"分支健康/release:check 收绿"轨。
- memory：`MCP secret-guard 不对称` deferred 项的同源问题。
