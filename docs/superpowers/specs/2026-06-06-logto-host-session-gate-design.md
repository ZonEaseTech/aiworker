# Logto Hosted Login + Host Session Gate Design

日期：2026-06-06

状态：已完成产品与技术设计，等待用户审阅后进入 implementation plan。

## 背景

Phase 2 MVP 已经落地 assignment、Worker check-in、readiness、Host assignment gate、Access Adapter framed helper 等基础能力。但 Logto 当前只完成了后端 JWT/JWKS adapter 合同验证，还没有真实浏览器登录链路。

本设计把 Logto 集成从“能验证 Bearer JWT”推进到“真实用户通过 Logto 托管登录进入 AIWorker”。AIWorker 不写登录页，不实现密码、验证码、MFA、SSO 或注册 UI。Logto 负责登录体验，Host 负责 callback、签名 session cookie、企业邮箱限制和资源授权。

方案名：

```text
Logto 托管登录 + Host Session Gate
```

## 目标

第一版目标是本地真实 proof：

```text
用户访问 /host 或 /workers/:workerId
-> Host 发现未登录
-> 跳转 Logto 托管登录页
-> 用户用 zonease.org 企业邮箱登录
-> Logto 回调 /auth/callback
-> Host 校验 OIDC 身份并写入 HttpOnly signed cookie
-> 用户回到原 URL
-> Host 用 session 身份做 /host role gate 或 /workers assignment gate
```

完成后，Phase 2 MVP 的身份闭环从 B 级提升到 A 级证据：

- B 级：本地 JWKS/JWT adapter 测试通过。
- A 级：真实 Logto tenant + 真实浏览器 redirect/callback + Host session cookie + assignment 授权 proof。

## 当前前置条件巡检

### 已满足

- 根 `.env` 存在 Logto M2M/setup 字段：
  - `LOGTO_M2M_APP_ID`
  - `LOGTO_M2M_APP_SECRET`
  - `LOGTO_M2M_ISSUER`
  - `LOGTO_M2M_ENDPOINT`
- 根 `.env` 被 `.gitignore` 覆盖，不进入 git。
- `apps/host-cli/src/logto-auth.ts` 已有 `createLogtoAuthProvider`，能验证 Bearer JWT 的 issuer、audience、JWKS、`email_verified`。
- `packages/host-control/src/auth.ts` 已有 `AuthProvider` 抽象。
- `apps/host-cli/src/host-server.ts` 的 Host assignment API、options API、Worker route 已经消费 `authProvider`。
- `packages/host-control/src/assignment.ts` 已有 `userCanOpenWorker`，按 assignment email 判断 Worker 访问权。
- Access Adapter 已清洗 `authorization`、`cookie`、`set-cookie`、`proxy-authorization`，不会把浏览器登录态透传给 Worker。
- 现有聚焦测试通过：
  - `logto-auth.test.ts`
  - `host-server.test.ts`
  - `assignment.test.ts`
  - `access-adapter.test.ts`

### 未满足

- 没有 `/auth/login`。
- 没有 `/auth/callback`。
- 没有 `/auth/logout`。
- 没有 `/api/auth/me`。
- 没有 OIDC transaction cookie：state、nonce、PKCE verifier、returnTo。
- 没有 Host signed session cookie：`aiworker_session`。
- `/host` 目前不是真实登录门禁。
- 当前 adapter 要求 `email_verified=true`，但尚未强制 `@zonease.org`。
- 没有 Logto Management API client 自动确认 Web App redirect URI。
- 没有真实 browser proof。

结论：可以进入实现计划，但实现范围不是“增强已有登录”，而是“把 JWT adapter 升级成真实 Logto Hosted Login + Host signed-cookie session gate”。

## 产品体验

### 管理员

管理员访问 `/host`：

```text
未登录 -> 跳 Logto -> 登录 zonease.org 企业邮箱 -> 回 /host
```

