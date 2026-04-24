# PLAN-015 Physical extraction — move worker/** into @aiworker/core

- **status**: draft
- **createdAt**: 2026-04-24 15:45
- **relatedTask**: REFACTOR-003
- **supersedes**: the original PLAN-012 draft (the mechanical move), now archived via the revision note in `docs/plan/PLAN-012.md`.
- **blockedBy**: PLAN-012, PLAN-013, PLAN-014

## Summary

After PLAN-012 (fs source of truth), PLAN-013 (WS gateway), and PLAN-014 (envelope + approval + fallback + cron) have shaken out the architecture, the worker tree is in its final shape. At that point — and only then — do the 107-file move into `packages/core` as a clean, reviewable mechanical change.

Why last: the moves that matter architecturally (the brain-provider rename, the dashboard/REST kill, the envelope surface shift, the config-yaml mirror) all change what `worker/**` contains. Doing the physical move first would force us to re-move files every time one of those plans lands. Doing it last means one atomic diff.

## Sketch

- New package `packages/core/src/worker/**` — direct git mv from `apps/api/src/worker/**`.
- Move cross-cutting helpers:
  - `apps/api/src/config/worker.ts` → `packages/core/src/config/worker.ts` (already lazy since phase 1a).
  - `apps/api/src/config/common.ts` → `packages/core/src/config/common.ts` (or delete if gateway config absorbs it post-PLAN-013).
  - `apps/api/src/shared/lib/ids.ts` → `packages/shared/src/lib/ids.ts` (pure; move to shared, not core).
  - `apps/api/src/shared/AppError` → `packages/shared/src/errors.ts`.
- Delete `apps/api/src/lib.ts` (the phase-1a bridge surface).
- `apps/cli` + `apps/gateway` switch import source from `@aiworker/api/lib` → `@aiworker/core`.
- ESLint `no-restricted-imports` enforcing: `packages/core` forbids `hono`, `@hono/*`, `@scalar/*`, `apps/**`.
- Regression test: hot-reload round-trip (`aiw serve` + `PUT /api/worker/config` via the gateway → next request routed through the new runtime; observer + proposer unhooked exactly once).

## Out of scope

- Anything that changes behaviour. This plan is a file move only.
