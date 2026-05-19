# AIWorker Architecture

本文是 AIWorker 当前唯一架构合同。根 `AGENTS.md` 说明 agent 如何执行工作；本文说明系统
应该是什么。旧北极星文档已删除，不再作为入口或约束来源。

## 产品定位

AIWorker 是 **local-first vertical Soul App host**。它把垂直 Soul App 暴露为
human-legible 和 agent-operable 的本地能力面，但不认识、依赖或特化任何具体外部 agent runtime。

它不是 developer-only coding loop、admin dashboard、远程控制面、治理内核，也不是通用
agent runtime 平台。默认体验是让团队安装或启用垂直 Soul App，例如 HR、QA、PM、DevOps、
finance、legal、ops，并在本地 workspace/session 中产出可审查的业务结果。人类可以直接使用
AIWorker；外部 agent runtime 或其他 operator 也可以在授权后使用同一批 Soul App workspace、
session、action、search 和 descriptor。谁来理解目标、选择 worker、编排步骤、重试失败或跨
Soul 调度，是外部 operator 的事，不属于 AIWorker Host/Soul 合同。

当前产品路径：

```text
Operator (human UI or external runtime) -> Host -> install/enable Soul App -> Soul worker -> workspace -> session
  -> Soul App exposed views/actions -> business artifact/profile/review/lesson
```

这条路径里的关键点是：**Host 定位并提供平台能力，Soul App 定义并拥有领域意义。**

Soul App is the source of truth for domain state and domain meaning.
Host is the source of truth for platform capabilities, grants, protocol discovery and shell context.
Host may consume only protocol-exposed views/actions/search/configuration descriptors, and must not infer Soul App domain meaning.
The operator may be a human using Host Web/Soul App UI or an external runtime
using protocol/MCP/action/search descriptors. AIWorker does not decide how that
operator reasons, schedules or orchestrates; it only enforces Host grants and
routes explicit Soul App-owned protocol surfaces.

## 核心原则

### 1. Host 是平台定位与能力壳

Host 负责让 Soul App 被发现、安装、启用、运行、挂载和获得被授权的平台能力。Host 可以
提供统一 shell、鉴权、安全策略、设置、engine/MCP 配置、connector grant、对象存储、日志、
审计和本地 daemon 能力。

Host 不应该把自己升级成 HR、QA、PM 或任何垂直领域的数据解释者。

### 2. Soul App 是领域主权方

Soul App 负责垂直产品逻辑、领域数据模型、领域 UI/API、artifact schema、profile 组合、
review 语义、lesson/memory 语义、standalone 体验和 Host mounted 体验。

例如 HR App 可以把多份候选人筛选 artifact、面试记录、证据引用和人工 review 组合成
People Profile。Host 可以知道“HR App 暴露了一个 profile view”，但不应该知道 profile
字段如何合成、哪个 artifact 是主证据、review verdict 对招聘流程意味着什么。

### 3. Host 只消费 Soul App 通过协议暴露的内容

Host 可以读取 manifest、health、view、action、status、search、artifact descriptor、
review summary、memory summary 或 audit event，但前提是 Soul App 通过协议声明并授予 Host
访问。

如果 Soul App 没有暴露某个 surface，Host 不需要取，也不能推断。

### 4. Standalone 和 Host mounted 是同一 app 的两种运行形态

Soul App 必须能够作为独立垂直产品运行，也可以挂载到 Host。两种形态复用同一份 manifest、
领域模型、capability、artifact schema、review policy 和权限声明。

```text
Standalone:
Soul App -> app-local runtime/settings/storage -> app workspace/session

Host mounted:
Host shell/daemon -> app manifest -> mounted service/protocol -> scoped brokers
```

Host mounted 不等于所有调用都必须由 Host 代理。默认规则是：

- 领域内调用留在 Soul App 内；
- 共享平台能力通过 Host broker；
- 跨 app 或跨 workspace 的定位、授权和 shell 集成由 Host 协调。

