# Soul App developer workflow

Soul Apps are vertical products that can run standalone or mount into AIWorker
Host. App authors work against the public SDK, manifest protocol, and brokered
Host capabilities. They must not import Host private modules or sibling app
source.

## Agent Workflow

Repository agents should load `.agents/skills/aiworker-soul-app-dev/SKILL.md`
before creating or modifying production Soul Apps, Soul App authoring docs,
validation harnesses, scaffold behavior, manifests, standalone surfaces, Host
mounted surfaces, artifact schemas, capability prompts, review rubrics, profile
views, or protocol surfaces.

This document is the authoring guide. The skill is the agent-native execution
route. Hard constraints live in `docs/architecture.md#constraint-registry`.
This file may explain authoring implications, but must not redefine the Host /
Soul App contract.

The canonical route is:

```text
root AGENTS.md -> docs/architecture.md -> aiworker-soul-app-dev skill
  -> app manifest/docs/files -> validate/smoke evidence
```

Use `.agents/skills/aiworker-host-dev/SKILL.md` instead when the change is
Host-owned: local daemon/API, CLI lifecycle, Worker Web Shell, Host settings,
app registry, broker enforcement, auth/security, storage metadata, shared Host
runtime, or shared Host/Soul protocol implementation.

Do not treat `apps/AGENTS.md` as the canonical Soul App rule surface until the
target agent runner has proven native nested AGENTS loading.

Apply these registry IDs before changing app behavior: `SOUL-001`,
`PROTO-001`, `IMPORT-001`, `DATA-001` and `BROKER-001`.

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
service identity and optional broker grants are app-scoped by default.

## Validate

```bash
aiworker app validate <target-dir>
```

Validation checks:

- manifest schema and host compatibility
- storage namespace and permission targets
- artifact schema JSON files
- prompt, review, pack, UI, API, and mode entry file references
- Host-private imports from app adapter code
- sibling Soul App imports from app adapter code

App code should depend on `@zonease/aiworker-soul-app-sdk`. The validator flags
imports from Host private packages such as `@zonease/aiworker-core`,
`@zonease/aiworker-api`, `@zonease/aiworker-storage-sqlite`, and direct imports
from sibling apps such as `@zonease/aiworker-hr` or `@zonease/aiworker-qa`.

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
API keys or connector credentials. Use Host connector grants, broker routes,
environment wiring or secret references instead of writing secrets into
manifest files, `engine-assets/`, generated app config, workspace metadata or
logs.

Executable MCP servers are generic monorepo packages, not app-private workflow
implementations. Use package names such as `packages/mcp-ats` or
`@zonease/aiworker-mcp-ats`; avoid names that encode a Soul App workflow such
as `aiworker-hr-candidate-screening-mcp`. Workflow meaning belongs in
`product/`, while the MCP server exposes reusable external-system capability.

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
Host-mounted smoke manifest.

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

Host owns platform concerns:

- local daemon lifecycle
- install/enable/disable state
- Host auth and session security
- global appearance, language, default engine, local MCP and connector settings
- permission, storage, connector, log, search and audit brokers
- worker/workspace/session locator
- Host shell and optional header contract
- mounted service launch/connect
- protocol discovery and descriptor cache

Soul Apps own domain concerns:

- domain definitions and UI/API
- workspace types and session workflows
- capability prompts
- artifact schemas, content and lifecycle
- profile composition
- review rubrics and verdict meaning
- lesson/memory promotion semantics
- app-scoped storage content
- standalone runtime surface
- Host mounted runtime surface

Standalone app-local calls stay inside the Soul App:

```text
Soul App UI/API -> app-local runtime -> app-local workspace/session/domain store
```

Mounted calls cross the Host boundary only for shared platform capabilities:

```text
Host shell -> static manifest/protocol -> mounted local service -> scoped Host broker
```

If Host needs to show app-owned state, the app must expose it as a protocol
view, action, status or descriptor. Host should not infer HR profiles, QA release
verdicts, review meaning, lessons or memories from app files, DB rows, prompts
or UI labels.

Host action/search/settings invocation must resolve a manifest-declared
descriptor first. Host must reject undeclared protocol actions or search
providers, and must not infer app domain behavior from protocol names.
Descriptor `requiredPermissions` are broker-enforced before Host contacts a
mounted Soul App service.
Host auth is provider-backed. Local bearer auth is the first implementation;
future Logto integration should stay behind the same Host provider boundary.
Mounted Soul Apps receive operator identity through signed mount context and
broker scope, not through caller cookies, caller authorization headers or Host
private auth internals.
Host storage broker providers own app-scoped namespaces and access control;
Soul Apps own stored value semantics.
Browser `localStorage` and `sessionStorage` are not a durable domain storage
path. Current same-realm Host mounted Soul Apps are trusted first-party code and
must use the SDK scoped browser storage helper instead of raw Web Storage APIs.
Use the helper only for UI state such as filters, drafts and local preferences;
use broker storage for durable workspace/session/domain records. Do not store
secrets, bearer tokens, connector credentials or engine credentials in browser
storage.
Host broker provider registry exposes storage, connector, audit and
secret-reference provider metadata through public broker routes. Soul Apps may
inspect this registry to adapt UX, but must not treat provider names as domain
truth or assume future cloud providers are active until the registry marks them
`active`.
Host search index broker accepts only non-authoritative descriptors such as
title, summary, reference and scope ids. Soul Apps decide what to publish and
what results mean; Host must not use the index to infer profile fields, review
verdict semantics or private evidence.
Host may project manifest permissions, connector needs and descriptor
`requiredPermissions` into a generic enablement security review before app code
runs. Soul Apps should make those declarations clear, but Host must not turn the
review into domain-specific approval logic.

Use connector broker permissions for external evidence. Do not put secrets in
manifest files, generated app config, workspace metadata, DB metadata, logs,
prompts, review rubrics or skill files.

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
- Keep workspace, capability, artifact, profile, connector, permission, review
  and lesson terms understandable to the vertical user.
- Run `aiworker app validate <path>` and `aiworker app smoke <path>`.
- Run focused package tests and typecheck for app code.
- Run `bun run crg:update` and `bun run crg:review` before finalizing Host code
  changes.
