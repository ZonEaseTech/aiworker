# PLAN-388 micro-app Host/Soul mounted UI runtime

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-20
- **approvedAt**: 2026-05-20
- **relatedTask**: FEAT-106

## Current State

The shadcn-first migration removed Host-owned HR renderer code, but the active
mounted UI contract still used `sandboxed-frame` and `/frames/*` terminology in
schema, official app manifests, Web tests, scaffold code and smoke helpers.
That kept the product direction ambiguous and made it too easy for Host Web to
recover Soul App UI locally.

## Proposal

Make `@micro-zoe/micro-app` the standard Host-mounted app-owned UI runtime.
Host resolves manifest-declared `micro-app` surfaces into mount payloads, Worker
Web renders one generic `<micro-app>` container, and Soul Apps serve their own
HTML from `/micro-app/*` mounted routes. Domain state, permissions, broker
access, actions, search, reviews and profiles stay in protocol/broker code.

## Scope

- Shared manifest and registry projection.
- Local daemon mounted surface resolver.
- Worker Web mounted route rendering.
- HR and QA manifests plus mounted services.
- CLI app scaffold and mounted-surface smoke helper.
- Active architecture docs, agent skills, task/plan indexes and changelog.

## Non-Goals

- No qiankun integration.
- No app-domain renderer code inside Host Web.
- No replacement of protocol/broker permissions with micro-app data.
- No claim that micro-app is a third-party security sandbox.
- No full shadcn migration completion claim.

## Verification Plan

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run docs:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- `bun scripts/check-web-ui-components.ts --all --audit`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Completion Notes

The migration is implemented as a single Host/Soul mounted UI contract:
manifest-declared `micro-app` surfaces resolve to mount payloads, Worker Web
mounts a generic `<micro-app>` element, and app-owned HTML lives in HR/QA
mounted services. The implementation also handles upgrade recovery for stale
official app rows whose stored manifests still contain legacy frame renderers.
