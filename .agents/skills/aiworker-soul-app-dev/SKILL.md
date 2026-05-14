---
name: aiworker-soul-app-dev
description: "Use when creating, modifying, or reviewing AIWorker Soul Apps under apps/aiworker-* or public Soul App authoring, manifest, SDK, standalone, Host mounted, broker, artifact, review, profile, capability, scaffold, validate, or smoke surfaces."
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
  services, protocol handlers, app-owned UI/API, and app-owned broker use.
- Public authoring surfaces: `packages/soul-app-sdk`,
  `packages/soul-app-runtime`, shared manifest/protocol types, app scaffold,
  `aiworker app validate`, `aiworker app smoke`, and
  `docs/soul-app-developer.md`.

Do not use this as a general validation-campaign router for old fleet/gateway,
published CLI governance harnesses, Coder workspaces, or release-debug runs.
Those are historical or task-specific flows; do not resurrect
`aiworker-validate`.

## Product Contract

Keep this product path intact:

```text
Host -> install/enable Soul App -> Soul worker -> workspace -> session
  -> Soul App exposed views/actions -> business artifact/profile/review/lesson
```

Use this vocabulary consistently: `Host`, `Soul App`, `Soul worker`,
`workspace`, `session`, `artifact`, `profile`, `review`, `lesson`,
`standalone`, `Host mounted`, `manifest`, `SDK`, `broker`, `protocol`.

Developer Soul is a supporting role for code review, release evidence, repo
report, handoff and risk audit. Do not make repo/PMA/coding loop, admin
dashboard, governance kernel or generic agent runtime the product center.

## Boundary Rules

Soul Apps own domain meaning:

- domain UI/API and standalone shell;
- manifest, workspace types, packs, capability prompts and protocol handlers;
- artifact schemas/content/lifecycle;
- profile composition;
- review rubrics and verdict meaning;
- lesson/memory promotion semantics;
- app-scoped storage content and search descriptor publication;
- Host mounted service entrypoints.

Host owns platform capability and positioning:

- local daemon, install/enable/disable state and mounted service launch;
- Host auth, security review, grants and session security;
- global settings for appearance, language, default engine, MCP and connectors;
- permission, storage, connector, secret-ref, log, search and audit brokers;
- worker/workspace/session locator;
- Host shell and optional header contract;
- protocol discovery and descriptor cache.

Soul App is the source of truth for domain state and domain meaning.
Host is the source of truth for platform capabilities, grants, protocol
discovery and shell context. Host may consume only protocol-exposed
views/actions/search/settings descriptors, and must not infer Soul App domain
meaning.

Do not bypass those boundaries:

- Do not import `@zonease/aiworker-core`, `@zonease/aiworker-api`,
  `@zonease/aiworker-storage-sqlite`, or `@zonease/aiworker-web` from Soul App
  source.
- Do not import another Soul App's `src` from app code.
- Do not let Soul App code directly schedule engines, read/write Host DB
  handles, access connector credentials, or mutate global memory.
- Do not let Host infer app-owned profile, review, artifact, search or memory
  meaning from filenames, DB rows, prompts, protocol names or UI labels.
- Declare `requiredPermissions` on shell, search and mounted surfaces whenever
  the action depends on Host broker capabilities; Host enforces them before it
  contacts the mounted Soul App service.
- Do not put secrets in manifests, generated app config, workspace metadata, DB
  metadata, logs, prompts, review rubrics, or skill files.
- Host mounted access to shared resources must go through scoped broker
  surfaces.

## Read Set

Load only what the task needs:

1. Always read `docs/architecture.md`.
2. Read `docs/soul-app-developer.md` for authoring, scaffold, validate, smoke,
   standalone or mounted runtime changes.
3. For a target app, read its `soul-app.manifest.json` and touched files:
   `capabilities/`, `schemas/`, `review/`, `packs/`, `src/standalone.ts`,
   `src/host-mounted.ts`, `src/protocol/`, or app tests.
4. For official HR/QA app manifest or shell changes, also read
   `packages/shared/src/soul-app/fixtures.ts` and shared manifest tests; Host
   bootstraps from these reference manifests, not only from `apps/*` files.
5. For SDK/runtime/protocol changes, read the owning package tests before
   editing.

If `$app_path` is provided, start there. If it is missing, infer the target from
the user request or changed files. Ask only when the target cannot be inferred
safely.

## Workflow

1. Classify the surface: app domain, public authoring contract, Host broker,
   Host shell protocol, validation/smoke, or docs.
2. Confirm the change belongs at that boundary. If a Soul App needs Host-owned
   resources, use protocol, SDK or broker interaction instead of Host-private
   imports.
3. Keep standalone and Host mounted modes aligned. They share one manifest,
   domain definitions, schemas, review rubrics, prompts and core handler
   semantics.
4. Keep vertical-user language visible. HR, QA, finance, legal, ops, DevOps and
   PM users should see business objects, not Host internals.
5. If Host needs app-owned state, expose a view, action, search result, status
   or descriptor through protocol. If the app does not expose it, Host does not
   fetch, infer or synthesize it.
6. For non-trivial code/product changes, follow PMA and keep `docs/task/`,
   `docs/plan/` and `docs/changelog.md` synced when the change has
   project-level impact.

## Validation

Pick the smallest command set that proves the touched surface:

| Change | Verification |
| --- | --- |
| Production Soul App | `aiworker app validate <app-path>` and `aiworker app smoke <app-path>` |
| App package code | app package `typecheck` and `test` |
| Official app manifest/catalog | app validate/smoke, shared tests, and affected API/core tests |
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
