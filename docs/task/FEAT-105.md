# FEAT-105 Shadcn monorepo UI package foundation

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-19
- **claimedAt**: 2026-05-19
- **plan**: PLAN-387
- **relatesTo**: ARCH-001, HOST-001, SOUL-001, IMPORT-001, FEAT-099, FEAT-101

## Background

AIWorker already has `packages/component` as a Host/Soul shared component
package, but its primitive layer is still project-maintained. The intended
long-term direction is to follow the official shadcn/ui monorepo workflow:
install reusable primitives into a dedicated `packages/ui` workspace, then move
Host Web and official Soul App web consumers to direct shadcn composition. The
legacy `packages/component` package should be treated as migration debt, not as
the place to grow new shells or styles.

## Acceptance Criteria

1. A new workspace package exposes a shadcn-compatible shared UI target at
   `packages/ui`.
2. `apps/web` and `packages/ui` have `components.json` files that follow the
   official monorepo/package-imports model.
3. The first shadcn components are added by the official CLI, not by manual file
   transcription.
4. The shared UI package exports styles, components, lib helpers and hooks in a
   form usable by Host Web and Soul App workspaces.
5. Host Web can import the shared UI package without breaking its existing
   Worker Web style entrypoint.
6. At least one official Soul App package can typecheck while depending on the
   shared UI package.
7. The existing `packages/component` consumers remain intact for this
   foundation slice; full migration is handled by follow-up work.
8. Focused typecheck/test/build/UI-governance/docs/diff and code-review-graph
   checks pass or have explicit residual-risk notes.

## Notes

- This task establishes the migration foundation only. Component-by-component
  replacement remains a follow-up track and should reduce reliance on
  `packages/component`.
- Host/Soul protocol, manifest, broker, storage and domain semantics are out of
  scope.

## Completion

Implemented the shadcn monorepo UI foundation:

- Created `packages/ui` as `@zonease/aiworker-ui`.
- Added official shadcn-compatible `components.json` files for `apps/web` and
  `packages/ui`.
- Configured package-local imports and shared package exports for
  `components`, `lib`, `hooks` and `styles.css`.
- Used the official shadcn CLI to add the first `button` primitive into
  `packages/ui/src/components/button.tsx`.
- Added the required generated-component dependencies to the UI workspace.
- Imported the UI package style entrypoint from Host Web.
- Proved the HR Soul App can import both the generated shadcn button and the
  UI style entrypoint.

Verification completed:

- `bunx shadcn@latest info -c apps/web --json`
- `bunx shadcn@latest info -c packages/ui --json`
- `bunx shadcn@latest add button -c apps/web --dry-run`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
- `bun run --filter '@zonease/aiworker-ui' test`
- `bun run typecheck`
- `bun run lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- Browser smoke at `http://localhost:5173/` with no page errors or console
  errors.
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
