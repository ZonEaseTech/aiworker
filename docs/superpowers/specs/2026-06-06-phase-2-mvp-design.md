# AIWorker Phase 2 MVP Design

日期：2026-06-06

状态：已完成产品头脑风暴，等待用户审阅后进入 implementation plan。

## 体验闭环判断

Phase 2 MVP 的体验已经闭环，可以进入设计文档与后续计划阶段。

闭环标准不是“系统元素都存在”，而是三类用户都能用一句话理解自己要做什么：

- 懂行的人在 Host 里把专业能力做成 Soul，测试并发布一个 Soul release。
- 管理员在 Host 里选择员工企业邮箱、开通目标、Soul release，然后点击“开通 AI Worker”。
- 员工打开自己的 Worker URL，用企业邮箱登录后进入 Worker-owned Workbench，开箱即用。

这个闭环避免了旧的 mount / micro-app 思维。Host 不挂载、不 iframe、不渲染 Worker Workbench。Host 只是 Soul 迭代与复制杠杆；Worker 才是员工侧终端。

## Product Core

AIWorker 的核心：

> 让一个懂行的人，把一套专业能力做成 Soul、快速迭代，再低成本复制给一群不懂技术的员工；每个员工因此拥有一个开箱即用的专属 AI 工作者。

产品角色：

- Soul：能力载体。
- Host：迭代 + 复制的杠杆。
- Worker：员工侧开箱即用的终端。

Phase 2 MVP 聚焦一条旅程：

```text
Soul author -> publish Soul release -> Host assignment -> provisioning target delivery
-> Worker check-in -> Worker access ready -> employee opens Worker Workbench
```

## MVP Scope

### In Scope

- Host 管理员登录与 Host 控制面。
- Soul Builder 的最小发布流：编辑能力资产、测试、发布 Soul release。
- Worker 分发流：员工企业邮箱 + provisioning target + Soul release。
- Provisioning Target Adapter 合同。
- 三类第一版开通目标：`aissh` production、`docker` preview、`local` dev。
- aissh 下发 provisioning 命令。
- Docker 干净容器启动、独立 worker home/volume 与 release bundle 验证。
- Local 本机进程启动，用于 dev/demo 与浏览器 E2E。
- Worker 主动 check-in。
- Worker Access Adapter：让公网浏览器访问部署在本机、容器、内网机或任意 aissh 目标上的 Worker。
- Logto 身份底座。
- AIWorker assignment：记录 Worker 归属、Soul release、部署状态、访问状态。
- 员工企业邮箱登录后访问自己的 Worker Workbench。
- Host 展示 provisioning/readiness/lifecycle 状态。

### Out of Scope

- Host mount / iframe / render Worker Workbench。
- Soul 提供 UI、app-owned API 或 capability。
- micro-app。
- 每台 Worker 独立配置 Logto application / redirect URI。
- 每个 Worker 对应一个 Logto dynamic path permission 或 per-worker scope。
- Soul Profile 概念。
- 开通抽屉里的 raw JSON/TOML 配置编辑。
- Gateway 产品化、通用 API gateway、任意 TCP tunnel。
- Host 读取 chat、session、workspace、artifact、native engine secret。
- 第一版直接做 `workerId.aiworker.zonease.org` 子域名。

## Information Architecture

Host MVP 第一屏是 `AI Workers`。

核心导航：

- `AI Workers`：管理员查看员工 Worker 清单，开通 Worker，查看 readiness。
- `Souls`：懂行的人编辑、测试、发布 Soul release。
- `Activity`：审计与 provisioning 事件。
- `Settings`：组织、Logto、provisioning targets、域名等系统设置。

首页主行动：

```text
开通 AI Worker
```

开通抽屉只包含三项：

```text
employee email + provisioning target + Soul release
```

不引入 Profile。配置默认随 Soul release 透传。Host 可以展示只读配置摘要，但不允许管理员在开通时编辑 raw Markdown / JSON / TOML。

`provisioning target` 是产品概念，不是 server 类型。UI 显示目标名为主，技术类型与成熟度为辅：

```text
新加坡生产服务器        aissh  production
Docker 预发布环境       docker preview
本机开发环境            local  dev
```