### 5. AIWorker 提供能力面，不认识具体调度者

AIWorker 的 operator 可以是人类，也可以是外部 agent runtime 或其他自动化系统。人类通过
Host Web Shell、standalone Soul App 或 mounted workbench 使用产品；外部 operator 可以通过
manifest/protocol/MCP/action/search/descriptor 等 agent-operable surface 使用同一批垂直能力。

Host/Soul 不内置任何具体外部 runtime 名称，也不提供跨 Soul 调度智能。Host 只负责 discovery、
grant、routing、broker、workspace/session locator、audit 和 shell/context 能力；Soul App
决定哪些领域能力暴露给人类、哪些暴露给外部 operator，以及这些能力的业务含义、权限和
review/takeover 规则。外部 operator 自己负责 reasoning、scheduling、orchestration、retry、
native tool loop、model、sandbox 和 memory。

## Constraint Registry

This registry is the normative source for active Host / Soul App constraints.
Thin layers such as `AGENTS.md`, README files, skills and authoring guides may
route agents to these IDs, but must not redefine them as separate contracts.

| ID | Rule | Owner | Enforced by | Thin references |
| --- | --- | --- | --- | --- |
| `ARCH-001` | The default product path is `Operator -> Host -> install/enable Soul App -> Soul worker -> workspace -> session -> app-exposed business output`. Do not route default work back to developer-only work orders, admin dashboards, remote control planes or generic agent runtime platforms. | Architecture | `scripts/check-doc-contract.ts`, active entrypoint review, product-path tests when UI changes | `AGENTS.md`, `README.md`, route skills |
| `OPERATOR-001` | AIWorker exposes human-legible and agent-operable surfaces over the same Soul-owned workspace/session/domain state. External operator access must use Host grants and explicit Soul App protocol/MCP/action/search/descriptor surfaces. AIWorker must not depend on or specialize for a named external runtime, schedule cross-Soul work on behalf of callers, translate app domains into generic tools, or infer hidden app behavior. | Architecture | protocol schema tests, broker/security tests, app validate/smoke, future external-operator smoke tests | `docs/soul-app-developer.md`, Host and Soul App skills |
| `HOST-001` | Host owns platform capabilities: local daemon, install/enable, auth/security, grants, platform settings, brokers, locator, shell and protocol discovery. Host must not own domain meaning. | Host | Host API/core/Web/CLI tests, broker/security tests, `pma-cr`, code-review-graph | `aiworker-host-dev`, `AGENTS.md` |
| `SOUL-001` | Soul App owns domain state and semantics: domain UI/API, workspace/session workflow, artifacts, profiles, reviews, lessons/memory, standalone shell and mounted handlers. | Soul App | `aiworker app validate`, `aiworker app smoke`, app package tests | `aiworker-soul-app-dev`, `docs/soul-app-developer.md` |
| `PROTO-001` | Host may consume only manifest/protocol/grant-exposed Soul App views, actions, search, configuration, status and descriptors. If a surface is not exposed, Host must stop instead of fetching, inferring or synthesizing it. | Shared boundary | manifest/protocol schema tests, mounted API tests, security review tests | Host and Soul App skills |
| `IMPORT-001` | Soul App production code must not import Host private packages or sibling app `src`; Host code must not import Soul App `src`. Public SDK, runtime harnesses, manifests, protocol descriptors and shared fixtures are the allowed boundary objects. | Shared boundary | `scripts/check-soul-app-boundaries.ts`, `aiworker app validate`, package tests | Host and Soul App skills |
| `DATA-001` | `worker.db` stores Host metadata, references, hashes, status and protocol descriptors. Full business content and domain facts stay in Soul App workspace files or app-scoped object/storage namespaces. | Host storage + Soul App | storage schema tests, broker tests, protocol descriptor tests | architecture data section, route skills |
| `BROKER-001` | Broker access is scoped by app id, worker id, workspace id and grant. Broker providers expose capability metadata and app-scoped handles, never raw credentials or sibling app data. | Host broker | broker tests, provider registry tests, security review tests | Host skill, Soul App authoring |
| `DOC-001` | Active normative docs are `AGENTS.md` and this architecture file. `docs/task`, `docs/plan`, `docs/superpowers` and `docs/changelog.md` are audit trail; they cannot override the active contract. | Documentation | `scripts/check-doc-contract.ts`, PMA closeout review | `AGENTS.md`, README, skills |

