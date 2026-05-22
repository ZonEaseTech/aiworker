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

Soul Apps must treat human-facing UI/workbench surfaces and external-operator
protocol/MCP/API/descriptor surfaces as entry modes over the same app-owned
domain state. These surfaces may differ, but they must resolve to the same
workspace/session/output/domain-object semantics owned by the app.
Soul Apps should not assume a specific external agent runtime; callers outside
AIWorker own reasoning, scheduling and orchestration.

## Create

```bash
aiworker app create <app-id> --dir <target-dir>
```

Production Soul Apps live under `apps/<app-id>/`. The scaffold creates:

- `soul-app.manifest.json`
- `engine-assets/workspace` and `engine-assets/skills`
- `product/workflows`, `product/artifacts`, `product/reviews`,
  `product/profiles`, and `product/web`
- `host-adapter/index.ts`, `host-adapter/mounted/host-mounted.ts`, and
  `host-adapter/standalone/standalone.ts`
- package scripts for `validate`, `smoke`, and `typecheck`

The starter manifest follows the current mounted design: app-owned UI surfaces
use `renderer: "micro-app"` with `/micro-app/*` mounted entries, and process
locator intent such as terminal cwd lives under `ui.workspaceContext`.
`ui.workbench` action/search/configuration descriptors are compatibility
metadata for app-owned entry modes; Host no longer renders or invokes them as
generic product controls.
Generated Host-mounted services implement the matching `/micro-app/*` routes
and app-owned local API paths such as `/api/briefs` or `/api/briefs/search`;
they do not declare or customize Host header slots.
Mounted HTML should bind to the official micro-app child API:
`window.microApp.getData`/`addDataListener` receive Host mount context and
`window.microApp.dispatch` sends lightweight `ready`, `error` or `resize` UI
events back to Host. App actions and search should run inside the micro-app or
through app-owned mounted API paths; domain semantics do not belong in the data
channel.

Official Soul App web surfaces compose shared controls from `packages/ui`
shadcn primitives. Domain-specific profiles, release decisions, accepted state,
supporting evidence and artifact semantics stay in the owning app's `product/web` code. For non-trivial app web
changes, record the checked `packages/ui` primitives and run `bun run ui:check`
with the app package tests.

Reference and production apps should use the fuller app layout:

```text
apps/<app-id>/
  soul-app.manifest.json
  engine-assets/
    workspace/
    skills/
  product/
    workflows/*/{prompt,review}.md
    artifacts/schemas/*.schema.json
    reviews/*.md
    profiles/*/SOUL.md
    web/
      artifact-previews/
      panels/
      routes/
      widgets/
  host-adapter/
    index.ts
    api.ts
    protocol/*.ts
    mounted/host-mounted.ts
    standalone/standalone.ts
```

Use kebab-case app ids. Storage namespace, protocol route prefix, mounted
service identity and manifest permission hints are app-scoped by default.

## Validate

```bash
aiworker app validate <target-dir>
```

Validation checks:

- manifest schema and host compatibility
- declared storage namespace and compatibility/permission hints
- artifact schema JSON files
- engine-visible workspace files, native skills, and MCP client config
- prompt, review, pack, UI, API, and mode entry file references
- Host-private imports from app adapter code
- sibling Soul App imports from app adapter code

App code should depend on `@zonease/aiworker-soul-app-sdk`. The validator flags
imports from Host private packages such as `@zonease/aiworker-core`,
`@zonease/aiworker-api`, `@zonease/aiworker-storage-sqlite`, and direct imports
from sibling apps such as `@zonease/aiworker-hr` or `@zonease/aiworker-qa`.

## Engine Assets Projection

`engine-assets/` is the canonical source for files that AIWorker projects into
workspace roots for native engines. Keep these files as ordinary source files so
they are visible in review, easy to debug, and available for app or user
iteration.

```text
engine-assets/workspace/**
  -> <workspace>/**

engine-assets/skills/<skill-id>/SKILL.md
  -> <workspace>/.agents/skills/<app-id>-<skill-id>/SKILL.md
  -> <workspace>/.claude/skills/<app-id>-<skill-id>/SKILL.md
```

