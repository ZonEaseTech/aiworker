# Soul App developer workflow

Soul Apps are vertical products that can run standalone or mount into AIWorker
Host. App authors should work against the public SDK, manifest protocol, and
brokered Host surfaces. They should not import Host private modules.

## Agent Workflow

Repository agents should load `.agents/skills/aiworker-soul-app-dev/SKILL.md`
before creating or modifying production Soul Apps, Soul App authoring docs,
validation harnesses, scaffold behavior, manifests, standalone surfaces, Host
mounted surfaces, artifact schemas, capability prompts, or review rubrics.

This document is the human-readable authoring guide. The skill is the
agent-native execution route. Keep both aligned with the same Host / Soul App,
workspace/session, artifact, review/lesson, standalone, Host mounted, manifest,
SDK, and broker vocabulary.

Do not treat `apps/AGENTS.md` as the canonical Soul App rule surface until the
target agent runner has proven native nested AGENTS loading. The current
canonical route is:

```text
root AGENTS.md -> aiworker-soul-app-dev skill -> app manifest/docs/files -> validate/smoke evidence
```

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

Use kebab-case app ids. The storage namespace, memory namespace, and API route
prefix are app-scoped by default.

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
manifest, projects it into the Host Soul catalog, creates a worker/workspace/
session, and runs a mocked engine turn that must produce an artifact and review.
For apps that declare standalone support, it also starts a temporary local HTML
smoke server and fetches it to prove the standalone surface is browser-openable.
For apps that declare a host-mounted local service command, it starts the
service, checks the health route, and injects the discovered base URL into the
temporary Host-mounted smoke manifest.

The output reports:

- app id
- standalone support status
- standalone smoke URL and HTTP status
- mounted service URL and HTTP status, when declared
- Host mounted status
- hosted registry status
- artifact count
- review verdict

## Design Boundary

Host owns engine adapters, connector credentials, Host metadata storage,
artifact indexing, reviews, memory admission, mounted service launch/connect,
and audit. Soul Apps own domain definitions, workspace types, capability
prompts, artifact schemas, review rubrics, UI/API contributions, standalone
runtime surface, and app-scoped storage declarations.

Standalone app-local calls stay inside the Soul App:

```text
Soul App UI/API -> embedded public local runtime -> app-local worker.db/workspace
```

Mounted calls cross the Host boundary only for shared capabilities:

```text
Host -> static manifest -> mounted local service -> Host broker for shared resources
```

Use connector broker permissions for external evidence. Do not put secrets in
manifest files, generated app config, workspace metadata, DB metadata, or logs.

## Contribution Checklist

- Open or update a PMA task and plan for each new production app.
- Keep workspace, capability, artifact, connector, permission, and review terms
  understandable to the vertical user.
- Run `aiworker app validate <path>` and `aiworker app smoke <path>`.
- Run focused package tests and typecheck for app code.
- Run `bun run crg:update` and `bun run crg:review` before finalizing Host code
  changes.