## 系统拓扑

```text
Human operator
External runtime or operator
  -> Host Web Shell
  -> Local Daemon API
      -> App Registry / Install Enablement
      -> Auth / Settings / Engine / MCP / Connector Grants
      -> Platform Brokers
          -> Storage namespace
          -> Secret reference boundary
          -> Connector evidence boundary
          -> Host audit for platform actions
      -> Mounted Soul App Protocol
          -> apps/aiworker-hr
          -> apps/aiworker-qa
          -> third-party Soul Apps
```

Host 维护的是平台对象：

- installed app；
- enabled app；
- worker binding；
- workspace/session locator；
- protocol cache；
- grant；
- platform audit；
- shell preference。

Soul App 维护的是领域对象：

- domain model；
- workspace type；
- session workflow；
- artifact；
- profile；
- review；
- lesson/memory；
- domain audit。

## 权责边界

| Surface | Host | Soul App |
| --- | --- | --- |
| App lifecycle | Discover, install, enable, disable, route, launch | Provide manifest, health, compatibility and entrypoints |
| Auth/security | Own Host auth, session security and grant enforcement | Declare required permissions and enforce app-local domain rules |
| Storage | Provide app-scoped storage namespace and broker credentials | Own stored domain content and file/object layout inside the namespace |
| Platform settings / configuration | Own global appearance, language, default engine, local MCP and connector settings | Own app-specific configuration exposed through protocol |
| Shell | Own global layout, Host header, navigation and worker/workspace/session locator | Expose app-owned workbench actions, search, configuration and workspace context descriptors when mounted |
| UI/API | Mount or proxy declared surfaces | Own domain UI, API and standalone runtime |
| Operator | Identify human/agent callers, enforce grants, route declared surfaces and audit platform access | Decide which human-facing and agent-operable domain surfaces exist and what they mean |
| Artifact | Store or cache protocol descriptors when exposed | Own artifact schema, content, lifecycle and meaning |
| Profile | Only locate or render exposed profile views | Compose and own profile state and semantics |
| Review | Render or index exposed review summaries | Define review rubric, verdict meaning and promotion policy |
| Lesson/memory | Provide generic broker/admission ledger when requested | Decide what becomes reusable domain knowledge |
| Audit | Audit Host/platform actions | Audit domain actions and expose summaries if useful |
| Search | Offer platform search/index broker when granted | Decide searchable fields and result meaning |
| Provider registry | Publish platform provider metadata and app-scoped availability | Choose which declared broker capabilities to use |

## Protocol Surfaces

Host 和 Soul App 之间的交互只通过显式协议面完成：

```text
manifest -> compatibility, permissions, routes, slots, capabilities
health -> mounted service readiness
views -> app-owned UI surfaces Host can render or route
actions -> app-owned workbench commands Host can invoke through declared descriptors
status -> app-owned lifecycle/workflow summaries
descriptors -> artifact/profile/review/memory summaries exposed for Host indexing
workspace context -> app-declared locator hints such as terminal cwd source
brokers -> Host-owned storage, connector, secret-ref, search, log and audit capabilities
events -> optional app-emitted lifecycle/domain events
```

协议原则：

- Host 可以缓存 descriptor，不拥有 descriptor 指向的领域事实。
- Human UI 和 agent-operable surfaces 必须指向同一份 Soul App domain state；不允许为 agent
  维护一套由 Host 合成的影子领域模型。
