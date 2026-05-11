# PLAN-247 Mobile session route layout repair

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 11:41
- **relatedTask**: BUG-091

## Current State

The previous shared layout validation over-indexed on bounding boxes and missed
poor mobile composition. On a 390px viewport, the session route showed the full
workspace navigation, chat surface, and artifact rail in one cramped vertical
stack.

## Proposal

1. Add mobile-specific session route rules that collapse the sidebar to only
   route-critical context and return actions.
2. Let chat header controls wrap vertically on narrow screens.
3. Give the mobile artifact rail a fixed bottom-preview height.
4. Rebuild Worker Web static assets before validating port 9217 because the
   local server serves built files.

## Scope

In scope:

- Worker Web CSS for mobile session layout.
- Session chat accessibility label for the mobile icon-only back action.
- PMA docs and changelog.

Out of scope:

- Reworking desktop session layout.
- Replacing the session detail drawer model.

## Verification

- Passed `bun run --filter '@zonease/aiworker-web' typecheck`.
- Passed `bun run --filter '@zonease/aiworker-web' lint`.
- Passed `bun run --filter '@zonease/aiworker-web' test`.
- Passed `bun run --filter '@zonease/aiworker-web' build`.
- Passed `git diff --check`.
- Playwright MCP 390px session route visual inspection on port 9217.
- Passed `bun run crg:update`.
- Passed `bun run crg:review`.