回到 Host 后：

- 有 `host:admin` 角色：进入 Host 管理界面。
- 没有 `host:admin` 角色：返回 403。

### 员工

员工访问 `/workers/:workerId`：

```text
未登录 -> 跳 Logto -> 登录 zonease.org 企业邮箱 -> 回 /workers/:workerId
```

回到 Host 后：

- Host 查 `workerId` 对应 assignment。
- 登录邮箱必须等于 `assignment.assignedEmail`。
- assignment 必须 ready。
- Worker access connection 必须 ready。
- 不满足则按现有状态返回 403 或 503。

### 统一登录

管理员和员工使用同一套登录入口：

```text
Logto Hosted Sign-in -> Host callback -> aiworker_session cookie
```

区别只在登录后的授权判断：

```text
/host              -> roles includes host:admin
/workers/:workerId -> assignment.assignedEmail === session.email
```

## 非目标

- 不写登录页。
- 不做 Logto 自定义登录 UI。
- 不做密码、验证码、MFA、SSO UI。
- 不让 Worker 自己做企业邮箱登录。
- 不把 Logto token 发给 Worker。
- 不把 Logto token 存进 signed cookie。
- 不用 Logto dynamic path permission 做 per-worker 授权。
- 不接生产域名 `https://aiworker.zonease.org` proof。
- 不做 Worker Access Tunnel。
- 不做 DB-backed session。
- 不做 session revoke list。
- 不做多 tenant、多组织、多邮箱域。
- 不支持非 `zonease.org` 邮箱。

## URL 合同

新增 Host auth routes：

```text
GET  /auth/login?returnTo=<path>
GET  /auth/callback?code=...&state=...
POST /auth/logout
GET  /api/auth/me
```

受保护入口：

```text
GET /host
GET /workers/:workerId
GET /api/host/*
```

第一版本地 proof 使用：

```text
hostBrowserBaseUrl = http://localhost:<port>
redirectUri        = http://localhost:<port>/auth/callback
postLogoutUri      = http://localhost:<port>/host
```

`returnTo` 只允许同源相对路径，避免 open redirect：

- 允许：`/host`
- 允许：`/workers/wkr_82`
- 拒绝：`https://evil.example`
- 拒绝：`//evil.example/path`
- 拒绝：`/auth/callback`

## OIDC Flow

### Login

`GET /auth/login?returnTo=/workers/wkr_82`

Host 动作：

1. 规范化 `returnTo`。
2. 生成：
   - `state`
   - `nonce`
   - `codeVerifier`
   - `codeChallenge`
3. 写入短 TTL transaction cookie：`aiworker_auth_txn`。
4. 302 到 Logto authorization endpoint。

Authorization request 至少包含：

```text
client_id
redirect_uri
response_type=code
scope=openid profile email
state
nonce
code_challenge
code_challenge_method=S256
```

### Callback

`GET /auth/callback?code=...&state=...`

Host 动作：

1. 读取并校验 `aiworker_auth_txn`。
2. 校验 callback `state`。
3. 使用 authorization code + PKCE verifier 调 Logto token endpoint。
4. 校验 ID token：
   - JWKS 签名
   - issuer
   - audience/client id
   - nonce
   - expiration
5. 校验 claims：
   - `sub` 非空
   - `email` 非空
   - `email_verified === true`
   - email domain 是 `zonease.org`
6. 写入 `aiworker_session`。
7. 清除 `aiworker_auth_txn`。
8. 302 回 `returnTo`。

### Logout

`POST /auth/logout`

Host 动作：

1. 清除 `aiworker_session`。
2. 返回 204，或 302 到 `/host`。

第一版不强制全局退出 Logto tenant session。全局退出可以后续接 end-session endpoint；当前 proof 只要求 AIWorker session 被清除。

### Me

`GET /api/auth/me`

返回：

