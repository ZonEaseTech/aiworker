# FEAT-084 Soul App Web Storage discipline

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 17:32
- **plan**: PLAN-321
- **relatesTo**: packages/soul-app-sdk, apps/cli, scripts/check-soul-app-boundaries.ts, docs/architecture.md, docs/soul-app-developer.md

## Context

AIWorker currently accepts first-party official Soul Apps rather than arbitrary
third-party Soul Apps. Same-realm Host Web loading is therefore a trusted-code
discipline, not a browser security sandbox.

Host broker storage already enforces app-scoped durable storage. Browser
`localStorage` and `sessionStorage` still need a lightweight discipline so
official Soul Apps do not accidentally overwrite Host preferences, auth-related
session state or each other's keys.

The approved design is recorded in
`docs/superpowers/specs/2026-05-14-soul-app-web-storage-discipline-design.md`.

## Goals

- Add a scoped Soul App Web Storage helper to the public SDK.
- Fail Soul App validation when production app source uses raw browser Web
  Storage APIs.
- Extend root Soul App boundary self-checks so official apps cannot regress.
- Document that same-realm Soul Apps are trusted first-party code, not
  third-party sandboxed plugins.
- Keep Host broker storage as the durable app-scoped domain storage path.

## Non-Goals

- No third-party Soul App sandbox.
- No iframe/CSP/origin isolation implementation.
- No Host broker storage schema change.
- No secret storage in browser storage.
- No marketplace or signed module loader.

## Acceptance Criteria

- SDK tests cover scoped key generation, app/workspace/session separation,
  `clearScope()` behavior and unavailable/invalid storage failures.
- `aiworker app validate` fails on raw `localStorage` / `sessionStorage`
  production source usage.
- Root lint self-check fails on raw Web Storage usage in official Soul App
  source.
- Architecture and authoring docs describe trusted first-party discipline and
  the future third-party isolation gate.
- Focused gates, root check, diff check and code-review-graph pass.

## Verification

- `bun run --filter '@zonease/aiworker-soul-app-sdk' test src/index.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun scripts/check-soul-app-boundaries.ts`
- `bun run docs:check`
- `bun run check`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Completed on 2026-05-14.

- Added `createSoulAppWebStorage(...)` to the Soul App SDK for scoped
  first-party browser UI state.
- Added SDK coverage for app/worker/workspace/session key scoping,
  `clearScope()`, invalid keys, unavailable storage and invalid JSON values.
- Added `webStorageIssues` to `aiworker app validate` so production Soul App
  source fails when it uses raw `localStorage` or `sessionStorage`.
- Extended the root Soul App boundary self-check used by `bun run lint`.
- Documented that current same-realm Soul Apps are trusted first-party code,
  not third-party sandboxed plugins.