- Host 可以提供 route 和 shell layout，不拥有 route 内的领域体验，也不把 Soul App descriptor
  渲染成 Host header slot。
- Host 可以提供 broker，不拥有 broker 内 app 写入的领域内容。
- Host action/search/configuration invocation must resolve a manifest-declared descriptor first.
  Host must reject undeclared protocol actions or search providers, and must not infer app domain behavior from protocol names.
- Host auth is provider-backed. The current local provider preserves bearer-token behavior, while
  future Logto integration must implement the same provider boundary instead of leaking auth
  internals into Soul Apps.
- Descriptor `requiredPermissions` are broker-enforced before Host contacts a mounted Soul App service.
- Host storage broker providers own app-scoped namespaces and access control; Soul Apps own stored value semantics.
- Host broker provider registry lists storage, connector, audit and secret-reference providers as
  capability metadata. It may name future S3/GCP/vault providers, but it must not load cloud SDKs
  or expose raw credentials through the registry.
- Host search index broker stores only app-submitted non-authoritative descriptors: title,
  summary, reference and scope ids. Soul Apps own which descriptors to publish and what each
  result means.
- Host install/enable surfaces may project manifest permissions, connector needs and descriptor
  `requiredPermissions` as a generic security review before app code runs. This review belongs to
  Host security and grant UX; it is not an app-specific approval model and does not interpret domain data.
- Host 可以展示 app 的 review 或 memory status，不解释 status 对业务流程的含义。
- Soul App 不直接读取 Host 私有 DB、secret、connector credential 或 sibling app 源码。
- Soul App receives operator identity and broker grants only through signed mount context or
  app-scoped broker scope. Caller cookies and caller authorization headers are not forwarded.

## Host Shell And Workbench Contract

Host 当前保留统一 shell layout，因为它提供跨 Soul App 的平台定位能力：

- installed/enabled Soul App；
- Soul worker；
- workspace；
- session；
- platform settings；
- local daemon status；
- platform capability grants。

Host header is platform-owned chrome. It may contain fixed Host actions such as
sidebar, terminal panel or right-panel toggles, but mounted Soul Apps must not
customize Host header title, primary action, searchbar, action menu, drawer
toggle, refresh button or app configuration placement.

Mounted Soul Apps can still expose app-owned workbench coordination through
manifest/protocol descriptors:

- `ui.workbench.primaryAction` and `ui.workbench.actions` declare commands
  Host may invoke on behalf of a mounted workbench.
- `ui.workbench.search` declares an app-owned search provider that Host may call
  through the generic app search endpoint.
- `ui.workbench.configuration` declares an app-specific configuration command
  without granting control over Host Platform Settings chrome.
- Workbench action descriptors use `role`, not header `slot`; roles describe
  intent such as `primary`, `refresh`, `configure` or `panel-toggle`, not Host
  placement.

Settings-related UX is intentionally split into three layers:

- Host Platform Settings: global/local Host preferences such as execution
  mode, engine/BYOK, MCP, connector availability, language, appearance and
  installed Soul App lifecycle.
- Soul App Configuration: app-owned domain configuration exposed through
  `ui.workbench.configuration` or an app-owned route/panel.
- Workspace / session preferences: scoped choices that bind Host capabilities
  to a business workspace or session. Host enforces capability grants; Soul App
  owns the domain meaning.

Workspace/process coordination belongs to a separate context descriptor:

- `ui.workspaceContext.terminal` can declare how a future Host-owned web
  terminal should locate the selected workspace context.
- `cwd.source = "host-workspace-root"` means Host uses the platform workspace
  root it already controls.
- `cwd.source = "app-workspace-path"` requires an app-local `subpath`.
- `cwd.source = "protocol-resolver"` requires a `protocolProvider`; Host must
  authorize and resolve it before opening a terminal.

