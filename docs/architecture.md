# AIWorker Architecture

本文是 AIWorker 当前唯一架构合同。根 `AGENTS.md` 说明 agent 如何执行工作；本文说明系统
应该是什么。旧北极星文档、PMA/changelog/Superpowers 记录只作为审计轨迹，不再作为入口或
约束来源。

## 产品定位

AIWorker = Local Shell + Engine Bridge for Soul Apps.

AIWorker 是 **Local Shell + Engine Bridge for Soul Apps**。

它的职责是帮助用户在本地启动 Soul App、进入 workspace、打开 session、把上下文交给外部
engine，并回到 Soul App 拥有的业务工作面。AIWorker 不把领域对象、业务输出、业务确认、
app-owned history 或通用 agent runtime 作为 Host 产品内核。

当前产品路径：

```text
AIWorker -> Soul App -> workspace -> session -> app-owned work
```

Host 的最小职责是 start, shell, locate, mount and bridge：

- start：发现、安装、启用和启动 Soul App；
- shell：提供本地 Web、CLI 和 daemon 入口；
- locate：维护 Soul worker、workspace 和 session 的本地路径与当前上下文；
- mount：以独立 app-owned surface 挂载 Soul App UI/API；
- bridge：为 session 准备 cwd、上下文文件和 engine invocation 入口。

第一原则：Host 不是 Soul App 的上层配置中心。Host-owned Worker Configuration 的 trigger、
dialog shell 和配置边界只到 **Soul worker**；同一 Soul App 下的不同 worker 必须彼此隔离。
workspace/session 可以作为不透明 locator/context 被 Host 传给 mounted Soul surface 或 engine
bridge，但不能成为 Host configuration scope。Soul App 只能通过 manifest/protocol descriptor
声明 Host 可泛化消费的选项；领域配置 UI、字段、保存逻辑和 workspace/session/domain 语义属于
Soul App 自己。

Soul App owns domain state, domain UI/API, domain outputs, domain confirmation
and standalone / mounted product experience.

External engines own their tool loop, model, sandbox, approval behavior, native
session, auth profile, plugins and memory. AIWorker only prepares and observes
the local session boundary.

## 核心原则

### 0. Host 配置边界止于 Soul worker

Host left panel、Host header、Worker Configuration trigger/dialog shell 属于 Host-owned
chrome。Worker Configuration 是针对一个 Soul worker 的 Host shell 配置入口，不是 Soul App
全局设置页，不是 workspace/session 配置页，也不是领域配置表单。Host 可以展示
manifest-derived options/status，并保存 worker-scoped Host shell preference；如果需要配置
workspace、session 或领域行为，必须进入 Soul-owned micro-app 或 app-owned API。

### 1. Host 是轻量本地运行壳

Host 只负责让 Soul App 在本地可启动、可定位、可挂载、可进入 session，并把 session context
交给 engine。Host 不承诺领域工作流、跨 Soul 编排或通用 agent runtime。

### 2. Soul App 是产品和领域主权方

Soul App 负责自己的业务对象、领域状态、UI/API、输出文件、确认动作、历史记录和 standalone
体验。HR 可以拥有 People Profile 与 profile update confirmation；QA 可以拥有 release
readiness 与 release decision。Host 不提供通用领域语义来解释这些动作。

### 3. Host 只定位和路由显式 app-owned surface

Host 可以读取 manifest、health、routes、mounted UI/API、session locator 和 workspace
context。Host 不读取隐藏 app state，不推断领域结果，不把 app 文件翻译成通用
artifact/profile/review/lesson，也不把 `ui.workbench` 描述符翻译成 Host-owned action/search
产品 API。

### 4. Standalone 和 Host mounted 共享同一个 app

Soul App 可以 standalone 运行，也可以 Host mounted。Host mounted 时，Host 只提供 mount
container、theme/context data、workspace/session locator 和 engine bridge；领域内调用留在
Soul App 内。

### 5. Host 不拥有领域工作流

如果某个垂直产品需要业务确认、历史记录、决策辅助或状态推进，必须在 Soul App 内以领域语言实现，
并由该 app 拥有数据、文案、确认规则和用户体验。Host 只负责定位、挂载和桥接。

## Constraint Registry

This registry is the normative source for active Host / Soul App constraints.
Thin layers such as `AGENTS.md`, README files, skills and authoring guides may
route agents to these IDs, but must not redefine them as separate contracts.

