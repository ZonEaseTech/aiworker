# PLAN-161 Worker Admin Chat duplicate final reply and background polish

- **status**: completed
- **createdAt**: 2026-05-07 17:07
- **approvedAt**: 2026-05-07 17:07
- **completedAt**: 2026-05-07 17:10
- **relatedTask**: BUG-088

## Current State

Worker Admin Chat renders persisted conversation messages and the local
streaming preview through separate paths. When `orchestrator.finished` arrives,
the preview remains in local state while the messages query is invalidated. If
the refreshed message list contains the final assistant reply, the same content
can be visible twice.

The Chat panel's message field is also a large near-black surface. That was
useful for an agent-console mockup, but in the current admin UI it makes empty
conversation space dominate the screen.

## Proposal

1. Keep streaming preview visible while a reply is still live or while the
   persisted transcript has not yet caught up.
2. Hide the preview after the refreshed transcript contains an assistant message
   created after the current send started whose content matches the streamed
   final text.
3. Add a focused Worker Web regression covering the duplicate-render case.
4. Switch the Chat message field to a soft-stone bordered canvas while keeping
   assistant bubbles deep green and user bubbles white.

## Scope

- `apps/web/src/worker/features/chat/chat-panel.tsx`
- `apps/web/src/worker/features/chat/chat-panel.test.tsx`
- `docs/task/BUG-088.md`
- `docs/task/index.md`
- `docs/plan/PLAN-161.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Verification

- PASS: `bun run --filter '@zonease/aiworker-web' test -- src/worker/features/chat/chat-panel.test.tsx`
- PASS: `bun run --filter '@zonease/aiworker-web' typecheck`
- PASS: `bun run --filter '@zonease/aiworker-web' lint`
- PASS: `bun run --filter '@zonease/aiworker-web' build` (existing Vite chunk
  size warning remains non-blocking)
- PASS: `git diff --check`

## Progress

- 2026-05-07 17:07: User approved implementation; plan created and implementation started.
- 2026-05-07 17:10: Implementation completed. The focused chat regression,
  typecheck, lint, build, and diff check passed.