This contract keeps protocol interaction ability while preventing Host header
customization from becoming a cross-boundary UI slot. Standalone 模式下 Soul App
拥有自己的完整 shell；Host mounted 模式下，Soul App owns its workbench surface
inside Host shell.

如果未来某个垂直 app 证明全页接管比 Host header 更清晰，可以新增 mount mode，但不能让 Host
开始理解领域对象。

## Data Contract

`worker.db` 存平台 metadata：

- installed apps；
- workers；
- workspaces；
- sessions；
- engine invocations；
- protocol cache；
- grants；
- platform files/descriptors；
- Host audit；
- optional generic review/lesson ledger。

真实业务内容属于 Soul App 和 workspace：

- 候选人档案、release evidence、incident runbook、legal memo 等业务文件留在 app/workspace
  的文件或对象存储命名空间；
- DB 可以保存引用、hash、status、source、owner app id 和 protocol descriptor；
- DB 不复制完整领域事实，不合成 profile，不解释 review verdict；
- app-scoped storage path、bucket prefix 或 object namespace 必须由 Host broker 按 app id
  隔离。

浏览器侧 storage 是 trusted first-party 纪律，不是三方安全沙箱：

- Host Web 自己的 browser storage key 使用 `aiworker:host:*` 前缀；
- 当前同 realm 运行的 Soul App 只能是一方/官方代码，必须通过 SDK scoped helper 使用
  `aiworker:app:<appId>:...` 前缀；
- Soul App 生产代码不得直接使用裸 `localStorage`、`sessionStorage` 或全局 `.clear()`；
- browser storage 只用于 UI preference、draft、filter 等局部状态，真实业务内容继续走
  Host broker storage 或 app workspace/object namespace；
- 未来开放 third-party Soul App 前，必须新增 isolated renderer、worker/protocol 或
  descriptor-only 设计，不能把当前 first-party discipline 当作三方隔离边界。

## Engine And MCP

Host 维护默认 engine、local MCP、BYOK、语言、外观和 autosave 等平台设置，并透传给 Soul App
或 mounted runtime。

Host 可以提供 MCP gateway、MCP server lifecycle、workspace/session binding、grant enforcement
和 audit 等基础设施。MCP 不是 AIWorker 的产品主语，也不是 Host 解释领域的入口。
Soul App 决定是否暴露 MCP-facing tool/resource/prompt，暴露哪些领域能力，以及这些能力如何
映射到 artifact、profile、review、lesson 或 domain action。Host 不应把 HR、QA、PM 等领域
统一翻译成一组通用 MCP tools。

外部 engine 负责自己的 tool loop、模型、sandbox、approval、auth/profile、native session 和
插件生态。AIWorker 只在 session 层准备 cwd/context、调用或观察 engine，并索引平台事件和
被协议暴露的产物 descriptor。

Developer Soul 只是 supporting role，用于 code review、release evidence、repo report、
handoff、risk audit 等，不是产品中心。

## Isolation And Security

硬约束：

- Soul App 生产代码不得 import Host 私有包，例如 `@zonease/aiworker-core`、
  `@zonease/aiworker-api`、`@zonease/aiworker-storage-sqlite`、`@zonease/aiworker-web`。
- Soul App 生产代码不得 import sibling app 的 `src`。
- app 之间不共享默认 storage namespace、memory namespace 或 API route。
- app 之间不共享 browser storage key；Host 使用 `aiworker:host:*`，Soul App 使用
  SDK scoped `aiworker:app:*`。
- Secret 只能放 `.env`、vault 或 secret reference；不得写入 manifest、generated app config、
  workspace metadata、DB metadata、日志、prompt、review rubric 或 skill 文件。
- Secret 不得写入 browser `localStorage` 或 `sessionStorage`。
- Host broker 必须按 app id、worker id、workspace id 和 grant scope 做边界控制。
- 1.0.0 前允许破坏性收敛，优先保证当前合同清晰，不保留拖累边界的旧 shim。