| ID | Rule | Owner | Enforced by | Thin references |
| --- | --- | --- | --- | --- |
| `ARCH-001` | The default product path is `AIWorker -> Soul App -> workspace -> session -> app-owned work`. Do not route default work back to developer-only work orders, admin dashboards, generic agent runtime platforms or Host-owned domain workflows. | Architecture | `scripts/check-doc-contract.ts`, active entrypoint review, product-path tests when UI changes | `AGENTS.md`, `README.md`, route skills |
| `HOST-001` | Host owns only start, shell, locate, mount and bridge. Host must not own domain meaning, business output lifecycle, cross-Soul orchestration, app-owned history, domain confirmation semantics or engine-native tool loops. | Host | Host API/core/Web/CLI tests, code-review-graph when code changes | `aiworker-host-dev`, `AGENTS.md` |
| `SOUL-001` | Soul App owns domain state, domain UI/API, app-owned outputs, app-owned confirmation actions, standalone product experience and mounted product surface. | Soul App | `aiworker app validate`, `aiworker app smoke`, app package tests | `aiworker-soul-app-dev`, `docs/soul-app-developer.md` |
| `CONFIG-001` | Host-owned Worker Configuration is scoped to one Soul worker. Its trigger and dialog shell are Host chrome, not Soul-registered UI. Soul Apps may expose manifest/protocol descriptors that Host displays as generic worker-scoped options/status, but workspace/session ids are opaque locator or bridge context only and must not become Host configuration scopes. Domain, workspace and session configuration belongs in Soul-owned micro-app UI or app-owned API. | Host + Soul boundary | Worker Web tests, docs contract, boundary review, code-review-graph when code changes | `AGENTS.md`, Host and Soul App skills, `docs/soul-app-developer.md` |
| `PROTO-001` | Host may route only manifest-declared routes, mounted UI/API paths, workspace context and session context. Workspace/session ids are opaque locator or bridge context, not Host configuration scopes. If a surface is not declared, Host stops instead of fetching, inferring, synthesizing or translating app behavior. Host must not translate workbench action/search descriptors into Host product APIs. | Shared boundary | manifest/protocol schema tests, mounted API tests | Host and Soul App skills |
| `IMPORT-001` | Soul App production code must not import Host private packages or sibling app `src`; Host code must not import Soul App `src`. Public SDK, runtime harnesses, manifests, mount descriptors and shared fixtures are the allowed boundary objects. | Shared boundary | `scripts/check-soul-app-boundaries.ts` (via `lint`), `scripts/check-soul-app-boundaries.test.ts` | Host and Soul App skills |
| `MOUNT-001` | Host-mounted app-owned UI uses `@micro-zoe/micro-app` as the standard runtime. Universal workbench, domain workbench and configuration surfaces are all Soul-owned `micro-app` surfaces when mounted; Host resolves declared surfaces into mount payloads, proxies app-owned mounted API paths, and passes narrow context data. Soul Apps serve `/micro-app/*` HTML and dispatch only lightweight lifecycle UI events such as ready, error or resize. | Shared boundary | manifest tests, mounted API tests, Worker Web tests, app validate/smoke | Host and Soul App skills |
| `DATA-001` | `worker.db` stores Host metadata only: installed apps, workers, workspaces, sessions, engine invocation references, protocol cache needed for routing and platform file references. Full business content and domain facts stay in Soul App workspace files or app-owned storage. | Host storage + Soul App | storage schema tests, protocol descriptor tests | architecture data section, route skills |
| `ENGINE-001` | Host is an engine bridge. It prepares cwd, context files, selected engine metadata and invocation boundaries. External engines own model behavior, tool loop, sandbox, approval, native session, auth profile, plugins and memory. | Host + engine boundary | CLI/API/session tests, engine adapter tests | CLI docs, deployment docs, route skills |
| `UI-001` | Host Web and official Soul App web UI are shadcn-first. `packages/ui` is the shadcn-managed primitive, theme and preset-icon source; app UI must follow the active shadcn `iconLibrary`. Host Web must not surface Host-owned domain panels as the default product experience. | Host + Soul App UI | `scripts/check-web-ui-components.ts`, focused Web/Soul App tests, Playwright visual checks | `AGENTS.md`, Host and Soul App skills, shadcn skill |
| `DOC-001` | Active normative docs are `AGENTS.md` and this architecture file. `docs/task`, `docs/plan`, `docs/superpowers` and `docs/changelog.md` are audit trail; they cannot override the active contract. | Documentation | `scripts/check-doc-contract.ts`, PMA closeout review | `AGENTS.md`, README, skills |

## 系统拓扑

```text
Human operator
External runtime or operator
  -> AIWorker local shell
      -> Local daemon API
      -> Soul App registry / install enablement
      -> Soul worker locator
      -> Workspace locator
      -> Session context
      -> Mounted Soul App surface
      -> Engine bridge
```

