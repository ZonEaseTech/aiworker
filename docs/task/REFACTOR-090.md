# REFACTOR-090 Retire Host generic review and lesson product flow

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-21 12:21
- **claimedAt**: 2026-05-21 12:21
- **approvedAt**: 2026-05-21 15:35
- **completedAt**: 2026-05-21 16:36
- **plan**: PLAN-398
- **relatesTo**: ARCH-001, HOST-001, PROTO-001, MOUNT-001, DATA-001, UI-001

## Background

The active architecture contract keeps Host as a Local Shell + Engine Bridge for
Soul Apps. Host should locate sessions and bridge app-owned work, but it should
not own generic review, lesson, proposal or business-output lifecycle flows.

Earlier slices removed the Host broker kernel, Host workbench action/search
bridge, scaffold protocol defaults and official Soul App workbench protocol
defaults. The remaining Host-level artifacts/reviews/lessons API, storage and
Worker Web actions need a focused cleanup so micro-app and app-owned mounted API
surfaces remain the default product path.

## Acceptance Criteria

1. Host no longer exposes generic review creation, lesson status mutation or
   profile-revision promotion routes as default product actions.
2. Worker Web no longer presents Host-owned generic review/lesson controls as
   the default session product surface.
3. Host artifact records are limited to session output metadata or platform file
   references, not app-owned business meaning.
4. HR People Workbench owns accepted profile state through workspace
   `README.md`, with visible `profile-update-draft` language.
5. Focused API, storage, core runtime, Web and official Soul App tests cover the
   new Host/Soul boundary.

## Verification

- [x] Focused Host API tests
- [x] Focused storage tests
- [x] Focused core runtime tests
- [x] Focused Worker Web tests
- [x] Official Soul App tests when their Host data assumptions change
- [x] `bun run ui:check`
- [x] `git diff --check`
- [x] `bun run crg:update`
- [x] `bun run crg:review`

## Notes

- 2026-05-21 12:21: Claimed for investigation and proposal only. Do not
  implement until PLAN-398 is approved.
- 2026-05-21 12:31: Investigation found that generic reviews/lessons are still
  written by Host API/core/runtime and surfaced by Worker Web. HR depends on
  the read side, while QA is already mostly app-owned. PLAN-398 now recommends
  stopping new Host generic review/lesson behavior and moving HR profile data
  behind an app-owned mounted API.
- 2026-05-21 15:35: User approved a breaking implementation: delete old
  review/lesson tables, migrate HR profile to app-owned APIs, allow old
  workspaces to break, and adjust visible product language.
- 2026-05-21 16:36: Implemented the breaking cleanup. Host generic
  review/lesson tables and APIs are removed, HR profile updates write
  app-owned `README.md`, and the visible HR draft capability is now
  `profile-update-draft`.
