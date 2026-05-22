# PLAN-387 Shadcn monorepo UI package foundation

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-19
- **approvedAt**: 2026-05-19
- **relatedTask**: FEAT-105

## Current State

The official shadcn/ui docs now support monorepo installation through paired
`components.json` files, workspace aliases, package-local `package.json#imports`
and shared package `exports`. The CLI can route primitives to a shared UI
package when commands are run from the app workspace.

AIWorker is already close to the required baseline:

- Bun workspaces with `apps/*` and `packages/*`.
- React 19, Vite 8 and Tailwind CSS v4 in `apps/web`.
- Root TypeScript uses `moduleResolution: "bundler"`.
- `packages/component` historically owns AIWorker business shells and shared
  styles, but the active shadcn migration treats it as legacy migration debt.

Missing pieces:

- No `packages/ui` workspace dedicated to shadcn-managed primitives.
- No `components.json` files for shadcn CLI routing.
- No package-local `#components`, `#lib` or `#hooks` import targets.
- No Host/Soul proof that the new UI package can be consumed alongside the
  existing `packages/component` layer.

## Proposal

Create `packages/ui` as the official shadcn-compatible shared UI package using
the current CLI workflow. Configure `apps/web` and `packages/ui` with
`components.json` and package imports/exports that match the official monorepo
and package-imports documentation.

Use the shadcn CLI to add a very small first component set, then verify:

- generated shared primitives land in `packages/ui`;
- `apps/web` can resolve `@zonease/aiworker-ui`;
- an official Soul App package can depend on the new UI package;
- existing AIWorker business shells remain temporarily consumable while
  consumers migrate to direct `packages/ui` shadcn composition;
- future component migration can proceed one primitive at a time.

## Scope

- `packages/ui`
- `apps/web/components.json`
- `apps/web/package.json`
- `apps/web/src/styles/index.css`
- `apps/aiworker-hr/package.json`
- `docs/task/FEAT-105.md`
- `docs/plan/PLAN-387.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`
- workspace lockfile and focused tests when dependencies change

## Non-Goals

- No broad Worker Web redesign.
- No removal of `packages/component` in this foundation slice.
- No wholesale primitive migration.
- No Host/Soul protocol, manifest, storage or broker change.
- No app-local manual recreation of shadcn component files.

## Implementation Steps

1. Add PMA tracking and claim the task.
2. Configure `packages/ui` as a workspace package with shadcn-compatible
   imports, exports, scripts and TypeScript config.
3. Configure `apps/web/components.json` and `packages/ui/components.json` so the
   shadcn CLI can route shared primitives and app-local blocks correctly.
4. Run the official shadcn CLI with dry-run/diff first, then add a minimal
   component set if routing is correct.
5. Wire Host Web and an official Soul App package to depend on the UI package
   without migrating visible UI yet.
6. Run focused verification and record follow-up migration guidance.

## Risks

- shadcn CLI may not perfectly infer this existing Bun workspace layout; keep
  the first component set tiny and verify the generated paths.
- shadcn's generated style entrypoint may overlap with current
  `packages/component` tokens; import order must preserve current Worker Web.
- Adding `packages/ui` dependencies changes the lockfile and may require
  focused package gates.

## Verification

- `bunx shadcn@latest info -c apps/web`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run ui:check`
- `bun run docs:check`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Completion

Completed.

The official shadcn CLI recognizes the Host Web workspace as Vite/Tailwind v4
with `radix-nova`, resolves `ui` to
`packages/ui/src/components`, and reports `button` as installed. It also
recognizes `packages/ui` as a manual shadcn workspace with the same
configuration.

The first generated primitive is intentionally small:

- `packages/ui/src/components/button.tsx`
- `packages/ui/src/lib/utils.ts`
- `packages/ui/src/styles/globals.css`

Host Web imports `@zonease/aiworker-ui/styles.css` before the existing legacy
`@zonease/aiworker-component/styles.css`, making the shadcn UI tokens
available while the old component consumers are migrated away. The HR Soul App
proof test imports both `@zonease/aiworker-ui/components/button` and
`@zonease/aiworker-ui/styles.css`, proving the package works for Soul App
consumers too. Later migration work supersedes the earlier assumption that the
old component package remains a long-term shared UI layer.

Verification completed:

- Passed: `bunx shadcn@latest info -c apps/web --json`
- Passed: `bunx shadcn@latest info -c packages/ui --json`
- Passed: `bunx shadcn@latest add button -c apps/web --dry-run`
- Passed: `bun run --filter '@zonease/aiworker-ui' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-ui' test`
- Passed: `bun run typecheck`
- Passed: `bun run lint`
- Passed: `bun run --filter '@zonease/aiworker-web' test`
- Passed: `bun run --filter '@zonease/aiworker-web' build`
- Passed: `bun run --filter '@zonease/aiworker-hr' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-hr' test`
- Passed: Browser smoke at `http://localhost:5173/` with no page errors or
  console errors.
- Passed: `git diff --check`
- Passed: `bun run crg:update`
- Passed: `bun run crg:review`

`crg:review` reported `0` affected flows, `0` test gaps and overall risk score
`0.30`.