Workspace assets are projected 1:1 into the workspace root. Use them for
engine-facing instructions and stable workspace files such as `AGENTS.md`,
`CLAUDE.md`, `README.md`, app-local `.gitignore`, and other text assets that
should be inspectable. `CLAUDE.md` should stay as a one-line `@AGENTS.md`
reference when the same rules apply to Claude Code.

Native skills are app-owned domain assets. They should describe the action
purpose, required inputs, artifact shape, acceptance boundary and write rules
that keep an engine session aligned with the Soul App workflow. Projected skill
copies are workspace-visible and should not be ignored by default; a user or app
may intentionally iterate them as part of the workspace history.

Only runtime or sensitive outputs should be ignored by the projected workspace
`.gitignore`, for example `.aiworker/sessions/`, `.aiworker/projections.json`,
and raw evidence folders that may contain sensitive source material. Do not
ignore stable projected instructions, native skills, or inspectable artifacts just
because they came from AIWorker.

## MCP Client And Server Declarations

Soul Apps may declare workspace-local MCP client config under `engineAssets`.
Runtime projects only the selected supported engine target:

```text
engine-assets/mcp-clients/codex/config.toml
  -> <workspace>/.codex/config.toml

engine-assets/mcp-clients/claude-code/.mcp.json
  -> <workspace>/.mcp.json
```

Generated MCP client config must not contain literal secrets, bearer tokens,
API keys or connector credentials. Use environment wiring, secret references or
manifest-declared connector hints instead of writing secrets into manifest
files, `engine-assets/`, generated app config, workspace metadata or logs.

`engineAssets.mcpServers` is only for reusable MCP server packages that AIWorker
can validate as generic engine assets. Use package names such as
`packages/mcp-ats` or `@zonease/aiworker-mcp-ats`; avoid names that encode a
Soul App workflow such as `aiworker-hr-candidate-screening-mcp`. Workflow
meaning belongs in `product/`, while a reusable MCP package exposes
external-system capability.

Vertical or strongly app-owned local MCP servers are different. Keep their code
with the owning Soul App, product repository, or deployment project, and bind
them to a workspace through Host workspace MCP binding metadata, manifest
permission hints and secret references. A TTPOS operations MCP server, for
example, should not be imported into AIWorker core unless it is intentionally
generalized into a reusable package. The Soul App may recommend or require that
binding through its own product documentation or future protocol descriptors,
but Host still only prepares local enablement metadata and secret wiring.

If a Soul App needs an agent-operable surface for an external runtime, the app
decides whether that surface is an app-owned API path, descriptor, MCP
tool/resource/prompt, or a combination of these. Host-provided MCP plumbing may
locate configured adapters and pass approved context, but it must not invent
domain tools or translate app-owned meanings into generic platform semantics.

## Smoke

```bash
aiworker app smoke <target-dir>
```

Smoke uses an isolated temporary `worker.db`, installs and enables the app
manifest, projects it into the Host app catalog, creates a worker/workspace/
session, and runs a mocked engine turn for the app's declared workflow. For apps
that declare standalone support, it also starts a temporary local HTML smoke
server and fetches it to prove the standalone surface is browser-openable. For
apps that declare a host-mounted local service command, it starts the service,
checks the health route, and injects the discovered base URL into the temporary
Host-mounted smoke manifest. Smoke no longer invokes generic Host workbench
action/search descriptors; product behavior belongs inside the mounted micro-app
or app-owned mounted API paths.

The output reports:

- app id
- standalone support status
- standalone smoke URL and HTTP status
- mounted service URL and HTTP status, when declared
- Host mounted status
- hosted registry status
- artifact count or exposed descriptor count
- review verdict when the app exposes a review surface

## Design Boundary

Host owns local shell and engine-bridge concerns:

- start: discover, install, enable, disable, route and launch Soul Apps
- shell: local daemon lifecycle, Web shell, CLI entry and shell preferences
- locate: worker/workspace/session locators and selected engine context
- mount: manifest-declared routes, micro-app surfaces and app-owned local adapters
- bridge: session cwd/context files and engine invocation boundary
- metadata: installed/enabled app state, routing cache, mounted surface references and platform file references

