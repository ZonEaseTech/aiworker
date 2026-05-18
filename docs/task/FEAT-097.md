# FEAT-097 HR Soul App header convergence

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-18
- **claimedAt**: 2026-05-18
- **plan**: PLAN-358
- **relatesTo**: FEAT-096, REFACTOR-080, REFACTOR-081, docs/superpowers/specs/2026-05-18-hr-soul-app-header-convergence-design.md

## Background

The HR People Workbench still renders a Soul App-level top header inside the
Host header. That row duplicates navigation meaning and concentrates unrelated
controls: profile search, profile metrics, new-profile action, refresh,
evidence, settings, and HR panel toggles.

The approved design keeps the Host header intact and removes only the HR Soul
App workbench header. HR controls move to the object they affect: the People
Profiles panel or the selected People Profile header.

## Acceptance Criteria

- The Host header remains visible and unchanged.
- The HR Soul App workbench no longer renders its own top header row.
- There is no HR workbench-level search. If a filter exists, it is scoped only
  to the People Profiles list.
- `New people profile` is an icon action in the People Profiles panel header.
- HR left/right panel toggles live in the selected People Profile header.
- Refresh, Evidence, and HR settings live in the selected People Profile
  header.
- The center profile surface has one selected-profile header and does not wrap
  README content in an extra `Current Profile Summary` UI header.
- The patch review strip hides when there is no actionable patch, when there
  are zero changed sections, and after approval refreshes the accepted README.
- The patch review strip action uses a short label or compact icon affordance.

## Notes

- This is HR-owned workbench UI. It must not become a Host header slot or
  require Host shell changes.
- The change is visual and interaction-level only. It should not change HR
  profile promotion API behavior or Host/Soul protocol schema.

## Completion

Implemented in the HR People Workbench:

- Removed the HR Soul App workbench header while preserving the Host header.
- Moved new-profile creation into the People Profiles panel header.
- Moved profile-list/tool toggles plus refresh, evidence, and settings into
  the selected People Profile header.
- Removed the extra `Current Profile Summary` UI wrapper above the README
  reading room.
- Restricted the patch strip to actionable ready patches and shortened the
  visible action label to `Review`.
- Kept mounted Soul App primary/actions functional without rendering the
  workbench-level search surface.

Verification completed:

- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- Browser smoke against the local Ben HR workspace at `127.0.0.1:5173`
- `bun run crg:update`
- `bun run crg:review`