管理员可以看到 `aissh` / `docker` / `local` 标签作为排障线索，但不需要先理解这些技术类型。`preview` 与 `dev` 目标必须显示轻量提醒：这些目标用于验证开通链路或测试部署，不建议作为员工长期生产 Worker。

## URL Contract

Phase 2 MVP 使用同一个公网域名：

```text
https://aiworker.zonease.org
```

路径合同：

```text
/host
  Host 管理员控制面。

/api/host/*
  Host Web 使用的管理 API。

/api/provision/*
  Worker check-in、provision receipt、access connection 相关 API。

/workers/:workerId
  员工 Worker 入口。该路径进入 Worker Access Adapter，不是 Host page。

/
  MVP 可 redirect 到 /host。
```

`/workers/:workerId` 的边界必须明确：

- 它不是 Host-rendered route。
- 它不是 iframe。
- 它不注入 Host chrome。
- 它只经由 Worker Access Adapter 到达 Worker-owned Workbench。

未来可升级漂亮 URL：

```text
https://:workerId.aiworker.zonease.org
```

但 MVP 先使用 path URL，避免 Cloudflare 深层 wildcard DNS/TLS 与证书复杂度。

## Provisioning Flow

管理员动作：

```text
1. 输入员工企业邮箱，例如 bob@zonease.org
2. 从 provisioning target list 选择开通目标
3. 选择已发布 Soul release
4. 点击“开通 AI Worker”
```

Host 后台动作：

```text
1. 创建 assignment，状态为 provisioning
2. 生成一次性 provision token
3. 调用目标对应的 Provisioning Target Adapter，下发或启动 `aiworker provision`
4. 等待 Worker check-in
5. 等待 Worker Access Adapter 看到 access connection ready
6. 标记 Worker ready，生成 /workers/:workerId
```

Adapter 成功只表示开通动作送达或进程已尝试启动，不表示产品成功。`aissh exec` 成功、Docker container started、local process spawned 都不能直接标记 `ready`。产品成功必须同时满足：

- Worker 已 check-in。
- Worker 与 assignment 绑定。
- Worker Access Adapter 已建立可路由连接。
- `workbenchUrl` 可访问。

## Provisioning Target Adapter

不要把这个扩展点命名为 `server adapter`。正确概念是 `Provisioning Target Adapter`，中文为“开通目标适配器”。它回答的问题是“这个员工的 Worker 要开到哪个目标上，以及开通动作是否送达”，不是“AIWorker 支持哪些 server 类型”。

统一输入：

```text
assignmentId
assignedEmail
soulReleaseRef
provisionToken
hostPublicBaseUrl
targetRef
```

统一输出：

```text
deliveryStatus
deliveryReceipt
expectedCheckInDeadline
operatorHint
```

目标选项结构：

```text
id
displayName
adapterType: aissh | docker | local
maturity: production | preview | dev
ref
description
capabilities
health: ready | degraded | unavailable
```

成熟度边界：

- `production`：可作为正式员工 Worker 开通目标。
- `preview`：用于预发布、部署隔离、release bundle 验证；可以通过 Host UI 使用，但必须显示测试性质。
- `dev`：只用于本机 demo、开发验证和浏览器 E2E；不得包装成员工长期生产部署。

三种第一版 adapter：

- `aissh`：production。通过 aissh 在目标服务器执行 provision command，证明远程员工 Worker 可开通。
- `docker`：preview。用 release bundle 启动干净 container；每个 Worker 独立 worker home / volume；证明部署隔离和打包分发可行。
- `local`：dev。在当前机器启动 Worker process；使用独立 `AIWORKER_HOME`；证明 provision token、check-in、access path 合同能在本机跑通。

Adapter 禁止：

- 不读取 Worker chat、session、workspace、artifact 或 native engine secret。
- 不生成 Soul domain 配置。
- 不绕过 provision token。
- 不把 delivery 成功标记为 ready。
- 不把 Docker/local 暗示成正式员工长期部署，除非 maturity 升级并补足生产验收。

### aissh CLI Verified Facts

本 spec 不猜测 aissh 能力。2026-06-06 在本机验证到的 CLI 事实：

