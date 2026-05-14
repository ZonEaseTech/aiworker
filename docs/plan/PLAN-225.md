# PLAN-225 Worker Web session-first interaction model

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 19:59
- **relatedTask**: REFACTOR-052

## Diagnosis

The current Worker Web is connected technically but still wrong
interaction-wise.

1. **Session is not the main product surface**
   - AIWorker shows selected session details as a side panel.
   - Open Design treats project work as a conversation/message/run surface.
   - For AIWorker, a workspace should open into sessions, and a session should
     be the center of the screen.

2. **Engine process is not observable**
   - Open Design streams run events into assistant messages and can reattach to
     active runs.
   - AIWorker currently blocks inside `LocalExecutor.invoke(...)`, then stores a
     final artifact and a few coarse events.
   - This loses the engine handoff experience: thinking, text deltas, tools,
     command/log events, produced files, and partial progress.

3. **Route hierarchy is too flat**
   - Open Design separates `/` and `/projects/:id[/files/:file]`.
   - AIWorker currently puts catalog, workspace list, creation, session,
     artifact, review, memory, and settings entry points on `/`.
   - The correct AIWorker shape should be:
     - `/` — Soul catalog and workspace launcher
     - `/workers/:workerId` or `/souls/:soulId` — Soul workspace list
     - `/workspaces/:workspaceId` — workspace overview and sessions
     - `/workspaces/:workspaceId/sessions/:sessionId` — session timeline
     - optional query/tab state for artifact/review/memory side surfaces

4. **Scroll behavior is unproven**
   - The current layout can still fail with long artifacts, many turns, many
     workspaces, short viewports, and ultra-wide widths.
   - Scroll must be designed as bounded regions, then proven with browser
     assertions, not eyeballed from one desktop screenshot.

5. **Feature density is too high**
   - Artifact, review, memory, and events are all visible as peer panels.
   - They should be contextual surfaces: artifact pane, review drawer, memory
     drawer, event inspector, with the session timeline retaining priority.

## Proposal

Implement in three PMA slices, not as another one-shot UI pile. The guiding
rule is: **port Open Design's mature session primitives first; adapt only the
product nouns and API boundary.** Do not invent a separate AIWorker chat,
stream, message block, tool-card, composer, or scroll system unless an OD
primitive cannot fit the AIWorker architecture.

OD code is Apache-2.0. Direct code porting is acceptable with normal license
hygiene and without copying OD product copy, import flows, design-generation
language, pets, or unrelated desktop chrome.

### Slice A — Route and Shell IA

- Add a small Worker Web router modeled on OD's minimal route approach.
- Port the OD route idea rather than introducing a new routing framework:
  `router.ts`-style parse/build/navigate/useRoute helpers are sufficient.
- Split screens:
  - home/catalog launcher
  - workspace overview
  - session detail
- Keep Settings explicit and global.
- Make URL state reflect the selected workspace/session so refresh/deep-linking
  works.
- Remove the always-on right stack from the home route.

### Slice B — Engine Event Timeline

- Refactor the local executor contract from blocking-only result to streamed
  turn events plus final result.
- Reuse the existing `AgentEvent` schema as the normalized engine event layer.
- Persist event details into `session_events.payloadJson`:
  - assistant message delta
  - thinking delta
  - tool use
  - tool result
  - permission request
  - token usage
  - engine binding
  - finish/error
- Add API routes to fetch session events by session/turn and support
  incremental polling or SSE replay.
- Port/adapt OD session primitives:
  - `ChatPane.tsx` for bounded message list + composer layout
  - `ChatComposer.tsx` for input ergonomics and sticky composer behavior
  - `AssistantMessage.tsx` for message block rendering
  - `ToolCard.tsx` and `runtime/tool-renderers.ts` for tool-use/result cards
  - `runtime/markdown.tsx` for markdown rendering
  - `runtime/todos.ts` if task/todo events are surfaced by engines
  - `providers/daemon.ts` streaming/reattach patterns, adapted to
    `/api/local/sessions/:sessionId/turns`
- Render a session timeline with the OD message model, translated into
  AIWorker language:
  - user turn
  - assistant stream
  - status/thinking/log blocks
  - tool cards
  - produced artifact chips
  - review/memory chips
  - completion footer

### Slice C — Focused Secondary Surfaces and Scroll QA

- Move artifact/review/memory/event details into tabs, drawers, or a secondary
  pane attached to the session route.
- Default view shows conversation and the next input action.
- Reuse OD's bounded scroll patterns for:
  - Soul/workspace list
  - session timeline
  - composer area
  - artifact body
  - event/tool inspector
  - settings dialog
