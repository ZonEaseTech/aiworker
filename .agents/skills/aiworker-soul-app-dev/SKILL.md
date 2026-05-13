---
name: aiworker-soul-app-dev
description: "Use when creating, modifying, or reviewing AIWorker Soul Apps under apps/aiworker-* or related authoring, validation, scaffold, manifest, SDK, standalone, Host mounted, artifact, review, or capability surfaces."
argument-hint: "[app-path]"
arguments: [app_path]
---

# AIWorker Soul App Developer

Use this skill before creating, modifying, or reviewing a Soul App. It covers
production apps under `apps/aiworker-*`, app manifests, standalone surfaces,
Host mounted surfaces, capability prompts, artifact schemas, review rubrics,
Soul packs, authoring docs, validation harnesses, and scaffold behavior.

## Read First

Load the minimum context for the current change:

1. `GOALS.md`
2. `docs/architecture.md`
3. `docs/soul-app-developer.md`
4. The target app's `soul-app.manifest.json`
5. The target app's `README.md`
6. The target app files touched by the request, such as `capabilities/`,
   `schemas/`, `review/`, `packs/`, `src/standalone.ts`,
   `src/host-mounted.ts`, or `src/protocol/`

If `$app_path` is provided, start there. If no app path is supplied, infer the
target from changed files or the user request. Ask only when the target cannot
be inferred safely.

## Product Language

Use the same product vocabulary everywhere:

- `Host`
- `Soul App`
- `Soul worker`
- `workspace`
- `session`
- `artifact`
- `review`
- `lesson`
- `standalone`
- `Host mounted`
- `manifest`
- `SDK`
- `broker`

Keep the default product path intact:

```text
local daemon -> Soul worker -> workspace -> session -> artifact -> review -> lesson
```

Developer Soul is a supporting role for code review, release evidence, repo
report, handoff, and risk audit. Do not make repo, PMA, coding loop, admin
dashboard, governance kernel, or generic agent runtime the default product
center.

## Boundary Rules

Soul Apps own vertical product logic:

- domain UI/API
- manifest
- workspace types
- capability prompts
- artifact schemas
- review rubrics
- Soul packs
- app-scoped storage declarations
- standalone shell
- Host mounted service entrypoints

Host owns shared runtime concerns:

- local daemon and session runtime
- engine handoff
- connector credentials
- Host metadata storage
- artifact indexing
- review and lesson services
- permission and storage brokers
- mounted service launch/connect
- audit

Do not bypass those boundaries:

- Do not import `@zonease/aiworker-core`, `@zonease/aiworker-api`,
  `@zonease/aiworker-storage-sqlite`, or `@zonease/aiworker-web` from Soul App
  source.
- Do not import another Soul App's `src` from app code.
- Do not let Soul App code directly schedule engines, read/write Host DB
  handles, access connector credentials, or mutate global memory.
- Do not put secrets in manifests, generated app config, workspace metadata, DB
  metadata, logs, prompts, review rubrics, or skill files.
- Host mounted access to shared resources must go through scoped broker
  surfaces.

## Workflow

1. Identify whether the request changes a Soul App, authoring docs, validation
   harness, scaffold behavior, or Host/Soul App protocol-facing surface.
2. Read the required context above.
3. Confirm the change belongs in the Soul App boundary. If it needs Host-owned
   resources, design a protocol, SDK, or broker interaction instead of direct
   imports.
4. Keep standalone and Host mounted modes aligned. They should share the same
   manifest, domain definitions, artifact schemas, review rubrics, and handler
   semantics.
5. Keep user-facing text and prompts understandable to the vertical user. HR,
   QA, finance, legal, ops, DevOps, and PM users should see business objects,
   not Host internals.
6. For non-trivial repository work, follow PMA: investigate, proposal, then
   implementation after approval. Keep `docs/task/`, `docs/plan/`, and
   `docs/changelog.md` synced when the change has project-level impact.

## Validation

For each changed production Soul App, run:

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

For root-level authoring, scaffold, or validation changes, run the focused
package gates that own those files. Run root gates only when the change touches
shared contracts, CLI behavior, Host runtime, or cross-package configuration.

When code files changed, run code-review-graph before the final response:

```bash
bun run crg:update
bun run crg:review
```

Skip code-review-graph for documentation-only, instruction-only, or pure
formatting changes, and state that skip explicitly.

## Completion Checklist

Before reporting completion:

- the target app or authoring surface is named;
- Host / Soul App ownership stayed explicit;
- standalone and Host mounted implications are addressed;
- no Host-private or sibling app source imports were introduced;
- product language matches `GOALS.md`, `docs/architecture.md`, and
  `docs/soul-app-developer.md`;
- validation commands and results are recorded;
- PMA docs and changelog are synced when applicable;
- code-review-graph ran for code changes or was explicitly skipped for
  docs/instruction-only work.
