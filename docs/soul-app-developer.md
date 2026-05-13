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

This document is the human-readable authoring guide. The skill is the
agent-native execution route. Keep both aligned with the same Host / Soul App,
workspace/session, artifact/profile/review/lesson, standalone, Host mounted,
manifest, SDK, protocol and broker vocabulary.

The canonical route is:

```text
root AGENTS.md -> docs/architecture.md -> aiworker-soul-app-dev skill
  -> app manifest/docs/files -> validate/smoke evidence
```

Do not treat `apps/AGENTS.md` as the canonical Soul App rule surface until the
target agent runner has proven native nested AGENTS loading.

Soul App is the source of truth for domain state and domain meaning.
Host is the source of truth for platform capabilities, grants, protocol discovery and shell context.
Host may consume only protocol-exposed views/actions/search/settings descriptors, and must not infer Soul App domain meaning.

## Create

```bash
aiworker app create <app-id> --dir <target-dir>
```

Production Soul Apps live under `apps/<app-id>/`. The scaffold creates:

- `soul-app.manifest.json`
- `src/index.ts`
- one workspace type, capability, artifact schema, review policy, and Soul pack
- package scripts for `validate`, `smoke`, and `typecheck`

Reference apps use the fuller app layout:

```text
apps/<app-id>/
  soul-app.manifest.json
  src/index.ts
  src/standalone.ts
  src/host-mounted.ts
  src/protocol/*.ts
  schemas/*.schema.json
  capabilities/*/{prompt,review}.md
  review/*.md
  packs/*/SOUL.md
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
- Host-private imports from `src/`
- sibling Soul App imports from `src/`

App code should depend on `@zonease/aiworker-soul-app-sdk`. The validator flags
imports from Host private packages such as `@zonease/aiworker-core`,
`@zonease/aiworker-api`, `@zonease/aiworker-storage-sqlite`, and direct imports
from sibling apps such as `@zonease/aiworker-hr` or `@zonease/aiworker-qa`.

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

Use connector broker permissions for external evidence. Do not put secrets in
manifest files, generated app config, workspace metadata, DB metadata, logs,
prompts, review rubrics or skill files.

## Contribution Checklist

- Open or update a PMA task and plan for each new production app.
- Keep workspace, capability, artifact, profile, connector, permission, review
  and lesson terms understandable to the vertical user.
- Run `aiworker app validate <path>` and `aiworker app smoke <path>`.
- Run focused package tests and typecheck for app code.
- Run `bun run crg:update` and `bun run crg:review` before finalizing Host code
  changes.
