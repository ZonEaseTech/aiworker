# PLAN-379 Session composer and timeline review gaps

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **completedAt**: 2026-05-19
- **relatedTask**: BUG-140

## Current State

The `FEAT-103` implementation moved Codex CLI tool calls into parser-led
activity rows, but the real session view still exposed non-tool engine signals
too literally:

- lifecycle statuses rendered as individual pills such as `status running`,
  `initializing`, and `running`;
- usage rendered as a timeline event even though it belongs to the composer
  affordance area;
- the visible session follow-up composer did not include the default attachment
  input, so the shared file/image capability was only visible on new-session and
  HR profile composer surfaces.

## Proposal

1. Add a shared timeline `signal` event kind for status/output signals and
   collapse consecutive status/artifact/review/lesson events into compact rows.
2. Keep `usage` in the normalized event stream for state derivation, but filter
   it out of timeline rendering and expose it as composer usage state.
3. Extend `SessionComposer` with a non-command usage slot in its action bar.
4. Introduce a Worker Web `SessionTurnComposer` wrapper that consumes the shared
   composer, manages local file/image attachment state, and emits materials with
   the follow-up turn.
5. Persist follow-up materials through the existing workspace file path and add
   attached material descriptors to turn metadata.
6. Update focused tests, catalog, PMA docs and changelog.

## Component Library Preflight

Checked shared components:

- `SessionComposer`, `SessionComposerActionBar`, `SessionAttachmentList`
- `SessionTimeline`
- `MarkdownPreview`
- `MessageFlow`, `MessageRow`, `ToolResultCard`
- primitive `IconButton`, `Textarea`, `Select`

Reusable gaps closed:

- composer usage status slot;
- timeline signal event rendering for collapsed engine status/output events.

Local UI exceptions:

- `SessionTurnComposer` stays in Worker Web because it owns workspace material
  persistence and turn prompt/metadata assembly, while still rendering through
  the shared `SessionComposer`.

## Scope

- `packages/component/src/patterns/session-composer.tsx`
- `packages/component/src/patterns/session-timeline.tsx`
- `packages/component/src/patterns/session-view-model.ts`
- `packages/component/src/patterns/index.ts`
- `packages/component/src/styles/patterns.css`
- `packages/component/src/catalog.ts`
- `packages/component/src/patterns/patterns.test.tsx`
- `apps/web/src/worker/session-turn-composer.tsx`
- `apps/web/src/worker/session-chat.tsx`
- `apps/web/src/worker/session-detail.tsx`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- PMA task/plan/changelog files

## Non-Goals

- No new engine parser beyond Codex CLI.
- No Host/Soul protocol, API or storage schema change.
- No settings/model/MCP/skill/slash controls in the default composer.

## Verification

- `bun run --filter '@zonease/aiworker-component' test src/patterns/patterns.test.tsx`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run ui:check`
- browser smoke on an HR session route
- `bun run crg:update`
- `bun run crg:review`