- `aissh version` 输出 `aissh-cli v0.8.0`。
- `aissh server list` 输出 JSON，顶层包含 `servers[]`，当前 server 字段包含 `id`、`host`、`name`、`notes`。
- `aissh exec` 的签名是 `aissh exec [server_id] <command> [flags]`。
- `aissh exec` 要求 `--reason`，支持 `--stream`、`--timeout`、`--tag`、`--group`。
- `aissh status` 当前返回 `review_policy`、`allowed_servers`、`token_id`、`token_name`、`server_version`、`vault_sealed` 等信息；这些是当前环境证据，不是产品通用合同。

因此，第一版 aissh adapter 只能依赖这些已验证事实。任何 tag/group 批量开通、文件传输、审批等待、流式日志接入，都必须在实现前单独验证对应 aissh 命令，不得从 help 文案外推成已支持产品能力。

## Worker Access Adapter

第一版 Worker Access Adapter 放在 Host 进程内模块，不拆独立服务。

这样做的原因：

- MVP 只有一个 Host 公网服务和一个公网域名。
- 拆独立服务会提前引入部署、健康检查、服务间鉴权、配置同步。
- 进程可以同一个，但代码职责必须隔离。

职责：

- 接收 Worker 建立的 WebSocket reverse tunnel。
- 维护 `workerId -> access connection` registry。
- 处理 `/workers/:workerId` 请求。
- 在路由前检查用户身份与 assignment。
- 剥离 Host/Logto 管理凭证。
- 转发 Worker Workbench 所需 HTTP、SSE、WebSocket 流量。

禁止：

- 不渲染 Worker UI。
- 不 mount / iframe / 注入 Host chrome。
- 不读取或解释 chat、session、workspace、artifact。
- 不成为通用 TCP tunnel。
- 不成为通用 API gateway。
- 不缓存或改写 Worker 业务响应。
- 不管理 native engine/runtime。

Access connection 使用 WebSocket reverse tunnel：

```text
Worker -> Host public service /api/provision/access
```

选择 WebSocket reverse tunnel 的原因：

- Worker 只需要出站连接，不要求本机、Docker container 或 aissh 目标公网入站。
- 能覆盖本机 Worker、容器 Worker、内网 Worker、任意 aissh 目标。
- 能支持 Workbench 需要的 streaming / WebSocket 行为。

## Auth Boundary

身份提供方选择 Logto。

Logto 负责：

- 验证企业邮箱身份。
- 管理组织资格。
- 管理 Host 管理员粗权限，例如 `host:admin`。
- 提供 OIDC/OAuth 身份底座。

AIWorker 负责：

- Worker assignment。
- `workerId -> assignedEmail` 精确绑定。
- Provisioning/readiness/lifecycle 状态。
- Worker access 授权。

Logto 不负责：

- 每个 Worker 的动态 path ACL。
- 每个 Worker 一个 scope。
- 每个 Worker 一个 Logto application。
- Worker access 的最终裁决。

访问 `/workers/:workerId` 的授权规则：

```text
current_user.email == assignment.assigned_email
```

即使同为 `@zonease.org` 用户，邮箱不匹配也不能访问别人的 Worker。

## Assignment Security

Assignment 是 Host 服务端事实账本，不是 bearer token。

Assignment 可以包含：

- `assignment_id`
- `assigned_email`
- `soul_release_ref`
- `provisioning_target_ref`
- `provisioning_adapter_type`
- `provisioning_target_maturity`
- `worker_id`
- `workbench_url`
- `status`
- `version`
- `created_at`
- `updated_at`

Assignment 不得包含：

- 明文 provision token。
- Logto access token。
- Host admin session。
- native engine secret。
- MCP secret。
- 员工浏览器 cookie。

短期 migration 可以保留旧 `server_ref` 作为内部兼容字段，但新 API、UI、测试与文档都必须使用 `provisioning target` 语言。否则产品心智会继续被 `server` 拉回底层实现。

安全链路：

```text
1. Host 创建 assignment
2. Host 生成一次性 provision token，短 TTL，只存 hash
3. Worker 首次 check-in 使用 provision token
4. Host 将 worker_id 绑定到 assignment
5. Access Adapter 每次访问都查 assignment
6. assignment revoked/archived 后立即拒绝访问
```

MVP 必须具备：

- server-side assignment。
- one-time provision token。
- exact email gate。
- revocation。
- no secret persistence。