Host 维护的是运行定位对象：

- installed app；
- enabled app；
- worker binding；
- workspace locator；
- session locator；
- engine invocation reference；
- mounted surface reference；
- local shell preference scoped to the Soul worker。

Host may hold workspace and session locators so it can mount Soul surfaces and
prepare engine bridge context. Those locators do not create Host-owned
workspace/session configuration layers.

Soul App 维护的是产品对象：

- domain model；
- app-owned workspace type；
- app-owned session workflow；
- app-owned output files/state；
- app-owned confirmation actions；
- app-owned history or memory if the product needs it。

## 权责边界

| Surface | Host | Soul App |
| --- | --- | --- |
| App lifecycle | Discover, install, enable, disable, route, launch | Provide manifest, health, compatibility and entrypoints |
| Shell | Own local Web/CLI/daemon shell and locator chrome | Own standalone shell and mounted product surface |
| Workspace/session | Locate local paths and bind session context | Decide business meaning and app workflow |
| Worker Configuration | Own Host chrome, trigger, dialog shell and worker-scoped shell preference | Expose descriptors or app-owned config surfaces; own domain/workspace/session configuration |
| Engine | Prepare cwd/context/invocation boundary | Decide prompts, app instructions and domain output expectations |
| UI/API | Mount or proxy declared surfaces | Own domain UI/API and app-local routes |
| Output | Locate app-owned files or references | Own schema, content, lifecycle and meaning |
| Confirmation | No Host-owned domain confirmation flow | Own domain confirmation actions if needed |
| History | No default generic audit ledger | Own app history if useful |
| Memory | No Host-owned domain memory path | Own domain memory semantics if useful |

## Protocol Surfaces

Host 和 Soul App 之间只保留显式运行面：

```text
manifest -> compatibility, routes, mounted entries, workspace/session hints
health -> mounted service readiness
views/routes -> app-owned micro-app UI surfaces Host can mount or route
mounted api -> app-owned local API paths Host can proxy without descriptor translation
workspace context -> app-declared opaque locator hints, not Host configuration
session context -> cwd, selected engine, context files and invocation reference, not Host configuration
events -> optional lightweight app UI lifecycle events
```

Host 不提供 Host-owned 领域协议面。必要的本地文件、connector 或 engine 行为必须在后续独立设计中以
thin adapter 或 app-owned mechanism 重新评估，不能从历史实现继承为默认合同。

## Host Shell And Workbench Contract

Host 当前保留统一 shell layout，因为它提供跨 Soul App 的本地定位能力：

- installed/enabled Soul App；
- Soul worker；
- workspace；
- session；
- selected engine；
- local daemon status；
- mounted surface status。

Host header 是 platform-owned chrome。它可以包含固定 Host action，例如 sidebar、terminal
panel、settings 或 local status toggle。Host mounted Soul App 不定制 Host header，也不把领域
对象提升成 Host-owned panel。

Host left panel 中的 Worker Configuration trigger 和 dialog shell 也是 platform-owned
chrome。它只针对当前 Soul worker。Soul App 不向 Host left panel、header、toolbar 或 Worker
Configuration slot 注册自定义 UI；Soul 只能通过 manifest/protocol descriptor 告知 Host 可被
泛化展示或挂载的选项。Host 不把这些 descriptor 提升成 Soul/App 全局设置，也不下钻成
workspace/session Host 配置。

Mounted Soul Apps expose product coordination through declared micro-app routes,
mounted entries, app-owned API paths and workspace/session hints. Host may mount
or proxy only declared surfaces; it does not translate `ui.workbench`
action/search descriptors into Host toolbar controls or Host product routes.
Standalone 模式下 Soul App 拥有自己的完整 shell；Host mounted 模式下，Soul App owns its
workbench surface inside Host shell.

如果未来某个垂直 app 证明全页接管比 Host header 更清晰，可以新增 mount mode，但不能让 Host
开始解释领域对象。

## Data Contract

`worker.db` stores Host metadata only:

- installed apps；
- enabled app state；
- workers；
- workspaces；
- sessions；
- engine invocation references；
- protocol cache needed for routing；
- mounted surface references；
- platform file references。

Full business content stays in Soul App workspace files or app-owned storage.
Host does not store domain facts, domain state, business confirmations or
app-owned history as product primitives.

Browser-side storage remains UI preference storage, not a product data boundary:

- Host Web uses Host-owned keys for shell preferences and local status；
- Host-owned shell preferences under Worker Configuration are scoped by Soul
  worker and must not become Soul-level, app-level, workspace-level or
  session-level configuration；
