# PLAN-356 Web profile approval and session parent navigation repair

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-18
- **approvedAt**: 2026-05-18
- **relatedTask**: BUG-135

## Current State

The HR Profile Patch Review model only reports recognized HR README section
changes. The approve button in the center review view additionally requires at
least one such section change. This blocks valid document-level README patches.

Real workspace validation also showed native HR `person-profile` artifacts can
be unfenced proposal artifacts. README promotion must stay product-owned: HR
Web should synthesize the canonical accepted README and submit that explicit
markdown to the promotion API instead of requiring native skills to emit a
README-specific fenced block.

The session route renders `WorkerSessionChat` as the main surface and
`SessionDetail` as the detail surface. It has refresh, settings and detail
drawer controls, but no direct parent navigation back to the workspace route.

## Proposal

1. Extend the profile revision review model with a document-level fallback
   change whenever the full promotable README differs but no known HR section
   changed.
2. Synthesize canonical accepted README markdown from unfenced HR
   `person-profile` artifacts inside the HR product review model.
3. Pass the reviewed/synthesized README to the profile promotion API as
   explicit `profileMarkdown`.
4. Add a session-header back control that navigates to the parent workspace
   route.
5. Update Worker Studio and HR model tests to cover document-level approval,
   unfenced artifact approval and session parent navigation.

## Risks

- The document-level fallback must not make blocked artifacts approvable.
- The synthesis path must sanitize proposal-state wording and still rely on the
  existing promotion validator before enabling approval.
- The session back control must be a route affordance only; it must not restore
  the old Host-level new-session/workspace navigation panels.

## Scope

- HR People Workbench revision-review model and patch review component.
- Worker session chat header and Worker Studio route wiring.
- Focused Web tests and PMA/changelog tracking.

## Verification

- [x] `bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts`
- [x] `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- [x] `bun run --filter '@zonease/aiworker-web' lint`
- [x] `bun run --filter '@zonease/aiworker-web' typecheck`
- [x] `bun run --filter '@zonease/aiworker-web' build`
- [x] Browser smoke for profile approve and session back navigation.
- [x] `bun run crg:update`
- [x] `bun run crg:review`
