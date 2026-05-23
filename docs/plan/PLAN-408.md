# PLAN-408 Universal workbench explicit session template selection

- **status**: completed
- **createdAt**: 2026-05-23
- **approvedAt**: 2026-05-23
- **completedAt**: 2026-05-23
- **relatedTask**: FEAT-108

## Context

Investigation found the new-session path split across two layers:

- `UniversalWorkbenchApp` already maps `ManagedSessionComposerDraft` into a
  workbench draft and preserves `selectedTemplateId`.
- `client-entry.tsx` loaded templates from the mounted API, but it did not
  pass them into `UniversalWorkbenchApp`.
- `client-entry.tsx` then used `templates.find(...) ?? templates[0]` when
  creating a session, which hid template choice from the user.

The fix belongs inside the Soul-owned mounted workbench client and shared
composer primitive. Host stays a generic mounted API bridge.

## Proposal

1. Add focused tests first:
   - the universal workbench composer renders the capability/template selector;
   - create-session payload construction requires an explicit selected
     template id and preserves that id as `capabilityTemplateId`.
2. Pass mounted templates from `client-entry.tsx` into
   `UniversalWorkbenchApp`.
3. Reuse `ManagedSessionComposer` template select props instead of adding a
   custom selector.
4. Allow the shared composer template select to render with no selected value
   so the universal workbench can require an explicit choice.
5. Replace the hidden `templates[0]` fallback with a payload helper that
   returns `null` when the selection is missing or invalid.

## Component Library Preflight

Existing primitives covered the needed UI:

- `ManagedSessionComposer`
- `SessionComposerActionBar`
- shadcn `Select` inside `packages/ui`

No new primitive, local focus management, icon set or custom style token was
introduced.

## Scope

- `packages/soul-app-workbench`
- `packages/ui`
- `docs/task/FEAT-108.md`
- `docs/plan/PLAN-408.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Risks

- Shared composer behavior changed to show the template selector even before a
  value is selected. Focused UI tests cover existing selected-template flows.
- Static server rendering cannot inspect Radix portal menu items, so focused
  workbench coverage asserts the selector surface and payload semantics rather
  than dropdown portal contents.

## Verification

- `bun test packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck`
- `bun run --filter '@zonease/aiworker-ui' test -- src/components/session-composer.test.tsx`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