- mounted Soul App UI receives narrow mount context through micro-app data；
- Soul App production code owns app-local drafts or preferences through its SDK/runtime helpers；
- business files, facts and confirmations stay in app workspace files or app-owned storage。

## Engine Bridge

Host prepares session cwd, context files, selected engine metadata and the local
invocation boundary. External engines own tool loop, model behavior, sandbox,
approval prompts, native session, auth profile, plugins and memory.

Developer Soul remains a supporting vertical app for code review, release
evidence, repo report, handoff or risk audit. It is not the center of the
AIWorker product contract.

## Isolation And Security

硬约束：

- Soul App production code must not import Host private packages such as
  `@zonease/aiworker-core`, `@zonease/aiworker-api`,
  `@zonease/aiworker-storage-sqlite` or `@zonease/aiworker-web`。
- Soul App production code must not import sibling app `src`。
- Host code must not import Soul App `src` to render or interpret domain UI。
- app 之间不共享默认 workspace storage、browser storage key 或 API route。
- Secret 只能放 `.env`、vault 或 secret reference；不得写入 manifest、generated app config、
  workspace metadata、DB metadata、日志、prompt、review rubric 或 skill 文件。
- Secret 不得写入 browser `localStorage` 或 `sessionStorage`。
- Host may pass only narrow signed context to mounted app-owned UI。
- 1.0.0 前允许破坏性收敛，优先保证当前合同清晰，不保留拖累边界的旧 shim。

## Repository Map

```text
apps/
  cli/            aiworker CLI and local daemon lifecycle entry
  api/            local daemon API and Worker Web static host
  web/            Host Web Shell and mounted workbench
  aiworker-hr/    official HR Soul App
  aiworker-qa/    official QA Soul App
  aiworker-custom/  official general-purpose Soul App

packages/
  core/              local runtime, Host services, app registry and engine adapters
  shared/            shared schemas and Host/Soul App protocol types
  soul-app-sdk/      public SDK for Soul App authors
  soul-app-runtime/  standalone and mounted runtime harness
  soul-app-workbench/ Soul-owned shared workbench UI surfaces
  ui/                shadcn-managed shared UI primitives and theme variables
  storage-sqlite/    worker.db schema, migrations and repositories
  fs-layout/         AIWORKER_HOME, worker and workspace path helpers
```

## Development Entry Routing

Architecture ownership decides the development route:

| Change area | Owner | Repo path | Agent route |
| --- | --- | --- | --- |
| local daemon API, app registry, locator, mounted service launch, engine bridge | Host | `apps/api`, `packages/core`, `packages/storage-sqlite`, `packages/fs-layout` | `.agents/skills/aiworker-host-dev/SKILL.md` |
| Host Web Shell, Settings, Worker Configuration, worker/workspace/session locator, mounted container | Host | `apps/web`, `packages/ui` | `.agents/skills/aiworker-host-dev/SKILL.md` |
| CLI lifecycle, daemon/app/worker/workspace/session/engine commands | Host | `apps/cli`, `docs/cli.md` | `.agents/skills/aiworker-host-dev/SKILL.md` |
| shared Host/Soul manifest, mount, session, engine or workspace schema | Shared boundary | `packages/shared`, affected Host package, affected Soul App manifest or SDK/runtime package | Start here, classify Host vs Soul ownership, then use the matching skill |
| Soul App domain UI/API, manifest, standalone, Host mounted handler, app-owned outputs and confirmation actions | Soul App | `apps/aiworker-*`, `packages/soul-app-sdk`, `packages/soul-app-runtime` | `.agents/skills/aiworker-soul-app-dev/SKILL.md` |

## API And Validation Rules

- API 文档以代码为准：OpenAPIHono `app.doc('/openapi.json')` + `/docs`。
- 新增或修改 API 时同步 zod schema、OpenAPI metadata、typed client/proto 和相关测试。
- Schema 变更通过 `packages/storage-sqlite` 的 Drizzle schema 与 migration 生成。
- Soul App 变更必须跑 `aiworker app validate <app-path>`。
- 影响 standalone 或 Host mounted surface 时必须跑 `aiworker app smoke <app-path>`。
- Host/Soul protocol 变更必须同时验证 standalone 与 Host mounted 语义。
- Engine bridge 变更必须验证 cwd、context files、selected engine metadata 和 invocation boundary。
- 文档合同变更必须跑 `bun run docs:check`，并确认失败项是否仅来自未迁移的 companion active docs。

## Current Historical Boundaries

当前开发必须从 `AGENTS.md` 和本文开始。`docs/task`、`docs/plan`、`docs/superpowers` 与
`docs/changelog.md` 是审计轨迹，不能覆盖本文合同。不要从旧审计记录恢复默认产品入口或命名。
