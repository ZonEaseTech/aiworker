# PLAN-352 Host/Soul workbench contract cleanup

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-18
- **approvedAt**: 2026-05-18
- **completedAt**: 2026-05-18
- **relatedTask**: REFACTOR-081

## Current State

The V9 Host shell layout fixes the Host header as platform-owned chrome, but
the manifest contract still calls app-owned toolbar descriptors `ui.shell` and
models actions as header slots. That naming makes the boundary look like Soul
Apps can still customize Host header actions.

## Proposal

1. Replace `ui.shell` with `ui.workbench` for app-owned mounted workbench
   actions, search and app settings descriptors.
2. Replace action `slot` with `role`, using `panel-toggle` for app-owned
   panel intent rather than Host drawer placement.
3. Add `ui.workspaceContext.terminal` so a Soul App can declare how Host should
   locate a workspace terminal context without owning Host terminal chrome.
4. Update Host daemon API, Worker Web bridge, security review and official
   HR/QA manifests to consume the new contract.
5. Update current architecture and authoring docs to make the new constraint
   explicit.

## Scope

- Shared Soul App manifest and registry projection.
- Host daemon action/search resolution and security review descriptors.
- Worker Web app-owned workbench action/search bridge.
- Official HR and QA Soul App manifests and host-adapter tests.
- Current architecture, agent and Soul App developer docs.

## Non-Goals

- Implementing the web terminal UI or terminal process lifecycle.
- Removing Host/Soul protocol interaction capabilities.
- Changing domain behavior for HR/QA workbenches.
- Redesigning visuals beyond the already-approved V9 layout.

## Verification Plan

- Shared manifest and registry tests.
- Worker Web focused workbench tests.
- API local worker tests for generic action/search routes.
- Core broker/security review tests.
- Official HR/QA host-adapter tests.
- Typecheck/build for affected frontend package and CRG review before final.

## Verification

- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts src/soul-app/registry.test.ts`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-api' build`
- `bun run typecheck`
- `bun run lint`