Soul Apps own domain concerns:

- domain definitions and UI/API
- workspace types and session workflows
- capability prompts
- artifact schemas, content and lifecycle
- profile composition
- acceptance checks and product decisions
- domain memory or history semantics
- app-scoped storage content
- standalone runtime surface
- Host mounted runtime surface

Standalone app-local calls stay inside the Soul App:

```text
Soul App UI/API -> app-local runtime -> app-local workspace/session/domain store
```

Mounted calls cross the Host boundary only through declared app-owned surfaces
or thin local adapters:

```text
Host shell -> static manifest/protocol -> mounted local service -> thin Host adapter
```

If Host needs to show app-owned state, the app must expose it as a declared
micro-app surface, app-owned mounted API path, status or descriptor. Host should
not infer HR profiles, QA release verdicts, accepted state, domain history or memories
from app files, DB rows, prompts or UI labels.

Host no longer exposes generic action/search/configuration invocation from
`ui.workbench`. Those descriptors may remain as compatibility metadata for
app-owned services or external clients, but product execution
belongs inside the micro-app or through app-owned mounted API paths. Host must
reject undeclared mounted API paths and must not infer app domain behavior from
protocol names.

Mounted Soul Apps must not declare Host header slots. Host header title,
primary action, searchbar, action menu, drawer toggles, refresh and app
configuration placement are Host-owned chrome. App-owned actions/search/
configuration belong inside the mounted micro-app UI or app-owned API surface,
not as Host toolbar placement.

If a Soul App needs Host process coordination, such as a future web terminal, it
should expose workspace locator intent through `ui.workspaceContext`. Terminal
cwd descriptors must use one of the explicit sources:

- `host-workspace-root`
- `app-workspace-path` with `subpath`
- `protocol-resolver` with `protocolProvider`

Host owns terminal rendering, process lifecycle and authorization. Soul Apps
only declare the workspace context needed to resolve the correct location.
Host enablement checks are local and lightweight. Host may inspect manifest
compatibility, declared permission hints, connector or secret-reference hints,
mount entries and runtime availability to decide whether the local shell can
launch or route an app. This must not become a centralized approval, risk
scoring or domain approval layer.
Mounted Soul Apps receive only narrow mount context, not caller cookies, caller
authorization headers or Host private auth internals.
Browser `localStorage` and `sessionStorage` are not a durable domain storage
path. Current same-realm Host mounted Soul Apps are trusted first-party code and
must use the SDK scoped browser storage helper instead of raw Web Storage APIs.
Use the helper only for UI state such as filters, drafts and local preferences;
use app workspace files or app-owned storage for durable workspace/session/domain
records. Do not store secrets, bearer tokens, connector credentials or engine
credentials in browser storage.
Soul Apps may declare compatibility, connector, secret-reference and descriptor
requirements so Host can prepare local enablement metadata. Host does not expose
a provider, search or audit surface as an active product center, and must not
infer profile fields, review verdict semantics or private evidence from those
descriptors.

Use manifest-declared connector and secret-reference hints for external
evidence. Do not put secrets in manifest files, generated app config, workspace
metadata, DB metadata, logs, prompts, review rubrics or skill files.

Use `createSoulAppWebStorage(...)` for Host-mounted browser state:

```ts
const storage = createSoulAppWebStorage({
  appId,
  sessionId,
  workerId,
  workspaceId,
})

storage.local.set('filters', { status: 'open' })
storage.session.set('draft', { body: '...' })
```

The helper writes only scoped `aiworker:app:<appId>:...` keys and exposes
`clearScope()` instead of global `localStorage.clear()`. `aiworker app validate`
fails production Soul App source that directly uses raw `localStorage` or
`sessionStorage`.

## Contribution Checklist

- Open or update a PMA task and plan for each new production app.
- Keep workspace, capability, artifact, profile, connector, permission,
  accepted-state and domain-history terms understandable to the vertical user.
- Run `aiworker app validate <path>` and `aiworker app smoke <path>`.
- Run focused package tests and typecheck for app code.
- Run `bun run crg:update` and `bun run crg:review` before finalizing production
  code changes.