后续 hardening 可加入 Worker keypair：

- Worker 首次 check-in 生成 keypair。
- Host 绑定 `worker_public_key`。
- 后续 access connection / check-in 用 Worker 私钥签名。

Worker keypair 不是 MVP blocker。

## State Machine

Host 对每个 assignment 展示的主状态：

```text
draft
provisioning
checked_in
access_ready
ready
needs_attention
revoked
archived
```

状态含义：

- `draft`：管理员保存但未执行开通。
- `provisioning`：Host 已创建 assignment，并通过目标 adapter 下发或启动开通动作。
- `checked_in`：Worker 已使用 provision token 主动 check-in。
- `access_ready`：Worker Access Adapter 已看到可路由 access connection。
- `ready`：员工可通过 `workbenchUrl` 打开 Worker Workbench。
- `needs_attention`：adapter delivery 失败、check-in 超时、access tunnel 断开、URL 不可达或 target 不可用。
- `revoked`：管理员撤销员工访问。
- `archived`：assignment 归档，不再作为活跃 Worker 入口展示。

Host UI 不把 adapter delivery success 显示为 `ready`。真正 ready 必须经过：

```text
adapter delivered -> Worker checked_in -> access_ready -> ready
```

失败恢复 MVP：

- `provisioning` 超时后显示“需处理”。
- 提供“重新下发”。
- 提供只读 adapter delivery 摘要。
- 不默认展示底层命令输出。

统一错误码：

```text
delivery_failed
check_in_timeout
access_timeout
target_unavailable
cleanup_required
```

管理员 UI 用人能理解的状态解释这些错误，例如“开通目标不可用”“Worker 未报到”“Access 未接入”“需要清理”。底层命令、container id、process id、aissh receipt 只放在只读诊断里。

## Soul Builder Boundary

Soul Builder 是 Host 的第二主流程。

它负责：

- 编辑 Markdown skills。
- 编辑 entry files，例如 `AGENTS.md`、`CLAUDE.md`。
- 编辑 `.mcp.json`。
- 编辑 Codex `config.toml`。
- 预览与校验。
- 测试。
- 发布 Soul release。

开通 Worker 时只选择已发布 Soul release。Draft 不能分发给员工。

不引入 Soul Profile。若未来真实业务需要门店、部门、区域、项目 ID 等开通参数，应设计为 Soul 声明的少量 business inputs，而不是通用 Profile 体系。

## Employee Experience

员工不进入 Host。

员工收到或打开：

```text
https://aiworker.zonease.org/workers/:workerId
```

如果未登录：

```text
redirect to Logto login -> return to /workers/:workerId
```

登录后：

- Access Adapter 读取登录会话。
- 查询 assignment。
- 校验 email exact match。
- 放行到 Worker-owned Workbench。

员工首屏应该读作：

```text
我的 AI Worker 已准备好
```

而不是：

```text
我在使用 Host 的一个远程页面
```

## Admin Experience

管理员在 `/host` 里看到 Worker 清单。

每一行展示：

- 员工邮箱。
- Soul release。
- provisioning target 名称。
- adapter type 与 maturity 小标签。
- Worker readiness。
- `workbenchUrl`。
- 最近 check-in / access connection 状态。

管理员主要操作：

- 开通 AI Worker。
- 重新下发。
- 复制员工 Worker URL。
- 撤销访问。
- 归档 assignment。

管理员不操作：

- 不编辑每个员工的 raw config。
- 不进入员工 chat/session。
- 不管理 engine process。
- 不管理本机 Worker runtime。

正式员工开通默认推荐 `production` target。`preview` / `dev` target 可以用于验证，但 UI 必须明确其测试性质。管理员不应被要求先选择技术类型；技术类型只是目标旁边的辅助标签。

## Canonical Docs Impact

当前 canonical docs 里仍有 Phase 2 旧假设：Host 是 control client，Worker 是 passive control server，Worker 不主动连接 Host。

本设计对 Phase 2 做出新的产品决策：

- Worker provisioning 后必须主动 check-in Host。
- Worker 必须建立 WebSocket reverse tunnel 到 Host 进程内的 Worker Access Adapter。
- Host readiness 必须等待 Worker check-in 与 access ready。
- Host provisioning 必须通过 Provisioning Target Adapter，不得把 aissh 写死成唯一开通方式。
- `docker` preview 与 `local` dev adapter 必须走同一 assignment、provision token、check-in、access ready 合同，用来验证 adapter 抽象真实成立。

