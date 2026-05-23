# FEAT-108 Universal workbench explicit session template selection

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-23
- **claimedAt**: 2026-05-23
- **completedAt**: 2026-05-23
- **plan**: PLAN-408
- **relatesTo**: MOUNT-001, PROTO-001, UI-001, BUG-150

## Background

The mounted universal workbench new-session composer was only partially wired
to session capability templates. `UniversalWorkbenchApp` forwarded
`selectedTemplateId` from the shared composer draft, but the mounted browser
client did not expose any capability/template selector and silently fell back
to the first template when the draft had no explicit selection.

That made the user's session capability ambiguous and hid Soul App capability
choice inside the mounted API call.

## Acceptance Criteria

1. The new-session composer exposes a capability/template selector using the
   existing shared session composer UI.
2. The composer does not allow session creation until a template has been
   selected.
3. The mounted create-session payload uses the selected template id from the
   draft and never falls back to `templates[0]`.
4. The chosen template id is sent as `capabilityTemplateId` to the mounted
   session API.
5. Host/Soul boundaries remain unchanged: Host continues to provide only the
   mounted API bridge and does not interpret app capability semantics.
6. Focused workbench tests cover the selector and payload behavior.

## Scope

- `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
- `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`
- `packages/ui/src/components/session-composer.tsx`
- focused package tests and UI composer regression tests

## Non-Goals

- Do not add Host-owned universal workbench rendering.
- Do not add Host-level capability configuration.
- Do not redesign the session composer.

## Resolution

The universal workbench now receives mounted capability templates, renders the
shared composer template selector with the `Capability/template` label and
keeps Start disabled until a selection exists.

The mounted client builds create-session requests through an explicit payload
helper. It returns no payload when `selectedTemplateId` is missing or unknown,
so session creation cannot silently use the first template.

## Verification

- `bun test packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck`
- `bun run --filter '@zonease/aiworker-ui' test -- src/components/session-composer.test.tsx`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
