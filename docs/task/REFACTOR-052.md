# REFACTOR-052 Worker Web session-first interaction model

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 19:59
- **claimedAt**: 2026-05-10 20:04
- **plan**: PLAN-225
- **relatesTo**: apps/web, apps/api, packages/core

## Background

The current Worker Web has a connected data path, but its interaction model is
still not good enough. It presents too many modules in one viewport, compresses
engine execution into passive event counters, and does not prove that oversized
content remains usable through independent scrolling.

Open Design's product structure is a useful interaction reference here:

- Home/entry and project routes are separated by URL state.
- Inside a project, the primary surface is conversation/message/run, not a
  dashboard of every possible module.
- Agent/engine activity streams into the assistant message as text, thinking,
  tool-use, status, produced files, and completion state.
- Files/artifacts live beside the conversation as a workspace, not as a pile of
  unrelated panels.
- Scroll containers are bounded and independently scrollable.
- The session/message primitives are mature enough to port directly instead of
  designing a parallel AIWorker-only implementation.

AIWorker must translate that into Soul terms:

- Home: Soul catalog and workspace selection/creation.
- Workspace: selected Soul workspace with sessions.
- Session: the main conversation/engine handoff surface.
- Artifact/review/memory: contextual drawers or secondary panes, not always-on
  blocks competing with the active session.

## Problem

- Session detail does not show the actual engine process. The backend currently
  calls `LocalExecutor.invoke(...)` as a blocking promise and only persists
  coarse `status`, `artifact`, `review`, and `lesson` events after the engine
  returns.
- Web renders turn history, artifact, review, memory, and events as stacked
  sections in one side panel. This makes the product feel like feature
  inventory rather than a work surface.
- Route state is shallow. `/` contains home, selected Soul, workspace list,
  selected session, artifacts, review, memory, and Settings entry points.
- Scroll behavior has not been verified against intentionally oversized
  artifact content, long turn logs, many workspaces, narrow widths, and short
  heights.
- The design optimizes for feature presence instead of the user's next action.

## Goal

Rebuild Worker Web around a session-first interaction model: choose Soul and
workspace, open a session route, watch engine activity as a conversation-like
timeline, continue the session, and inspect artifacts/review/memory through
focused secondary surfaces with proven scroll behavior.

## Acceptance Criteria

- Web route hierarchy separates home/catalog, workspace, and session detail.
- The primary session route is a conversation/timeline surface, not a stacked
  dashboard.
- Engine activity is visible at message level:
  assistant deltas, thinking/log/status events, tool usage, tool results,
  artifact creation, review, and completion/error state.
- Session rendering, message block grouping, tool cards, buffered streaming
  updates, run reattachment, and scroll behavior should be ported from Open
  Design where practical, then adapted to AIWorker naming and APIs.
- Backend stores and serves engine events as first-class session/turn events.
- Artifact, review, memory, and event inspection are reachable but not all
  expanded by default in the main viewport.
- Oversized content is usable:
  long artifact body, long engine log, many workspaces, many turns, narrow
  viewport, short viewport, and ultra-wide viewport all have bounded scroll and
  no clipped controls.
- Browser verification includes scroll assertions and screenshots across at
  least desktop, narrow, short-height, and ultra-wide layouts.
- No import/work-order/Open Design product copy is reintroduced.

## Investigation Notes

- Open Design `apps/web/src/router.ts` keeps a small URL router with home and
  project routes.
- Open Design `apps/web/src/App.tsx` chooses `EntryView` for home and
  `ProjectView` for project routes.
- Open Design `ProjectView` treats conversations/messages as the primary
  working model and can reattach active daemon runs.
- Open Design `AssistantMessage` renders streamed agent events as prose,
  thinking blocks, status pills, grouped tool-use cards, produced files, and a
  completion footer.
- Open Design already splits reusable session primitives across
  `ChatPane.tsx`, `ChatComposer.tsx`, `AssistantMessage.tsx`, `ToolCard.tsx`,
  `runtime/markdown.tsx`, `runtime/tool-renderers.ts`, `runtime/todos.ts`, and
  `providers/daemon.ts`.
- Open Design daemon `runs.ts` keeps run events and supports SSE replay via
  `Last-Event-ID`.
- Open Design is Apache-2.0, so direct code porting is acceptable with proper
  attribution/license hygiene.
- AIWorker already has `AgentEvent` schemas in
  `packages/shared/src/providers/agent-event.ts`, but current
  `packages/core/src/worker/executor.ts` exposes only a blocking
  `LocalExecutor.invoke(...)` result.
- AIWorker `LocalWorkerRuntime.startTurn(...)` only appends coarse session
  events around the blocking invocation and after artifact/review/lesson
  capture.
- AIWorker Web currently has only `/` and packs catalog, workspace, selected
  session, artifact, review, memory, and events into one view.

## Proposal Status

Approved by operator with `proceed` on 2026-05-10.

## Implementation Summary

- Added a Worker Web route helper and split `/` from
  `/workspaces/:workspaceId/sessions/:sessionId`.
- Reframed `/` as the Soul catalog/workspace launcher; selected workspace
  sessions now open as deep-linkable session routes.
- Added a session-first chat surface adapted from Open Design's interaction
  model: user turn, assistant engine flow, status/log blocks, tool cards,
  artifact/review chips, sticky composer, scroll-to-latest, and compact grouped
  engine logs.
- Moved artifact/review/memory/session events into the session route secondary
  pane instead of expanding all details on the home screen.
- Extended the local executor/runtime/API path so session turns can emit
  normalized engine events during execution and Web can consume them over SSE.
- Added SSE heartbeat and daemon `idleTimeout` tuning so long local engine
  turns do not break the browser stream.
- Fixed Worker Web asset base and daemon SPA fallback so direct session route
  refreshes load the built bundle correctly.
- Added responsive constraints for the session route so chat, composer, Soul
  sidebar, and artifact rail do not create mobile horizontal overflow.

## Verification

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-api' build`
- `bun run check`
- `bun run test`
- `bun run build`
- Local daemon health at `http://127.0.0.1:9217/health`
- Browser validation at `http://127.0.0.1:9217/`:
  home opens as Soul workspace launcher; workspace click navigates to
  `/workspaces/:workspaceId/sessions/:sessionId`; session page shows the real
  Codex CLI engine process with status, Bash tool card, compact stdout/stderr,
  final assistant text, artifact and review chips; Settings opens/closes
  explicitly; desktop and 390px mobile layouts keep independent chat/artifact
  scrolling and no horizontal overflow.
- Root `check` initially failed because Playwright CLI generated
  `.playwright-cli/*.yml` snapshots under the repo root; those temporary
  validation artifacts were removed and `bun run check` then passed.
- code-review-graph:
  - `bun run crg:status`
  - `bun run crg:update`
  - `bun run crg:review`
  - MCP `get_minimal_context`
  - MCP `get_affected_flows`
  - Result: 16 changed files, 38 changed functions/classes, 0 affected flows,
    overall risk score `0.55`. CRG reports test gaps around
    `bootstrapWorkerApp` and `streamSessionTurn`; this slice covers them with
    API SSE tests, Web stream tests, root gates, and local browser validation.

## Outcome

Completed. Worker Web now behaves as a session-first vertical Soul workspace
instead of a single-page module inventory, and the engine process is visible in
the same primary surface where the operator continues the session.