因此，在进入实现前，必须先把以下 canonical docs 更新为新合同：

- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/testing.md`

任何实现计划都不能继续引用旧的“Worker never initiates a connection to Host”作为 Phase 2 约束。

## Acceptance Criteria

Phase 2 MVP 体验验收：

- 管理员能用 Logto 登录 `/host`。
- 管理员能看到 provisioning target list，其中至少包含 `aissh` production、`docker` preview、`local` dev 三类目标。
- 管理员能选择员工邮箱、provisioning target、Soul release 并开通 Worker。
- Host 创建 assignment，并生成一次性 provision token。
- Adapter delivery 成功后，Host 状态仍为 `provisioning` 或 `checked_in`，不误报 `ready`。
- `aissh` adapter 使用已验证的 `aissh exec [server_id] <command> --reason ...` 形态；实现前不得猜测未验证的 aissh 能力。
- `docker` adapter 能在干净 container 中启动 Worker，并使用独立 worker home / volume。
- `local` adapter 能在本机独立 `AIWORKER_HOME` 中启动 Worker，用于 dev/demo 和浏览器 E2E。
- Worker check-in 后，Host 绑定 `worker_id` 与 assignment。
- Worker 建立 WebSocket reverse tunnel。
- Host 生成 `https://aiworker.zonease.org/workers/:workerId`。
- 员工打开该 URL，未登录时走 Logto。
- 登录邮箱与 assignment 匹配时进入 Worker-owned Workbench。
- 登录邮箱不匹配时被拒绝。
- assignment revoked 后，旧 URL 不再可访问。
- Host 不能读取 Worker chat、session、workspace、artifact、native secret。
- `/workers/:workerId` 不出现 Host chrome、mount、iframe 或 micro-app 语义。

## Testing Strategy

需要覆盖的合同测试：

- canonical docs gate：禁止 mount / iframe / Host-rendered Worker UI 语义回流。
- assignment safety：不持久化明文 provision token、Logto token、Host session、native engine secret。
- exact email gate：同域用户但邮箱不匹配不能访问 Worker。
- provisioning target schema：Host options 暴露 `provisioningTargets[]`，不再把新 API/UI 命名为 `servers[]`。
- adapter maturity：`production` / `preview` / `dev` 的 UI 标签与限制文案存在。
- readiness state：adapter delivery success 不等于 ready。
- aissh CLI contract：围绕已验证的 `server list` JSON 与 `exec [server_id] <command> --reason` 形态写测试，不臆造 tag/group/file/approval 能力。
- access adapter boundary：只允许 `/workers/:workerId` access routing，不允许通用 gateway 能力扩散。
- Logto boundary：Logto scope 只做粗授权，不做 per-worker dynamic scope。

需要覆盖的集成证明：

- Host provisioning happy path。
- aissh production target happy path。
- docker preview target happy path：干净 container + 独立 volume + Worker check-in。
- local dev target happy path：独立 `AIWORKER_HOME` + Worker check-in + browser E2E。
- Worker check-in happy path。
- WebSocket reverse tunnel happy path。
- `/workers/:workerId` employee browser path。
- revoked assignment blocks browser access。
- access tunnel disconnect turns assignment into `needs_attention` or degraded readiness。

## Follow-up Plan Boundary

本 spec 只确认产品与系统设计，不进入实现。

用户审阅通过后，下一步按 Superpowers 流程进入 writing-plans，计划应先处理：

1. canonical docs promotion。
2. Provisioning Target Adapter contract。
3. Host options 从 `servers[]` 收口为 `provisioningTargets[]`。
4. Host assignment model 从 `server_ref` 迁移到 provisioning target 语言。
5. aissh adapter，基于实测 CLI 合同。
6. docker preview adapter，证明隔离与 release bundle。
7. local dev adapter，证明本机 E2E。
8. provision token 与 check-in API。
9. Worker Access Adapter in-process boundary。
10. WebSocket reverse tunnel。
11. Logto BFF/Auth Gate。
12. Host Web MVP flow。
13. focused contract/browser tests。
