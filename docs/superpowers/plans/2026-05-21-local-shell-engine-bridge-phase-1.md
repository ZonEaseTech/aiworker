# Local Shell + Engine Bridge Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active AIWorker architecture contract with Local Shell + Engine Bridge and make the documentation gate reject the old broker/review/governance Host contract.

**Architecture:** Phase 1 changes active documentation and the doc contract check only; runtime behavior stays unchanged. The architecture file becomes the normative source, while AGENTS, README, route skills and the Soul App authoring guide become thin references to the new Host responsibilities: start, shell, locate, mount and bridge.

**Tech Stack:** Markdown active docs, TypeScript doc-contract script, Bun `docs:check`, `git diff --check`.

---

## Scope Check

The approved design spans four subsystems: architecture contract, product entry, code removal and HR/QA vertical validation. This plan covers only Phase 1: architecture contract plus active documentation gate. Phase 2, Phase 3 and Phase 4 must each get a separate implementation plan after Phase 1 lands.

## File Structure

- Modify `scripts/check-doc-contract.ts`: change the enforced registry IDs and active-doc snippets so the old broker-centered Host contract fails the doc gate.
- Modify `docs/architecture.md`: rewrite product positioning, principles, registry, topology, responsibilities, data, engine and routing sections around Local Shell + Engine Bridge.
- Modify `AGENTS.md`: update agent execution rules to treat proposal/broker/review/audit/governance as deprecated Host concepts, while keeping PMA and code-review-graph workflow rules.
- Modify `README.md`: update public repo positioning without changing CLI/Web behavior yet.
- Modify `.agents/skills/aiworker-host-dev/SKILL.md`: update Host skill routing so Host work means local shell and engine bridge, not broker/security/governance platform work.
- Modify `.agents/skills/aiworker-soul-app-dev/SKILL.md`: update Soul App skill routing so domain confirmation/output semantics are app-owned and not Host-generic review/proposal concepts.
- Modify `docs/soul-app-developer.md`: update authoring guide terminology and remove the claim that broker/review/grant platform behavior is the active shared contract.

### Task 1: Make The Doc Gate Expect The New Contract

**Files:**
- Modify: `scripts/check-doc-contract.ts`

- [ ] **Step 1: Replace the registry ID list**

In `scripts/check-doc-contract.ts`, replace the `registryIds` array with:

```ts
const registryIds = [
  'ARCH-001',
  'HOST-001',
  'SOUL-001',
  'PROTO-001',
  'IMPORT-001',
  'MOUNT-001',
  'DATA-001',
  'ENGINE-001',
  'UI-001',
  'DOC-001',
]
```

- [ ] **Step 2: Replace architecture required snippets**

In `scripts/check-doc-contract.ts`, update the `requireIncludes('docs/architecture.md', [...])` call to:

```ts
requireIncludes('docs/architecture.md', [
  'AIWorker = Local Shell + Engine Bridge for Soul Apps',
  '## Constraint Registry',
  'start, shell, locate, mount and bridge',
  'proposal, broker, review, audit, governance, grant and admission are deprecated Host concepts',
  'scripts/check-doc-contract.ts',
  '`docs/task`, `docs/plan`, `docs/superpowers` and `docs/changelog.md` are audit trail',
])
```

- [ ] **Step 3: Replace active-doc required snippets**

Update the existing `requireIncludes` blocks for `AGENTS.md`, `README.md`, `docs/soul-app-developer.md`, `.agents/skills/aiworker-host-dev/SKILL.md`, and `.agents/skills/aiworker-soul-app-dev/SKILL.md` so they require the new contract and stop requiring `BROKER-001`.

Use this exact replacement for `AGENTS.md`:

```ts
requireIncludes('AGENTS.md', [
  'Local Shell + Engine Bridge',
  'start / shell / locate / mount / bridge',
  'Constraint Registry',
  'aiworker-host-dev',
  'aiworker-soul-app-dev',
  'shadcn',
  'Component Library Preflight',
  'bun run ui:check',
  '审计轨迹',
])
```

Use this exact replacement for `README.md`:

```ts
requireIncludes('README.md', [
  'Local Shell + Engine Bridge',
  'AIWorker -> Soul App -> workspace -> session -> app-owned work',
  'Constraint Registry',
  '.agents/skills/aiworker-host-dev/SKILL.md',
  '.agents/skills/aiworker-soul-app-dev/SKILL.md',
])
```

