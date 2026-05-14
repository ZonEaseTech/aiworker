# REFACTOR-051 Worker Web production UX integration

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 19:05
- **claimedAt**: 2026-05-10 19:05
- **completedAt**: 2026-05-10 19:39
- **plan**: PLAN-224
- **relatesTo**: apps/web

## Background

The Worker Web first screen now uses the new Soul worker / workspace / session
contract, but it is still not production-ready. The visible surface feels like
separate demo modules: the create panel, top tabs, workspace cards, artifact
rail, review state, memory candidates, and Settings are present but not joined
into one obvious operator flow.

## Goal

Refactor Worker Web into a connected, production-grade Soul workspace UX:
choose a Soul, inspect the selected Soul's capabilities, create or select a
workspace, continue the active session with additional turns, inspect artifacts,
review evidence, and see how Settings affects the execution path.

## Acceptance Criteria

- Web first viewport presents one clear product path, not independent demo
  widgets.
- Soul selection updates capability templates, workspace list, selected
  workspace, selected session, artifact preview, review, and memory evidence in
  one connected state graph.
- Existing workspaces expose a usable session detail panel with turn history,
  event status, artifact preview, and a follow-up turn composer.
- Top-level navigation routes to real module views or is removed/converted into
  contextual filters; no inert tab should imply unavailable functionality.
- Settings engine/connectors/MCP state is surfaced at the point of session
  creation/continuation so users understand why a turn can or cannot run.
- Responsive desktop/tablet/mobile layouts keep artifact and session detail
  reachable; the artifact rail must not disappear without an alternate access
  path.
- Focused Web tests cover the connected flow, not only first-render and API
  call smoke assertions.
- Browser verification proves the end-to-end Web path is usable from the local
  daemon.

## Investigation Notes

- `apps/web/src/worker/worker-studio.tsx` is a 1,210-line component that owns
  data loading, selection state, creation form, workspace cards, artifact rail,
  and the entire Settings dialog. This makes module boundaries hard to reason
  about and has already encouraged visual completeness without interaction
  completeness.
- `activeTopTab` switches labels and active tab styling, but all tabs render the
  same workspace card grid. `Examples`, `Domain systems`, `Connectors`,
  `Templates`, and `Artifacts` therefore look like real modules without having
  module-specific content.
- `activeCreateTab` and `activeProjectTab` are UI-only state; `Template` and
  `This Soul` do not change the creation or browsing behavior.
- The only executable Web path is create workspace plus first session turn.
  The API already supports `POST /api/local/sessions/:sessionId/turns`, but Web
  does not expose a follow-up turn composer.
- The artifact rail can preview the selected artifact, but it is detached from a
  session detail timeline and is hidden below `980px` without an alternate
  artifact access path.
- Review and memory are passive counts; Web does not expose the available
  review/lesson APIs as visible operator actions.
- Current Web tests prove absence of import/work-order wording, a basic create
  call, and Settings persistence. They do not exercise selecting an existing
  workspace, continuing a session, switching modules, responsive artifact
  access, or review/memory affordances.

## Implementation Summary

- Replaced the disconnected top-tab/demo layout with a connected three-column
  Worker Web flow: Soul/capability selector, workspace/session list, and active
  session detail.
- Added existing-session continuation through
  `POST /api/local/sessions/:sessionId/turns`.
- Added visible session detail for artifacts, turn history, review state,
  memory candidates, and event history.
- Wired minimal review and lesson actions to `POST /api/local/reviews` and
  `PATCH /api/local/lessons/:id`.
- Surfaced execution readiness and direct Settings entry near create/continue
  actions.
- Split the session detail surface out of `worker-studio.tsx` and expanded Web
  tests for the connected follow-up/review/memory path.

## Verification

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test -- --reporter=verbose`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- Browser at `http://127.0.0.1:9217/`: confirmed connected Soul catalog,
  capability selection, selected workspace/session detail, follow-up turn
  artifact, review status, memory candidates, and event history are visible.
- code-review-graph:
  - `bun run crg:status`
  - `bun run crg:update`
  - `bun run crg:review`
  - `get_review_context`, `detect_changes`, `get_impact_radius`, and
    `get_affected_flows` via the CRG MCP.
  - Result: 11 changed files, 36 changed functions/classes, 0 affected flows,
    overall risk score `0.55`; CRG flagged API client/session detail test gaps,
    covered by the expanded Worker Web RTL flow and local browser verification.