```json
{
  "user": {
    "email": "alice@zonease.org",
    "roles": ["host:admin"],
    "subject": "usr_xxx"
  }
}
```

未登录返回：

```json
{
  "user": null
}
```

禁止返回：

- Logto access token
- Logto refresh token
- Logto ID token
- session signature
- cookie 内容

## Cookie 设计

### Transaction Cookie

名称：

```text
aiworker_auth_txn
```

用途：

- 保存登录交易的 `state`、`nonce`、`codeVerifier`、`returnTo`。
- 只用于 `/auth/callback`。

属性：

```text
HttpOnly
SameSite=Lax
Path=/auth
Max-Age=600
Secure=true on HTTPS
Secure=false on localhost HTTP
```

值：

- JSON payload + HMAC signature。
- 不包含 Logto token。

### Session Cookie

名称：

```text
aiworker_session
```

用途：

- Host 本地登录态。
- 让 Host 不需要每次请求都走 Logto。

payload：

```json
{
  "sub": "usr_xxx",
  "email": "alice@zonease.org",
  "roles": ["host:admin"],
  "expiresAt": "2026-06-06T12:00:00.000Z"
}
```

属性：

```text
HttpOnly
SameSite=Lax
Path=/
Max-Age=28800
Secure=true on HTTPS
Secure=false on localhost HTTP
```

签名：

- HMAC-SHA256。
- secret 来自 Host env，例如 `AIWORKER_HOST_SESSION_SECRET`。
- 本地 proof 可生成临时 secret；生产必须显式配置。

禁止：

- 不存 Logto access token。
- 不存 Logto refresh token。
- 不存 Logto ID token。
- 不存 assignment 权限快照。
- 不存 Worker access token。

Host 每次访问 `/workers/:workerId` 都重新查 assignment，不能信任 cookie 内的 worker 权限。

## Logto 配置策略

第一优先级：用根 `.env` 的 M2M 凭证自动准备本地 proof Web App。

动作：

1. 读取 M2M app id、secret、issuer、endpoint。
2. 通过 Logto Management API 获取管理 token。
3. 创建或查找应用：
   - 名称：`AIWorker Local Auth Proof`
   - 类型：Traditional Web / Web App
4. 确保 redirect URI 包含：
   - `http://localhost:<port>/auth/callback`
5. 确保 post logout redirect URI 包含：
   - `http://localhost:<port>/host`
6. 将 client id/secret 写入本地运行时配置或测试临时文件。
7. 不写入 git，不打印 secret。

如果 Management API 权限不足，降级为手动配置：

```text
Application type: Traditional Web / Web App
Redirect URI: http://localhost:<port>/auth/callback
Post logout redirect URI: http://localhost:<port>/host
Issuer: https://auth.zonease.org/oidc
```

用户只需要提供或复制 Web App client id/secret，不需要提供个人登录密码。

## Admin Role 来源

Host 管理权限第一版只接受已验证身份上的 role claim：

```text
roles includes host:admin
```

当前代码的 `mapLogtoClaimsToUser` 已支持 `roles: string[]`。但真实 Logto tenant 不一定默认把应用角色放进 ID token。实现 proof 时必须先检测 `/api/auth/me` 的 `roles`：

- 如果包含 `host:admin`，`/host` admin pass proof 可继续。
- 如果不包含 `host:admin`，`/host` 返回 403 是正确结果，不算登录失败。
- 如果要完成 admin pass proof，需要在 Logto 控制台配置角色 claim，或在后续实现计划中经用户批准增加 dev-only admin email allowlist。

dev-only admin email allowlist 只能作为本地 proof 降级方案，不能替代 Logto 身份认证。即使使用 allowlist，用户也必须先通过 Logto 登录且 email 必须属于 `zonease.org`。

## Host Gate 规则

### `/host`

```text
no session -> 302 /auth/login?returnTo=/host
session email not zonease.org -> 403
session roles missing host:admin -> 403
session roles includes host:admin -> serve Host Web / dev landing
```

