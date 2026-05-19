# PLAN-382 Session composer busy state, attachment clearing and usage meter

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **completedAt**: 2026-05-19
- **relatedTask**: BUG-143

## Current State

The shared composer had an integrated field shell, but session lifecycle state
was still only partially reflected in the composer:

- `SessionTurnComposer` received `submitting` from the request state, while a
  running turn could outlive that request state;
- attachments cleared only after `await onSubmit(...)`, so streaming turn
  lifecycles could keep submitted files visible during execution;
- usage rendered as `input / output`, which looked like an inverted progress
  fraction and sat in the middle action area instead of next to send.

## Proposal

1. Derive composer busy state from `turnSubmitting || any running turn` in both
   session chat and full session detail.
2. Render the submit button with a shared spinner and `aria-busy` while busy.
3. Clear follow-up attachments immediately after material reads succeed and
   before awaiting the streaming submit lifecycle.
4. Move usage into the action-right cluster directly before send.
5. Format usage as `in/out` token text with a circular meter and full token
   counts in the accessible label/title.

## Component Library Preflight

Checked shared components:

- `SessionComposer`
- `SessionComposerActionBar`
- `SessionTurnComposer` wrapper consumers

Reusable gaps closed:

- shared submit loading visual;
- compact usage meter slot beside send.

Local UI exceptions:

- The running-turn derivation stays in Worker Web containers because they own
  local session/turn state. The shared component only receives the resulting
  `submitting` and `usage` props.

## Scope

- `packages/component/src/patterns/session-composer.tsx`
- `packages/component/src/styles/patterns.css`
- `packages/component/src/patterns/patterns.test.tsx`
- `apps/web/src/worker/session-turn-composer.tsx`
- `apps/web/src/worker/session-chat.tsx`
- `apps/web/src/worker/session-detail.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA task/plan/changelog files

## Non-Goals

- No token budget enforcement or hard usage limit behavior.
- No changes to engine parsers or session event contracts.
- No new composer controls beyond the usage meter and submit busy state.

## Verification

- `bun run --filter '@zonease/aiworker-component' test src/patterns/patterns.test.tsx`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run ui:check`
- `git diff --check`
- browser smoke on an HR session route
- `bun run crg:update`
- `bun run crg:review`