- Add tests/Playwright coverage for:
  - 1366×900 desktop
  - 760×900 narrow
  - 1366×520 short-height
  - 2200×1200 ultra-wide
  - long artifact body
  - many workspace rows
  - many turns/events
  - scroll-to-latest and manually scrolled history

## Scope

In scope:

- `apps/web/src/worker/**`
- `apps/api/src/modes/worker.ts`
- `packages/core/src/worker/**`
- `packages/shared/src/local-workspace.ts`
- focused storage changes only if event payload shape needs indexing
- PMA docs and tests

Out of scope:

- Rebuilding Fleet/admin UI.
- Reintroducing Open Design visual copy, import entrypoints, or design-domain
  terminology.
- Adding a generic executor platform. Engine streaming remains an adapter
  observation layer for existing external engines.

## Risks

- True streaming depends on the selected engine. Codex CLI can expose richer
  output when invoked in a machine-readable/streaming mode, while BYOK can use
  streaming chat completions. Engines that cannot stream should still produce
  status/log/final events honestly.
- OD message primitives assume `kind`-based frontend `AgentEvent` objects,
  while AIWorker shared provider events currently use `type`. The adapter
  should normalize at the Web/API boundary rather than forking the rendering
  model.
- OD stream helpers were built around `/api/runs/:id/events` and project
  conversations. AIWorker should preserve the implementation shape but map it
  onto workspace/session/turn APIs.
- This touches core/API/Web. It needs focused tests and root gates.
- Route introduction must stay minimal; adding a heavy router would be larger
  than the current app needs.

## Verification Plan

- Focused:
  - `bun run --filter '@zonease/aiworker-core' typecheck`
  - `bun run --filter '@zonease/aiworker-core' test`
  - `bun run --filter '@zonease/aiworker-api' typecheck`
  - `bun run --filter '@zonease/aiworker-api' test`
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
- Browser:
  - local daemon at `http://127.0.0.1:9217/`
  - route navigation home → workspace → session
  - real session continuation
  - engine event timeline visible during and after a turn
  - artifact/review/memory surfaces reachable without crowding the timeline
  - scroll assertions and screenshots at desktop, narrow, short-height, and
    ultra-wide viewports
- Root as feasible:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test`
  - `bun run build`
  - `git diff --check`
- code-review-graph:
  - `bun run crg:status`
  - `bun run crg:update`
  - `bun run crg:review`
  - MCP `detect_changes`, `get_review_context`, and impact/flow tools if
    prompted by risk.

## Approval Gate

Approved by operator with `proceed` on 2026-05-10.

## Completion Notes

- Implemented the minimal Worker Web router and deep links for session routes.
- Reworked the home route into a focused Soul catalog and workspace launcher.
- Added a session chat route where the selected workspace/session is the
  primary surface and artifacts/reviews/memory/events are secondary context.
- Extended core executor invocation with streamed local executor events and
  persisted those as session events.
- Added `POST /api/local/sessions/:sessionId/turns/stream` for Web SSE session
  continuation, including heartbeat frames for long engine turns.
- Adapted the UI to render engine status, logs, tool use/results, final text,
  artifacts, reviews, and completion state inside the assistant flow.
- Fixed static asset base and session-route SPA fallback for direct reloads.
- Tightened responsive layout constraints after browser validation found a
  12px mobile horizontal overflow.

## Verification Result

- Focused Web/API/Core/CLI gates passed during implementation:
  `typecheck`, `lint`, `test`, `build`, and CLI bundle where applicable.
- Root gates passed:
  - `bun run check`
  - `bun run test`
  - `bun run build`
- Browser validation passed against local daemon
  `http://127.0.0.1:9217/`:
  - home route shows Soul catalog/workspace launcher
  - session route is deep-linkable
  - real Codex CLI continuation renders status, Bash tool card, compact
    stdout/stderr, final assistant text, artifact chip, review chip, and
    completion state
  - Settings opens and closes explicitly
  - desktop session chat and artifact rail are independently scrollable
  - 390px mobile viewport has no horizontal overflow
  - browser console has no errors
- code-review-graph passed:
  - `bun run crg:status`
  - `bun run crg:update`
  - `bun run crg:review`
  - MCP `get_minimal_context`
  - MCP `get_affected_flows`
  - Result: 16 changed files, 38 changed functions/classes, 0 affected flows,
    risk score `0.55`; reported test gaps are covered by the added API SSE
    test, Worker Web streaming test, root gates, and browser validation.
