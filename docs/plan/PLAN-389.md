# PLAN-389 HR app-owned people workbench port

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-20
- **approvedAt**: 2026-05-20
- **relatedTask**: BUG-147

## Current State

The shadcn/micro-app migration removed the Host-specific HR renderer directory,
which is correct for the Host/Soul boundary. The problem is sequencing: the
deleted Host path also held the mature HR people workbench model, profile
README parser and revision-review logic, while `apps/aiworker-hr/product/web`
still renders proof-level mounted cards.

## Proposal

Translate the previous HR workbench into the HR Soul App package instead of
restoring Host renderer code. Pure domain logic moves into
`apps/aiworker-hr/product/web/people-workbench`, UI is rebuilt with shadcn
components from `@zonease/aiworker-ui`, and mounted/standalone entrypoints both
render the app-owned surface.

## Scope

- HR app product web model, README parsing and revision-review modules.
- HR app product web shadcn workbench route surface.
- HR app standalone and Host-mounted HTML entrypoints.
- HR app tests for domain projection, parser/review logic and mounted HTML.
- Task/plan/changelog audit trail for this boundary repair.

## Non-Goals

- No restoration of `apps/web/src/worker/souls/hr`.
- No new Host-owned HR data interpretation.
- No dependency on `packages/component` or `@zonease/aiworker-component`.
- No claim that the broader shadcn migration goal is complete.

## Verification Plan

- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-hr' smoke`
- `bun apps/web/scripts/smoke-mounted-surfaces.ts`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- `bun scripts/check-web-ui-components.ts --all --audit`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Completion Notes

The HR people workbench now lives under the HR Soul App package and is rendered
through the app-owned `/micro-app/routes/hr-home` surface. The previous Host
renderer path remains removed. The live 5173 dev route was refreshed and
checked with Playwright; it now shows the HR people workbench CTA
`Request reviewer decision`.
