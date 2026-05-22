---
name: aiworker-soul-app-dev
description: "Use when creating, modifying, or reviewing AIWorker Soul Apps under apps/aiworker-* or public Soul App authoring, manifest, SDK, standalone, Host mounted, app-owned artifact, review, profile, capability, scaffold, validate, or smoke surfaces."
argument-hint: "[app-path]"
arguments: [app_path]
---

# AIWorker Soul App Developer

Use this skill before touching a Soul App or the public surfaces that let agents
author, install, validate, smoke, mount, or review Soul Apps.

## Fit Check

Use this skill for:

- `apps/aiworker-*` production Soul App changes.
- `soul-app.manifest.json`, artifact schemas, review rubrics, packs,
  capability prompts, workspace types, standalone surfaces, Host mounted
  services, protocol handlers, app-owned UI/API, and app-declared adapter needs.
- Public authoring surfaces: `packages/soul-app-sdk`,
  `packages/soul-app-runtime`, shared manifest/protocol types, app scaffold,
  engine assets projection, `aiworker app validate`, `aiworker app smoke`, and
  `docs/soul-app-developer.md`.

Do not use this as a general validation-campaign router for published CLI
harnesses, Coder workspaces, or release-debug runs. Those are task-specific
flows, not current Soul App development routes.

Use `aiworker-host-dev` instead for Host platform lifecycle, local daemon API,
CLI lifecycle, Worker Web Shell rendering, thin local adapter compatibility,
shared storage schema, Host runtime, app registry, or shared Host/Soul protocol
implementation.

## Product Contract

Hard constraints live in `docs/architecture.md#constraint-registry`. Apply these
IDs before changing Soul App behavior:

- `ARCH-001`: keep the default product path centered on AIWorker -> Soul App
  -> workspace -> session -> app-owned work.
- `SOUL-001`: Soul App owns domain state, domain meaning, app-owned outputs and
  app-owned confirmation actions.
- `CONFIG-001`: Soul Apps may expose manifest/protocol descriptors for
  worker-scoped Host display, but must not register Host chrome or create
  Host-owned Soul/App/workspace/session configuration fields.
- `PROTO-001`: app-owned state reaches Host only through declared mounted UI/API
  surfaces, workspace context or session context.
- `IMPORT-001`: Soul App code must not import Host private packages or sibling
  app `src`.
- `MOUNT-001`: Host-mounted app-owned UI/API is served from `/micro-app/*`
  entries and app-owned mounted API paths, and receives only narrow Host context
  through micro-app data.
- `DATA-001`: business content stays in app workspace files or app-owned storage.
- `ENGINE-001`: Host prepares engine context, while the app owns prompts,
  instructions and domain output expectations.
- `DOC-001`: audit docs do not override the active architecture contract.

Use this vocabulary consistently: `Host`, `Soul App`, `Soul worker`,
`workspace`, `session`, `artifact`, `profile`, `review`, `lesson`,
`standalone`, `Host mounted`, `manifest`, `SDK`, `protocol`.

Practical Soul App implications:

- Own domain UI/API, standalone shell, mounted handlers, artifact schemas,
  profile composition, review rubrics and lesson/memory promotion semantics.
- Serve mounted UI from app-owned micro-app routes; keep domain UI in the app
  package instead of relying on Host Web renderers.
- Put mounted actions and search inside the micro-app UI or app-owned mounted
  API paths. `ui.workbench` is compatibility metadata, not a request to add Host
  toolbar controls or Host-owned action/search routes.
- Do not register Host left-panel triggers, header actions, toolbar buttons,
  Worker Configuration slots or Host-rendered domain fields. Domain,
  workspace and session configuration must live in Soul-owned micro-app UI or
  app-owned API.
- For official Soul App web surfaces, compose shared chrome and controls from
  `packages/ui` shadcn primitives, then keep domain-specific profile, review,
  release or lesson semantics inside the owning app.
- Own engine-facing workspace instructions, native skills and MCP client
  declarations under `engine-assets/`; runtime may project them into workspace
  roots, but the source stays app-authored and reviewable.
- Declare compatibility and permission hints on mounted surfaces whenever the
  action depends on a Host-provided local adapter or external connector.
- Do not put secrets in manifests, generated app config, workspace metadata, DB
  metadata, logs, prompts, review rubrics or skill files.
