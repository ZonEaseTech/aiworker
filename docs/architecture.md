# AIWorker Architecture

本文是 AIWorker 当前唯一架构合同。根 `AGENTS.md` 说明 agent 如何执行工作；本文说明系统
应该是什么。旧北极星文档已删除，不再作为入口或约束来源。

## 产品定位

AIWorker 是 **local-first vertical Soul App host**。

它不是 developer-only coding loop、admin dashboard、远程控制面、治理内核，也不是通用
agent runtime 平台。默认体验是让团队安装或启用垂直 Soul App，例如 HR、QA、PM、DevOps、
finance、legal、ops，并在本地 workspace/session 中产出可审查的业务结果。

当前产品路径：

```text
Host -> install/enable Soul App -> Soul worker -> workspace -> session
  -> Soul App exposed views/actions -> business artifact/profile/review/lesson
```

这条路径里的关键点是：**Host 定位并提供平台能力，Soul App 定义并拥有领域意义。**

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

## 系统拓扑

```text
Operator
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
| Settings | Own global appearance, language, default engine, local MCP and connector settings | Own app-specific settings exposed through protocol |
| Shell | Own global layout, navigation, worker/workspace/session locator and optional header contract | Contribute title, primary action, search, actions, drawers and settings when mounted |
| UI/API | Mount or proxy declared surfaces | Own domain UI, API and standalone runtime |
| Artifact | Store or cache protocol descriptors when exposed | Own artifact schema, content, lifecycle and meaning |
| Profile | Only locate or render exposed profile views | Compose and own profile state and semantics |
| Review | Render or index exposed review summaries | Define review rubric, verdict meaning and promotion policy |
| Lesson/memory | Provide generic broker/admission ledger when requested | Decide what becomes reusable domain knowledge |
| Audit | Audit Host/platform actions | Audit domain actions and expose summaries if useful |
| Search | Offer platform search/index broker when granted | Decide searchable fields and result meaning |

## Protocol Surfaces

Host 和 Soul App 之间的交互只通过显式协议面完成：

```text
manifest -> compatibility, permissions, routes, slots, capabilities
health -> mounted service readiness
views -> app-owned UI surfaces Host can render or route
actions -> app-owned commands Host can expose in shell
status -> app-owned lifecycle/workflow summaries
descriptors -> artifact/profile/review/memory summaries exposed for Host indexing
brokers -> Host-owned storage, connector, secret-ref, search, log and audit capabilities
events -> optional app-emitted lifecycle/domain events
```

协议原则：

- Host 可以缓存 descriptor，不拥有 descriptor 指向的领域事实。
- Host 可以提供 route 和 shell，不拥有 route 内的领域体验。
- Host 可以提供 broker，不拥有 broker 内 app 写入的领域内容。
- Host 可以展示 app 的 review 或 memory status，不解释 status 对业务流程的含义。
- Soul App 不直接读取 Host 私有 DB、secret、connector credential 或 sibling app 源码。

## Shell Contract

Host 当前保留统一 shell layout，因为它提供跨 Soul App 的定位能力：

- installed/enabled Soul App；
- Soul worker；
- workspace；
- session；
- global settings；
- local daemon status；
- platform capability grants。

Mounted Soul App 可以通过协议配置 Host header：

- title / subtitle；
- breadcrumb；
- primary action，例如 HR 的 “New People Profile”；
- searchbar；
- action menu；
- left/right drawer toggles；
- refresh；
- app-specific settings。

这个 header 合同是 Host 与 Soul App 的协议面，不是 Host 对领域 UI 的硬编码。Standalone 模式下
Soul App 拥有自己的完整 shell；Host mounted 模式下，Soul App 只适配 Host 暴露的壳。

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

## Engine And MCP

Host 维护默认 engine、local MCP、BYOK、语言、外观和 autosave 等横向配置，并透传给 Soul App
或 mounted runtime。

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
- Secret 只能放 `.env`、vault 或 secret reference；不得写入 manifest、generated app config、
  workspace metadata、DB metadata、日志、prompt、review rubric 或 skill 文件。
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
  core/              local runtime, Host services and engine adapters
  shared/            shared schemas and Host/Soul App protocol types
  soul-app-sdk/      public SDK for Soul App authors
  soul-app-runtime/  standalone and mounted runtime harness
  storage-sqlite/    worker.db schema, migrations and repositories
  fs-layout/         AIWORKER_HOME, worker and workspace path helpers
  component/         shared UI primitives and patterns
```

## API And Validation Rules

- API 文档以代码为准：OpenAPIHono `app.doc('/openapi.json')` + `/docs`。
- 新增或修改 API 时同步 zod schema、OpenAPI metadata、typed client/proto 和相关测试。
- Schema 变更通过 `packages/storage-sqlite` 的 Drizzle schema 与 migration 生成。
- Soul App 变更必须跑 `aiworker app validate <app-path>`。
- 影响 standalone 或 Host mounted surface 时必须跑 `aiworker app smoke <app-path>`。
- Host/Soul protocol 变更必须同时验证 standalone 与 Host mounted 语义。

## Current Historical Boundaries

以下内容只作为历史实现或底层 guardrail，不是默认产品入口：

- legacy gateway/fleet/control-plane；
- governance kernel first surface；
- generic agent runtime platform；
- developer-only work order loop；
- 旧 Open Design 或外部产品映射叙事。

当前开发必须从 `AGENTS.md` 和本文开始。旧 PMA、changelog、Superpowers spec/plan 是历史证据，
不能覆盖本文合同。
