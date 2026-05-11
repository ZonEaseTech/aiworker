# PLAN-239 Worker list and creation dialog refinement

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-11 03:05
- **relatedTask**: REFACTOR-061

## Current State

- Worker list items reuse `.soul-rail-item`, producing a card-like list with
  excess height and visual weight.
- Create worker and create workspace forms are full block panels sitting beside
  the lists. This makes browsing and creating feel like two disconnected page
  modes.
- Existing creation APIs and route transitions are correct and should be kept:
  create worker -> `/workers/:workerId`, create workspace ->
  `/workers/:workerId/workspaces/:workspaceId`.

## Proposal

1. Replace worker list card styling with compact list items:
   worker name, Soul/domain, status dot, and optional engine metadata in a
   dense row.
2. Replace always-visible create blocks with icon button triggers:
   - create worker icon in worker list header;
   - create workspace icon in workspace list header / empty state.
3. Add lightweight dialogs for create worker and create workspace using the
   shared pill controls from PLAN-238.
4. Preserve current submit handlers, API payloads, and navigation behavior.
5. Keep empty states informative but avoid duplicating a second block-form
   create surface.

## Scope

In scope:

- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/studio.css`
- `apps/web/src/worker/i18n.ts`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`

Out of scope:

- Worker deletion, pause/resume, or engine reassignment.
- Backend changes.
- Introducing a generic dialog library in this slice.

## Risks

- Icon-only triggers need clear accessible names and visible focus states.
- Dialog focus behavior should be acceptable for current scope; if a mature
  headless dialog primitive is absent, keep the implementation minimal and
  tested rather than inventing a complex modal framework.
- Creation dialogs must not hide the first-run path for users with no workers.

## Verification Plan

- RTL tests for opening create worker/workspace dialogs and successful submit.
- Existing worker switch, workspace create, and route navigation tests stay
  green.
- Browser validation at desktop and mobile widths.
- Focused Web typecheck, lint, test, and build.
- code-review-graph update/review after code edits.

## Approval Gate

Approved by operator on 2026-05-11.

## Result

Completed with compact worker list rows, create worker/workspace dialogs, and
RTL coverage for dialog submit and navigation behavior.