### `/api/host/*`

```text
no session -> 403 JSON
session roles missing host:admin -> 403 JSON
session roles includes host:admin -> continue
```

API 不做 browser redirect，避免 fetch 调用误收到 HTML 登录页。

### `/workers/:workerId`

```text
no session -> 302 /auth/login?returnTo=/workers/:workerId
no assignment -> 404
session email != assignment.assignedEmail -> 403
assignment revoked -> 403
assignment not ready -> 503
access connection not registered -> 503
authorized and ready -> continue to existing routed branch
```

这次不实现生产 Worker Access Tunnel，所以最终 routed branch 仍维持当前 MVP 行为。身份和 assignment gate 必须先闭环。

## 测试与证据链

### Contract Tests

新增或扩展 Host auth tests：

- `/auth/login` 生成 Logto authorization redirect。
- `returnTo` 只接受同源相对路径。
- transaction cookie 是 HttpOnly、短 TTL、签名值。
- callback state mismatch 返回 400。
- callback 缺少 transaction cookie 返回 400。
- callback token exchange 失败返回 401 或 400。
- ID token 缺 email 返回 403。
- `email_verified=false` 返回 403。
- 非 `zonease.org` 邮箱返回 403。
- 成功 callback 写入 `aiworker_session` 并回 `returnTo`。
- `/api/auth/me` 不返回 token。
- session cookie 过期后视为未登录。
- session cookie 篡改后视为未登录。

### Authorization Tests

扩展 Host server tests：

- `/host` 未登录时 browser request 302 到 `/auth/login`。
- `/host` 已登录但无 `host:admin` 返回 403。
- `/host` admin session 可进入。
- `/api/host/assignments` 未登录返回 JSON 403，不 redirect。
- `/workers/:workerId` 未登录时 302 到 `/auth/login`。
- `/workers/:workerId` 登录邮箱不匹配返回 403。
- `/workers/:workerId` 登录邮箱匹配但 Worker 未 ready 返回 503。

### Real Browser Proof

新增本地 proof 脚本：

```text
bun run test:browser:logto-auth-proof
```

证据：

- 自动准备或确认 Logto Web App redirect URI。
- Playwright 打开 `/host`。
- 观察 URL 跳到 `https://auth.zonease.org/...`。
- 用户手动完成 Logto 登录，或使用已登录浏览器状态。
- 回到 `/auth/callback` 后跳回 `/host`。
- `/api/auth/me` 返回 `*@zonease.org`。
- 非 admin 访问 `/host` 返回 403，或 admin 访问通过。
- 构造 assignment 后，匹配邮箱访问 `/workers/:workerId` 进入授权通过分支。
- 非匹配邮箱访问返回 403。
- 浏览器 cookie 检查：
  - `aiworker_session` 存在。
  - HttpOnly。
  - 不包含 Logto token 明文。

真实 proof 允许人工介入登录步骤。Codex 不要求用户提供个人密码；用户可以在浏览器中手动输入验证码或使用已登录 Logto session。

## 安全边界

- Logto 只证明身份。
- Host 决定资源授权。
- `host:admin` 只影响 Host 管理面，不影响 Worker ownership。
- Worker ownership 只来自 Host assignment。
- Cookie 不包含 Worker 权限快照。
- Cookie 不包含 Logto token。
- Worker 不知道用户的 Logto token。
- Access Adapter 不转发 browser `authorization` 或 `cookie`。
- M2M secret 只用于管理 Logto app 配置，不用于用户登录。
- 所有 secret 都不得进入 descriptor、DB、receipt、logs、diagnostic output、OpenAPI example、UI 或 test snapshot。

## 错误处理

Browser entry：