## Repository Map

```text
apps/
  cli/            aiworker CLI and local daemon lifecycle entry
  api/            local daemon API and Worker Web static host
  web/            Host Web Shell and mounted workbench
  aiworker-hr/    official HR Soul App
  aiworker-qa/    official QA Soul App

packages/
  core/              local runtime, Host services, broker providers and engine adapters
  shared/            shared schemas, provider registry and Host/Soul App protocol types
  soul-app-sdk/      public SDK for Soul App authors
  soul-app-runtime/  standalone and mounted runtime harness
  storage-sqlite/    worker.db schema, migrations and repositories
  fs-layout/         AIWORKER_HOME, worker and workspace path helpers
  component/         shared UI primitives and patterns
```

## Development Entry Routing

Architecture ownership decides the development route:

| Change area | Owner | Repo path | Agent route |
| --- | --- | --- | --- |
| local daemon API, app registry, broker enforcement, auth/security, platform settings | Host | `apps/api`, `packages/core`, `packages/storage-sqlite` | `.agents/skills/aiworker-host-dev/SKILL.md` |
| Host Web Shell, Settings, worker/workspace/session workbench, Host-owned header chrome | Host | `apps/web`, `packages/component` | `.agents/skills/aiworker-host-dev/SKILL.md` |
| CLI lifecycle, daemon/app/worker/workspace/session commands | Host | `apps/cli`, `docs/cli.md` | `.agents/skills/aiworker-host-dev/SKILL.md` |
| shared Host/Soul manifest, protocol, descriptor, grant or broker schema | Shared boundary | `packages/shared`, affected Host package, affected Soul App manifest or SDK/runtime package | Start here, classify Host vs Soul ownership, then use the matching skill |
| Soul App domain UI/API, manifest, standalone, Host mounted handler, artifacts, profiles, reviews, lessons | Soul App | `apps/aiworker-*`, `packages/soul-app-sdk`, `packages/soul-app-runtime` | `.agents/skills/aiworker-soul-app-dev/SKILL.md` |
| Soul App authoring, scaffold, validate or smoke behavior | Public Soul App authoring | `docs/soul-app-developer.md`, `packages/soul-app-sdk`, `packages/soul-app-runtime`, CLI validate/smoke code | `.agents/skills/aiworker-soul-app-dev/SKILL.md` |

If a change crosses the boundary, keep the architecture rule intact: Host may
add or enforce protocol, broker, grant, locator or shell behavior; Soul App
defines the domain surface exposed through that protocol. Do not solve a
domain need by teaching Host the domain meaning, and do not solve a platform
need by letting a Soul App import Host internals.

## API And Validation Rules

- API 文档以代码为准：OpenAPIHono `app.doc('/openapi.json')` + `/docs`。
- 新增或修改 API 时同步 zod schema、OpenAPI metadata、typed client/proto 和相关测试。
- Schema 变更通过 `packages/storage-sqlite` 的 Drizzle schema 与 migration 生成。
- Soul App 变更必须跑 `aiworker app validate <app-path>`。
- 影响 standalone 或 Host mounted surface 时必须跑 `aiworker app smoke <app-path>`。
- Host/Soul protocol 变更必须同时验证 standalone 与 Host mounted 语义。
- Search broker records are Host-owned indexes of app-owned descriptors only; do not store
  profile fields, release verdict semantics, private evidence payloads or raw connector data in
  the index.

## Current Historical Boundaries

以下内容只作为历史实现或底层 guardrail，不是默认产品入口：

- legacy gateway/fleet/control-plane；
- governance kernel first surface；
- generic agent runtime platform；
- developer-only work order loop；
- 旧外部产品映射叙事。

当前开发必须从 `AGENTS.md` 和本文开始。旧 PMA、changelog、Superpowers spec/plan 是历史证据，
不能覆盖本文合同。