Use this exact replacement for `docs/soul-app-developer.md`:

```ts
requireIncludes('docs/soul-app-developer.md', [
  'docs/architecture.md#constraint-registry',
  '`SOUL-001`',
  '`PROTO-001`',
  '`IMPORT-001`',
  '`MOUNT-001`',
  '`DATA-001`',
  '`ENGINE-001`',
])
```

Use this exact replacement for `.agents/skills/aiworker-host-dev/SKILL.md`:

```ts
requireIncludes('.agents/skills/aiworker-host-dev/SKILL.md', [
  'docs/architecture.md#constraint-registry',
  '`ARCH-001`',
  '`HOST-001`',
  '`PROTO-001`',
  '`IMPORT-001`',
  '`MOUNT-001`',
  '`DATA-001`',
  '`ENGINE-001`',
  '`UI-001`',
  '`DOC-001`',
  'shadcn',
  'Component Library Preflight',
  'packages/component` is legacy migration debt',
])
```

Use this exact replacement for `.agents/skills/aiworker-soul-app-dev/SKILL.md`:

```ts
requireIncludes('.agents/skills/aiworker-soul-app-dev/SKILL.md', [
  'docs/architecture.md#constraint-registry',
  '`ARCH-001`',
  '`SOUL-001`',
  '`PROTO-001`',
  '`IMPORT-001`',
  '`MOUNT-001`',
  '`DATA-001`',
  '`ENGINE-001`',
  '`DOC-001`',
])
```

- [ ] **Step 4: Add active-doc forbidden old-contract snippets**

Add this block after the existing `README.zh-CN.md` forbidden checks:

```ts
forbidIncludes('docs/architecture.md', [
  '`BROKER-001`',
  '`OPERATOR-001`',
  'Host broker provider registry',
  'generic review/lesson ledger',
  'Host auth is provider-backed',
])
```

- [ ] **Step 5: Run the doc gate and confirm it fails before docs are rewritten**

Run:

```bash
bun run docs:check
```

Expected: FAIL. The output should include missing required text in active docs and missing `ENGINE-001` in `docs/architecture.md`.

### Task 2: Rewrite `docs/architecture.md` Around The Lightweight Kernel

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Replace the product positioning**

In `docs/architecture.md`, replace the content from `## 产品定位` through the paragraph before `## 核心原则` with:

````markdown
## 产品定位

AIWorker 是 **Local Shell + Engine Bridge for Soul Apps**。

它的职责是帮助用户在本地启动 Soul App、进入 workspace、打开 session、把上下文交给外部
engine，并回到 Soul App 拥有的业务工作面。AIWorker 不再把 proposal、broker、review、
audit、governance、grant、admission、generic artifact/profile/lesson 作为 Host 产品内核。

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

Soul App owns domain state, domain UI/API, domain outputs, domain confirmation
and standalone / mounted product experience.

External engines own their tool loop, model, sandbox, approval behavior, native
session, auth profile, plugins and memory. AIWorker only prepares and observes
the local session boundary.
````

- [ ] **Step 2: Replace the core principles**

Replace the full `## 核心原则` section with:

```markdown
## 核心原则

### 1. Host 是轻量本地运行壳

Host 只负责让 Soul App 在本地可启动、可定位、可挂载、可进入 session，并把 session context
交给 engine。Host 不再承诺通用 broker、review、audit、grant、governance 或 admission 平台。

### 2. Soul App 是产品和领域主权方

Soul App 负责自己的业务对象、领域状态、UI/API、输出文件、确认动作、历史记录和 standalone
体验。HR 可以拥有 People Profile 与 profile update confirmation；QA 可以拥有 release
readiness 与 release decision。Host 不提供通用 review/proposal 语义来解释这些动作。

### 3. Host 只定位和路由显式 app-owned surface

Host 可以读取 manifest、health、routes、mounted UI、session locator、workspace context 和
app-owned action descriptors。Host 不读取隐藏 app state，不推断领域结果，不把 app 文件翻译成
通用 artifact/profile/review/lesson。

### 4. Standalone 和 Host mounted 共享同一个 app

Soul App 可以 standalone 运行，也可以 Host mounted。Host mounted 时，Host 只提供 mount
container、theme/context data、workspace/session locator 和 engine bridge；领域内调用留在
Soul App 内。

### 5. 旧平台概念退出 Host 产品中心

proposal, broker, review, audit, governance, grant and admission are deprecated
Host concepts. 如果某个垂直产品需要类似能力，必须在 Soul App 内以领域语言重建，并由该 app
拥有数据、文案、确认规则和用户体验。
```

