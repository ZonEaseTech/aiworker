---
name: aiworker-soul-app-dev
description: "Use when creating, modifying, or reviewing AIWorker Soul Apps under apps/aiworker-* or public Soul App authoring, manifest, SDK, standalone, Host mounted, app-owned artifact, review, profile, capability, scaffold, validate, or smoke surfaces."
argument-hint: "[app-path]"
arguments: [app_path]
---

# AIWorker Soul App Developer

This skill is a route helper, not a parallel architecture contract.

Use it before touching Soul App packages or public authoring surfaces. Always
start from `docs/architecture.md#constraint-registry`. Read `docs/soul-app-developer.md` only as a frozen quickstart for commands and package shape.

## Fit Check

Use this skill for:

- `apps/aiworker-*` production Soul App changes.
- `soul-app.manifest.json`, app-owned UI/API, standalone surfaces, Host mounted
  handlers, artifact/profile/review/capability files and app-owned engine
  assets.
- Public authoring surfaces: `packages/soul-app-sdk`,
  `packages/soul-app-runtime`, shared manifest/schema changes, app scaffold,
  `aiworker app validate` and `aiworker app smoke`.

Use `aiworker-host-dev` when the change belongs to Host platform behavior.
This includes local daemon API, CLI lifecycle, Worker Web Shell rendering,
storage metadata, Host runtime, app registry or Host/Soul protocol
implementation.

Do not use this as a validation-campaign route for published CLI harnesses,
Coder workspaces or release-debug runs.

## Required Registry Reads

Read these registry IDs in `docs/architecture.md` before Soul App changes:

- `ARCH-001`
- `SOUL-001`
- `CONFIG-001`
- `PROTO-001`
- `IMPORT-001`
- `MOUNT-001`
- `DATA-001`
- `ENGINE-001`
- `DOC-001`

Do not restate or reinterpret those rules in this skill. If a boundary question
requires new wording, update `docs/architecture.md#constraint-registry` first.

## Read Set

Load only what the task needs:

1. `docs/architecture.md`.
2. `docs/soul-app-developer.md` for the frozen command and package-shape
   quickstart.
3. The target app manifest and touched files:
   `soul-app.manifest.json`, `engine-assets/`, `product/`, `host-adapter/` or
   app tests.
4. For official HR/QA manifest or shell changes, also read
   `packages/shared/src/soul-app/fixtures.ts` and shared manifest tests.
5. For SDK/runtime/protocol/schema changes, read the owning package tests before
   editing.

If `$app_path` is provided, start there. If it is missing, infer the target from
the user request or changed files. Ask only when ownership cannot be determined
safely from the architecture contract.

## Workflow

1. Classify the change as app-owned domain work, public authoring contract,
   shared schema/protocol, validation/smoke behavior or docs.
2. Confirm the change belongs to Soul App ownership using the registry IDs
   above.
3. If the requested change modifies Host-owned behavior, switch to
   `aiworker-host-dev`.
4. Keep standalone and Host mounted modes aligned through the app manifest,
   app-owned files and public SDK/runtime surfaces.
5. Keep vertical-user wording visible in app UI and product docs.
6. Keep edits minimal and aligned with existing package boundaries.

## Validation

Pick the smallest command set that proves the touched surface:

| Change | Verification |
| --- | --- |
| Production Soul App | `aiworker app validate <app-path>` and `aiworker app smoke <app-path>` |
| App package code | app package `typecheck` and `test` |
| App-owned web UI | app package `typecheck` and `test`; run `bun run ui:check` for official app web changes |
| Official app manifest/catalog | app validate/smoke, shared tests and affected API/core tests |
| SDK/runtime/protocol/shared schema | focused package tests and typecheck |
| CLI validate/smoke behavior | focused CLI tests and matching docs |
| Instruction-only docs or skill changes | `bun run docs:check`, reference search and `git diff --check` |

When code files changed, run:

```bash
bun run crg:update
bun run crg:review
```

Skip code-review-graph only for documentation-only, instruction-only or pure
formatting changes, and state the skip explicitly.

## Completion Checklist

- Name the target app or authoring surface.
- State the Host/Soul App ownership decision.
- Confirm the active boundary source was `docs/architecture.md#constraint-registry`.
- Confirm no Host-private or sibling app source imports were introduced.
- Record validation commands and results.
- Run code-review-graph for code changes or explicitly skip it for docs-only,
  instruction-only or formatting-only work.