- 未登录访问 `/host` 或 `/workers/:workerId`：302 到 Logto。
- 回调失败：返回稳定错误页或 JSON，第一版可用简单文本响应。
- 非企业邮箱：403。
- 非 admin 访问 `/host`：403。
- 非 assigned employee 访问 Worker：403。
- Worker not found：404。
- Worker not ready/access not ready：503。

API entry：

- 未登录：403 JSON。
- 无 admin：403 JSON。
- invalid JSON / invalid request：沿用现有 400。
- 不返回 HTML 登录页。

## 实现拆分

实现计划应拆成以下单元：

1. `host-session-cookie`：签名 cookie、parse/verify、HttpOnly attributes、tests。
2. `host-oidc-client`：authorization URL、PKCE、callback token exchange、ID token validation、tests。
3. `logto-app-config`：读取根 `.env`、Management API proof app prepare、secret redaction、tests with fetch mock。
4. `host-auth-routes`：`/auth/login`、`/auth/callback`、`/auth/logout`、`/api/auth/me`。
5. `host-route-gates`：`/host`、`/api/host/*`、`/workers/:workerId` 的 browser/API gate。
6. `browser-proof`：真实 Logto proof script，支持人工登录。

每个单元都必须能独立测试；真实 proof 只作为集成证据，不替代 contract tests。

## 风险与处理

### Management API 权限不足

处理：降级为手动配置 Web App。Spec 和 proof 脚本必须打印需要配置的 redirect URI，但不能打印 secret。

### 用户没有 admin 角色

处理：proof 分两段：

- `/api/auth/me` 证明真实登录。
- `/host` admin gate 返回 403 也算正确证据。

随后由用户在 Logto 控制台给该用户分配 `host:admin` 并确保 token 包含角色 claim，或批准 dev-only admin email allowlist，再复跑 admin pass proof。

### Logto token 不包含 roles

处理：不要猜。先把 `/api/auth/me` 的 claims 证据打印为脱敏结构：

```text
email: user@zonease.org
roles: []
```

若 roles 为空，Host 必须继续拒绝 `/host`。实现计划可以选择配置 Logto custom token claims，或增加 dev-only admin email allowlist。默认不把任意 `zonease.org` 用户提升为 Host admin。

### Email connector 或企业 SSO 未配置

处理：这是 Logto tenant 配置问题，不在 AIWorker 代码里造登录 UI。proof 明确报出“Logto 登录未完成”，由用户在 Logto 控制台处理。

### 本地 HTTP Cookie Secure

处理：localhost proof 不强制 Secure；HTTPS 生产环境强制 Secure。测试要覆盖两种属性生成。

### 多端口 redirect URI

处理：proof 优先使用固定端口。若端口被占用，脚本应报告需要新增的 redirect URI，而不是静默换端口导致 Logto 拒绝回调。

## 验收标准

本设计完成的验收标准：

- 根 `.env` secret 不进入 git、日志、测试快照。
- 本地 Logto Web App redirect URI 已自动确认或人工确认。
- 浏览器访问 `/host` 未登录时跳到 Logto。
- Logto 登录后 callback 成功，Host 写入 signed HttpOnly session cookie。
- `/api/auth/me` 返回 verified `@zonease.org` 用户，不返回 token。
- `/host` admin gate 生效。
- `/workers/:workerId` assignment gate 生效。
- 非 assigned employee 访问 Worker 返回 403。
- Worker 未 ready/access 未 ready 返回 503。
- Access Adapter 继续证明不会把 browser cookie/token 透传给 Worker。
- 所有相关 unit/contract tests 通过。
- 真实 browser proof 留下可复查输出。

## 参考

- Logto Traditional Web quick start: https://docs.logto.io/quick-starts/traditional-web
- Logto Application data structure: https://docs.logto.io/integrate-logto/application-data-structure
- Logto Management API: https://docs.logto.io/integrate-logto/interact-with-management-api
- Logto Custom token claims: https://docs.logto.io/developers/custom-token-claims
