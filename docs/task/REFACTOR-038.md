# REFACTOR-038 Worker Web greenfield studio rebuild

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 00:16
- **claimedAt**: 2026-05-10 00:16
- **plan**: PLAN-204
- **relatesTo**: REFACTOR-037, PLAN-203, apps/web, DESIGN.md

## Background

REFACTOR-037 rebuilt the local worker data model, API, CLI, runtime, and the
Worker Web page content. User review still correctly identified the Web as a
legacy artifact because it remained inside the old `apps/web` shell:

- `apps/web` still built both `fleet` and `worker` bundles.
- Vite still generated two TanStack route trees.
- Worker Web still imported shared admin UI primitives and the old theme store.
- The first paint still used an admin-dashboard shape: header, sidebars,
  panels, cards, and generic controls.
- Fleet code remained inside the default web package even though fleet/gateway
  is explicitly parked.

## Goal

Replace Worker Web with a worker-only local studio:

```text
brief shelf -> run lane -> artifact canvas -> review rail -> lesson ledger
```

The Web deliverable should feel like a new product workspace, not the previous
admin application with local worker data injected into it.

## Acceptance Criteria

- `apps/web` builds a single worker studio bundle.
- No `src/fleet`, `apps/web/fleet`, TanStack route tree, shared admin UI
  component import, theme store, or dual-bundle chooser remains in the default
  web deliverable.
- Worker Web uses a purpose-built studio CSS surface instead of shadcn/admin
  panel composition.
- First paint is organized around brief, run, artifact, review, and lesson
  work surfaces.
- Browser review confirms the new studio renders without console errors.
- Web focused gates, root gates, and CRG review are recorded before completion.

## Progress

- 2026-05-10 00:16: Created after user review rejected the previous Worker Web
  as still feeling like a legacy product.
- 2026-05-10 00:23: Completed the destructive Worker Web reset. `apps/web`
  now builds a single worker studio bundle, deletes the old fleet/shared/admin
  shell, and renders brief -> run -> artifact -> review -> lesson surfaces
  directly from `/api/local/*`.
- 2026-05-10 00:23: Verification passed:
  `bun run --filter '@zonease/aiworker-web' test`,
  `bun run --filter '@zonease/aiworker-web' typecheck`,
  `bun run --filter '@zonease/aiworker-web' lint`,
  `bun run --filter '@zonease/aiworker-web' build`,
  `bun run --filter '@zonease/aiworker-web' size:baseline`,
  `bun run check`, `bun run test`, `bun run build`, and `git diff --check`.
- 2026-05-10 00:23: Browser review opened
  `http://127.0.0.1:5173/worker/` against the local daemon. Desktop and mobile
  viewport checks rendered the new studio; console check reported 0 errors and
  0 warnings.
- 2026-05-10 00:23: CRG ran after marking new files intent-to-add:
  `bun run crg:update` and `bun run crg:review` reported 81 changed files, 0
  affected flows, 33 test gaps, and overall risk score 0.45. The reported gaps
  are local helper/component coverage gaps for the newly built studio and are
  mitigated by focused Web unit coverage plus browser review.
