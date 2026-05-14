# PLAN-224 Worker Web production UX integration

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 19:05
- **completedAt**: 2026-05-10 19:39
- **relatedTask**: REFACTOR-051

## Investigation

Worker Web has working backend contracts but the current UI does not make those
contracts feel like one product.

Observed anchors:

- Data model is available: Web loads workers, Souls, templates, workspaces,
  sessions, turns, files, artifacts, reviews, lessons, events, and settings.
- Backend supports both creating an initial workspace session and adding
  follow-up turns to an existing session.
- Web currently only exposes the initial create path. Existing workspace cards
  can be selected, but selection only changes the side artifact rail.
- Top-level tabs are inert product labels. They do not render module-specific
  domain systems, connectors, templates, artifacts, or examples.
- Settings is real enough to persist and test/rescan engines, but execution
  readiness is not integrated into the workspace/session flow.
- Responsive behavior hides the artifact rail at tablet width without an
  alternate artifact/session detail surface.

## Proposal

Implement this as a Web-focused production UX refactor in four slices.

1. **Connected workspace shell**
   - Replace inert top tabs with a purposeful three-column product flow:
     Soul/capability selector, workspace/session list, and selected session
     detail.
   - Keep HR/PM/QA/DevOps as the primary Soul catalog and make disabled Souls
     visually secondary.
   - Move template details and input hints into the active creation path rather
     than a fake `Template` tab.

2. **Session detail and follow-up turn loop**
   - Add Web API client support for `POST /api/local/sessions/:sessionId/turns`.
   - Show selected workspace metadata, active session, turn history, latest
     status, events, and generated artifacts together.
   - Add a follow-up turn composer for existing sessions, using the selected
     session's capability template and execution settings.

3. **Artifact, review, memory, and settings integration**
   - Promote artifact preview from a detached rail into the selected session
     detail, with a reachable drawer/panel on narrow widths.
   - Surface review findings/risks when present and expose a minimal human
     review action backed by `POST /api/local/reviews`.
   - Surface proposed memory candidates and allow accept/reject through
     `PATCH /api/local/lessons/:id`.
   - Show execution readiness near create/turn actions: selected mode, engine
     installed state, connector/MCP toggles, and a direct Settings entry.

4. **Production validation**
   - Split `worker-studio.tsx` into focused Web modules before adding behavior:
     data/actions, selection derivation, Soul selector, workspace list, session
     detail, artifact preview, review/memory panel, and Settings dialog.
   - Expand tests to cover the connected flow: Soul switch, workspace selection,
     initial create, follow-up turn, artifact preview, review/memory actions,
     Settings readiness, and responsive artifact access.
   - Validate with focused Web gates, root gates as feasible, browser flow, and
     code-review-graph after code changes.

## Scope

In scope:

- `apps/web/src/worker/**`
- Minimal `apps/api/src/modes/worker.ts` or shared type updates only if the Web
  flow exposes an already-supported action that needs typed client coverage.
- Focused Web tests and PMA docs.

Out of scope:

- Changing the already-agreed host/daemon/worker/workspace/session architecture.
- Reintroducing project-scope startup, run/case language, import entrypoints, or
  Open Design product copy.
- Building a generic fleet/admin dashboard.

## Risks

- This is large enough that preserving the current one-file component will keep
  producing demo-like behavior. The implementation should split modules early.
- The backend review and lesson APIs are minimal. The Web should expose only
  thin, honest actions rather than pretending to have a full review workflow.
- Browser validation must include responsive widths because the current artifact
  rail disappears below `980px`.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- API focused gates if API/shared files change.
- Browser flow against local daemon:
  1. open `http://127.0.0.1:9217/`
  2. switch Soul
  3. choose a capability
  4. create workspace session
  5. add a follow-up turn
  6. inspect artifact/review/memory state
  7. change Settings and verify readiness/persistence
  8. repeat at desktop and narrow viewport
- `bun run crg:status`
- `bun run crg:update`
- `bun run crg:review`

## Approval Gate

Approved by operator with `proceed` on 2026-05-10.

## Implementation

- Removed inert Worker Web module tabs and converted the first screen into a
  connected Soul workspace: Soul catalog, capability templates, workspace
  creation/listing, and selected session detail.
- Added typed Web client calls for follow-up session turns, reviews, and lesson
  status updates.
- Added `SessionDetail` as a dedicated surface for continue-turn, artifact
  preview, turn history, review, memory candidates, and event history.
- Kept Settings as an explicit dialog and surfaced execution readiness directly
  in the creation and continuation path.
- Updated responsive layout so session/artifact detail remains reachable below
  tablet width.

## Verification Results

- Focused Web gates passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test -- --reporter=verbose`
  - `bun run --filter '@zonease/aiworker-web' build`
- Root gates passed:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test`
  - `bun run build`
  - `git diff --check`
- Browser verification passed at `http://127.0.0.1:9217/`:
  - page title: `AIWorker · Soul Workspace`
  - first viewport: Soul catalog and capability templates, not import/work
    order/dashboard tabs
  - existing HR workspace shows session detail, 2 artifacts, 2 turns, review
    state, memory candidate state, and 9 session events after a real follow-up
    turn
  - narrow viewport keeps the session/artifact detail reachable
- code-review-graph passed:
  - `bun run crg:status`
  - `bun run crg:update`
  - `bun run crg:review`
  - MCP `get_review_context`, `detect_changes`, `get_impact_radius`, and
    `get_affected_flows`
  - Result: 11 changed files, 36 changed functions/classes, 0 affected flows,
    overall risk score `0.55`; test gap warnings for API client/session-detail
    helpers are covered by Worker Web RTL and local browser validation.