- [ ] **Step 3: Replace the registry table**

Replace the whole `## Constraint Registry` table with:

```markdown
## Constraint Registry

This registry is the normative source for active Host / Soul App constraints.
Thin layers such as `AGENTS.md`, README files, skills and authoring guides may
route agents to these IDs, but must not redefine them as separate contracts.

| ID | Rule | Owner | Enforced by | Thin references |
| --- | --- | --- | --- | --- |
| `ARCH-001` | The default product path is `AIWorker -> Soul App -> workspace -> session -> app-owned work`. Do not route default work back to developer-only work orders, admin dashboards, governance kernels, generic agent runtime platforms or Host-owned review/proposal flows. | Architecture | `scripts/check-doc-contract.ts`, active entrypoint review, product-path tests when UI changes | `AGENTS.md`, `README.md`, route skills |
| `HOST-001` | Host owns only start, shell, locate, mount and bridge. Host must not own domain meaning, business output lifecycle, generic proposal/review/audit/governance/admission semantics, cross-Soul orchestration or engine-native tool loops. | Host | Host API/core/Web/CLI tests, code-review-graph when code changes | `aiworker-host-dev`, `AGENTS.md` |
| `SOUL-001` | Soul App owns domain state, domain UI/API, app-owned outputs, app-owned confirmation actions, standalone product experience and mounted product surface. | Soul App | `aiworker app validate`, `aiworker app smoke`, app package tests | `aiworker-soul-app-dev`, `docs/soul-app-developer.md` |
| `PROTO-001` | Host may route only manifest-declared routes, mounted UI, action descriptors, workspace context and session context. If a surface is not declared, Host stops instead of fetching, inferring, synthesizing or translating app behavior. | Shared boundary | manifest/protocol schema tests, mounted API tests | Host and Soul App skills |
| `IMPORT-001` | Soul App production code must not import Host private packages or sibling app `src`; Host code must not import Soul App `src`. Public SDK, runtime harnesses, manifests, mount descriptors and shared fixtures are the allowed boundary objects. | Shared boundary | `scripts/check-soul-app-boundaries.ts`, `aiworker app validate`, package tests | Host and Soul App skills |
| `MOUNT-001` | Host-mounted app-owned UI uses `@micro-zoe/micro-app` as the standard runtime. Host resolves declared `micro-app` surfaces into mount payloads and passes narrow context data; Soul Apps serve `/micro-app/*` HTML and dispatch only lightweight UI events. | Shared boundary | manifest tests, mounted API tests, Worker Web tests, app validate/smoke | Host and Soul App skills |
| `DATA-001` | `worker.db` stores Host metadata only: installed apps, workers, workspaces, sessions, engine invocation references, protocol cache needed for routing and platform file references. Full business content and domain facts stay in Soul App workspace files or app-owned storage. | Host storage + Soul App | storage schema tests, protocol descriptor tests | architecture data section, route skills |
| `ENGINE-001` | Host is an engine bridge. It prepares cwd, context files, selected engine metadata and invocation boundaries. External engines own model behavior, tool loop, sandbox, approval, native session, auth profile, plugins and memory. | Host + engine boundary | CLI/API/session tests, engine adapter tests | CLI docs, deployment docs, route skills |
| `UI-001` | Host Web and official Soul App web UI are shadcn-first. `packages/ui` is the shadcn-managed primitive, theme and preset-icon source; app UI must follow the active shadcn `iconLibrary`. Host Web must not surface generic artifact/review/broker/governance panels as the default product experience. | Host + Soul App UI | `scripts/check-web-ui-components.ts`, focused Web/Soul App tests, Playwright visual checks | `AGENTS.md`, Host and Soul App skills, shadcn skill |
| `DOC-001` | Active normative docs are `AGENTS.md` and this architecture file. `docs/task`, `docs/plan`, `docs/superpowers` and `docs/changelog.md` are audit trail; they cannot override the active contract. | Documentation | `scripts/check-doc-contract.ts`, PMA closeout review | `AGENTS.md`, README, skills |
```

- [ ] **Step 4: Replace topology and responsibility sections**

Replace `## 系统拓扑` and `## 权责边界` with:

````markdown
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
- local shell preference。

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
| Engine | Prepare cwd/context/invocation boundary | Decide prompts, app instructions and domain output expectations |
| UI/API | Mount or proxy declared surfaces | Own domain UI/API and app-local routes |
| Output | Locate app-owned files or references | Own schema, content, lifecycle and meaning |
| Confirmation | No generic review/proposal flow | Own domain confirmation actions if needed |
| History | No default generic audit ledger | Own app history if useful |
| Memory | No generic admission path | Own domain memory semantics if useful |
````

- [ ] **Step 5: Replace protocol, data, engine and routing sections**

Edit the remaining sections so they match these rules:

````markdown
## Protocol Surfaces

Host 和 Soul App 之间只保留显式运行面：

```text
manifest -> compatibility, routes, mounted entries, workspace/session hints
health -> mounted service readiness
views/routes -> app-owned UI surfaces Host can render or route
actions -> app-owned commands Host can invoke only when declared
workspace context -> app-declared locator hints
session context -> cwd, selected engine, context files and invocation reference
events -> optional lightweight app UI lifecycle events
```

Host 不再提供通用 broker/review/proposal/audit/governance/admission 协议面。必要的本地文件、
connector 或 engine 行为必须在后续 Phase 2/3 中以 thin adapter 或 app-owned mechanism 重新
评估，不能从旧 Host broker 语义继承为默认合同。

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
Host does not store generic review rows, lesson ledgers, admission proposals,
profile promotion state or domain facts as product primitives.

## Engine Bridge

Host prepares session cwd, context files, selected engine metadata and the local
invocation boundary. External engines own tool loop, model behavior, sandbox,
approval prompts, native session, auth profile, plugins and memory.

Developer Soul remains a supporting vertical app for code review, release
evidence, repo report, handoff or risk audit. It is not the center of the
AIWorker product contract.

## Development Entry Routing

Architecture ownership decides the development route:

| Change area | Owner | Repo path | Agent route |
| --- | --- | --- | --- |
| local daemon API, app registry, locator, mounted service launch, engine bridge | Host | `apps/api`, `packages/core`, `packages/storage-sqlite`, `packages/fs-layout` | `.agents/skills/aiworker-host-dev/SKILL.md` |
| Host Web Shell, Settings, worker/workspace/session locator, mounted container | Host | `apps/web`, `packages/ui`, legacy `packages/component` references | `.agents/skills/aiworker-host-dev/SKILL.md` |
| CLI lifecycle, daemon/app/worker/workspace/session/engine commands | Host | `apps/cli`, `docs/cli.md` | `.agents/skills/aiworker-host-dev/SKILL.md` |
| shared Host/Soul manifest, mount, session, engine or workspace schema | Shared boundary | `packages/shared`, affected Host package, affected Soul App manifest or SDK/runtime package | Start here, classify Host vs Soul ownership, then use the matching skill |
| Soul App domain UI/API, manifest, standalone, Host mounted handler, app-owned outputs and confirmation actions | Soul App | `apps/aiworker-*`, `packages/soul-app-sdk`, `packages/soul-app-runtime` | `.agents/skills/aiworker-soul-app-dev/SKILL.md` |
````

- [ ] **Step 6: Run the doc gate and confirm only active-doc companion files remain failing**

Run:

```bash
bun run docs:check
```

Expected: FAIL because `AGENTS.md`, `README.md`, route skills and `docs/soul-app-developer.md` still need the new snippets. `docs/architecture.md` should no longer report missing `ENGINE-001` or forbidden `BROKER-001`.

### Task 3: Update Active Thin Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `.agents/skills/aiworker-host-dev/SKILL.md`
- Modify: `.agents/skills/aiworker-soul-app-dev/SKILL.md`
- Modify: `docs/soul-app-developer.md`

- [ ] **Step 1: Update `AGENTS.md` top contract**

Replace the opening target and default path in `AGENTS.md` with:

````markdown
# AIWorker Agent Guide

AIWorker 当前目标是 **Local Shell + Engine Bridge for Soul Apps**。Host 只保留
start / shell / locate / mount / bridge：启动 Soul App、提供本地 Web/CLI/daemon 壳、定位
worker/workspace/session、挂载 app-owned UI/API，并为 session 准备 cwd/context/engine 调用入口。

默认产品路径：

```text
AIWorker -> Soul App -> workspace -> session -> app-owned work
```

不要把默认体验拉回 developer-only work order、admin dashboard、远程控制面、治理内核、通用
agent runtime 平台，或 Host-owned proposal/broker/review/audit/governance/admission 流程。
````

- [ ] **Step 2: Update `AGENTS.md` boundary bullets**

In `AGENTS.md`, replace the Host/Soul boundary bullets under `## 产品与实现边界` with:

```markdown
- Host 是本地运行壳和 engine bridge，不是领域数据解释者，也不是通用治理平台。
- Host 只拥有 start / shell / locate / mount / bridge。
- Soul App 是领域主权方，拥有业务对象、领域状态、领域 UI/API、app-owned outputs、
  app-owned confirmation actions、standalone 体验和 Host mounted product surface。
- Host 只能消费 Soul App 通过 manifest/protocol 暴露的 route、mounted UI、action descriptor、
  workspace context、session context 或 lightweight UI event。
- 如果 Soul App 不暴露某个 surface，Host 不取、不猜、不补。
- proposal、broker、review、audit、governance、grant 和 admission 不再是 Host 产品内核。
- Workspace/project 是业务作用域，不等同于软件仓库；HR 可以是岗位或候选人池，QA 可以是
  release 或 test suite，DevOps 可以是 service、incident 或 runbook。
- 外部 engine 负责自己的 tool loop、模型、sandbox、approval、auth/profile、native session
  和插件生态；AIWorker 只在 session 层准备 cwd/context、调用或观察 engine。
- Developer Soul 只是 supporting role，用于 code review、release evidence、repo report、
  handoff、risk audit 等；不要让 repo/PMA/coding loop 成为产品中心。
```

- [ ] **Step 3: Update `README.md` opening and path**

Replace the first product description and path in `README.md` with:

````markdown
# AIWorker

AIWorker 正在收敛为 **Local Shell + Engine Bridge for Soul Apps**。

它不做另一个 developer engine、admin dashboard、治理内核、通用 broker 平台或通用 agent runtime。
Host 只负责启动 Soul App、提供本地 Web/CLI/daemon 壳、定位 worker/workspace/session、挂载
app-owned surface，并为 session 准备 cwd/context/engine 调用入口。业务对象、业务输出、
确认动作和历史记录由 Soul App 自己拥有。

```text
AIWorker -> Soul App -> workspace -> session -> app-owned work
```
````

- [ ] **Step 4: Update Host skill contract**

In `.agents/skills/aiworker-host-dev/SKILL.md`, replace the `## Product Contract` bullet list with:

```markdown
## Product Contract

Hard constraints live in `docs/architecture.md#constraint-registry`. Apply these
IDs before changing Host behavior:

- `ARCH-001`: keep the default product path centered on AIWorker -> Soul App
  -> workspace -> session -> app-owned work.
- `HOST-001`: Host owns only start, shell, locate, mount and bridge.
- `PROTO-001`: Host routes only declared app surfaces and stops when a surface
  is absent.
- `IMPORT-001`: Host must not import Soul App `src`.
- `MOUNT-001`: Host-mounted app-owned UI uses micro-app mount payloads and
  narrow context data; Host does not render app-domain UI.
- `DATA-001`: Host stores local metadata and references, not business facts or
  generic review/proposal/admission state.
- `ENGINE-001`: Host prepares cwd/context/invocation boundaries; external
  engines own tool loop, approval behavior, native sessions and memory.
- `UI-001`: Host Web and official Soul App web are shadcn-first through
  `packages/ui`; Host Web must not make generic artifact/review/broker/governance
  panels the default product surface.
- `DOC-001`: audit docs do not override the active architecture contract.
```

- [ ] **Step 5: Update Soul App skill contract**

In `.agents/skills/aiworker-soul-app-dev/SKILL.md`, replace the `## Product Contract` registry list with:

```markdown
## Product Contract

Hard constraints live in `docs/architecture.md#constraint-registry`. Apply these
IDs before changing Soul App behavior:

- `ARCH-001`: keep the default product path centered on AIWorker -> Soul App
  -> workspace -> session -> app-owned work.
- `SOUL-001`: Soul App owns domain state, domain meaning, app-owned outputs and
  app-owned confirmation actions.
- `PROTO-001`: app-owned state reaches Host only through declared protocol or
  mounted surfaces.
- `IMPORT-001`: Soul App code must not import Host private packages or sibling
  app `src`.
- `MOUNT-001`: Host-mounted app-owned UI is served from `/micro-app/*` entries
  and receives only narrow Host context through micro-app data.
- `DATA-001`: business content stays in app workspace files or app-owned storage.
- `ENGINE-001`: Host prepares engine context, while the app owns prompts,
  instructions and domain output expectations.
- `DOC-001`: audit docs do not override the active architecture contract.
```

- [ ] **Step 6: Update Soul App authoring guide top contract**

In `docs/soul-app-developer.md`, replace the opening section through the registry ID paragraph with:

```markdown
# Soul App developer workflow

Soul Apps are vertical products that can run standalone or mount into AIWorker
Host. App authors work against the public SDK, manifest protocol, mounted UI
runtime and local session context. Host is now a Local Shell + Engine Bridge;
business outputs, confirmation actions, history and domain semantics belong to
the owning Soul App.

## Agent Workflow

Repository agents should load `.agents/skills/aiworker-soul-app-dev/SKILL.md`
before creating or modifying production Soul Apps, Soul App authoring docs,
validation harnesses, scaffold behavior, manifests, standalone surfaces, Host
mounted surfaces, app-owned outputs, app-owned confirmation actions, profile
views, or protocol surfaces.

This document is the authoring guide. The skill is the agent-native execution
route. Hard constraints live in `docs/architecture.md#constraint-registry`.
This file may explain authoring implications, but must not redefine the Host /
Soul App contract.

Apply these registry IDs before changing app behavior: `SOUL-001`,
`PROTO-001`, `IMPORT-001`, `MOUNT-001`, `DATA-001` and `ENGINE-001`.
```

- [ ] **Step 7: Run doc gate and diff check**

Run:

```bash
bun run docs:check
git diff --check
```

Expected:

```text
docs contract ok (11 active files, 10 registry ids)
```

`git diff --check` should print no output and exit 0.

### Task 4: Commit Phase 1

**Files:**
- Modify: `scripts/check-doc-contract.ts`
- Modify: `docs/architecture.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `.agents/skills/aiworker-host-dev/SKILL.md`
- Modify: `.agents/skills/aiworker-soul-app-dev/SKILL.md`
- Modify: `docs/soul-app-developer.md`

- [ ] **Step 1: Confirm no unrelated dirty files are staged**

Run:

```bash
git diff --name-only --cached
```

Expected: no output before staging.

- [ ] **Step 2: Stage only Phase 1 files**

Run:

```bash
git add scripts/check-doc-contract.ts docs/architecture.md AGENTS.md README.md .agents/skills/aiworker-host-dev/SKILL.md .agents/skills/aiworker-soul-app-dev/SKILL.md docs/soul-app-developer.md
```

- [ ] **Step 3: Confirm staged scope**

Run:

```bash
git diff --cached --name-status
```

Expected:

```text
M	.agents/skills/aiworker-host-dev/SKILL.md
M	.agents/skills/aiworker-soul-app-dev/SKILL.md
M	AGENTS.md
M	README.md
M	docs/architecture.md
M	docs/soul-app-developer.md
M	scripts/check-doc-contract.ts
```

- [ ] **Step 4: Commit**

Run:

```bash
git commit -m "docs: 收敛轻量 Host 架构合同"
```

Expected: commit succeeds with only the seven staged Phase 1 files.

## Plan Self-Review

- Spec coverage: This plan covers architecture contract, deprecated Host concepts, active doc gate, active doc thin references and verification for Phase 1. Product entry, code removal and HR/QA validation are intentionally deferred to separate plans because they touch independent subsystems.
- Placeholder scan: No deferred implementation markers are used. Every changed file has exact snippets or commands.
- Type consistency: The new registry ID `ENGINE-001` is added to the architecture registry, script registry list, Host skill, Soul App skill and Soul App authoring guide. `BROKER-001` is removed from the enforced active contract.