- Developer Soul is supporting infrastructure for review/evidence/handoff/risk
  audit, not the product center.

## Read Set

Load only what the task needs:

1. Always read `docs/architecture.md`.
2. Read `docs/soul-app-developer.md` for authoring, scaffold, validate, smoke,
   engine assets projection, standalone or mounted runtime changes.
3. For a target app, read its `soul-app.manifest.json` and touched files:
   `engine-assets/`, `product/`, `host-adapter/`, or app tests.
4. For official HR/QA app manifest or shell changes, also read
   `packages/shared/src/soul-app/fixtures.ts` and shared manifest tests; Host
   bootstraps from these reference manifests, not only from `apps/*` files.
5. For SDK/runtime/protocol changes, read the owning package tests before
   editing.

If `$app_path` is provided, start there. If it is missing, infer the target from
the user request or changed files. Ask only when the target cannot be inferred
safely.

## Workflow

1. Classify the surface: app domain, public authoring contract, Host adapter
   needs, Host shell protocol, validation/smoke, or docs.
2. Confirm the change belongs at that boundary. If a Soul App needs Host-owned
   resources, use protocol, SDK or declared adapter interaction instead of
   Host-private imports.
3. If the requested change actually modifies Host-owned behavior, switch to
   `aiworker-host-dev` and keep this skill focused on app-owned domain work.
4. Keep standalone and Host mounted modes aligned. They share one manifest,
   domain definitions, schemas, review rubrics, prompts and core handler
   semantics.
5. Keep engine assets source-backed. Workspace files, native skills and MCP
   client config should be ordinary reviewable files; ignore only runtime or
   sensitive outputs such as sessions, projection receipts and raw evidence.
6. Keep vertical-user language visible. HR, QA, finance, legal, ops, DevOps and
   PM users should see business objects, not Host internals.
7. If Host needs app-owned state, expose a micro-app surface, app-owned mounted
   API path, status or descriptor. If the app does not expose it, Host does not
   fetch, infer or synthesize it.
   Descriptors may inform generic worker-scoped Host options, but they do not
   give the app ownership of Host chrome or Host configuration scopes.
8. For non-trivial code/product changes, follow PMA and keep `docs/task/`,
   `docs/plan/` and `docs/changelog.md` synced when the change has
   project-level impact.

## Validation

Pick the smallest command set that proves the touched surface:

| Change | Verification |
| --- | --- |
| Production Soul App | `aiworker app validate <app-path>` and `aiworker app smoke <app-path>` |
| App package code | app package `typecheck` and `test` |
| App-owned web UI | app package `typecheck` and `test`; run `bun run ui:check` for official app web surface changes |
| Official app manifest/catalog | app validate/smoke, shared tests, and affected API/core tests |
| Engine assets projection | app validate/smoke and focused runtime/scaffold tests when projection code changed |
| SDK/runtime/protocol/shared schema | focused package tests and typecheck |
| CLI validate/smoke behavior | focused CLI tests and matching docs |
| Web Host shell interaction | focused Web tests; browser smoke only when UI behavior changed |
| Instruction-only skill/docs | `git diff --check` and reference/link search |

```bash
aiworker app validate <app-path>
aiworker app smoke <app-path>
```

For package code under an app, also run the app's focused typecheck and test
scripts when present:

```bash
bun run --filter '<package-name>' typecheck
bun run --filter '<package-name>' test
```

Run root gates only when the change touches shared contracts, CLI behavior, Host
runtime, cross-package configuration, or public release surfaces.

When code files changed, run code-review-graph before the final response:

```bash
bun run crg:update
bun run crg:review
```

Skip code-review-graph for documentation-only, instruction-only, or pure
formatting changes, and state that skip explicitly.

## Completion Checklist

Before reporting completion:

- Name the target app or authoring surface.
- State the Host/Soul App ownership decision.
- Address standalone and Host mounted implications.
- Confirm no Host-private or sibling app source imports were introduced.
- Confirm Host consumes only protocol-exposed app-owned surfaces.
- For official apps, confirm `apps/*` manifest and shared reference manifest
  stayed aligned when both are relevant.
- Record validation commands and results.
- Sync PMA docs/changelog when the change has project-level impact.
- Run code-review-graph for code changes or explicitly skip it for
  instruction-only, docs-only, or formatting-only work.
