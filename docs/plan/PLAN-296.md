# PLAN-296 Worker Web build chunk reduction

- **status**: completed
- **createdAt**: 2026-05-13 15:41
- **approvedAt**: 2026-05-13 15:41
- **relatedTask**: BUG-117

## Context

`bun run build` currently succeeds but Vite warns that Worker Web emits a large
JavaScript chunk:

- `apps/web/dist/worker/assets/index-*.js`: about 779 kB uncompressed, about
  223 kB gzip.
- Vite's default warning threshold is 500 kB.

Sourcemap investigation showed the warning is structural, not caused by recent
Host/Soul App metadata work. The single Web entry statically pulls the whole
Worker Studio, HR specialized workbench, markdown renderer stack and a heavy
`@zonease/aiworker-shared` top-level barrel into one initial chunk.

## Proposal

1. Add lightweight public package subpaths:
   - `@zonease/aiworker-shared/soul-workbench-catalog` for runtime workbench
     descriptors without importing all shared schemas, fixtures, zod and yaml.
   - `@zonease/aiworker-component/markdown-preview` for lazy markdown preview
     loading without importing it through the component barrel.
2. Convert specialized Soul workbench rendering to React lazy loading so HR
   workbench code is not part of the initial Worker Studio chunk.
3. Convert markdown preview rendering inside the HR profile details panel to a
   second lazy boundary so the markdown parser stack loads only when an artifact
   preview is visible.
4. Keep the build threshold unchanged. The build should stop warning because
   emitted chunk sizes are below the default limit.

## Scope

In scope:

- Worker Web runtime imports and lazy boundaries;
- shared/component package export subpaths needed by those lazy boundaries;
- focused tests and Web build/smoke verification;
- PMA/changelog updates.

Out of scope:

- replacing React, Vite or markdown libraries;
- broad router/provider refactors;
- raising `chunkSizeWarningLimit`;
- changing product UX beyond loading boundaries.

## Risks

- **Lazy boundary timing in tests.** Existing tests must wait for HR workbench
  content that now resolves asynchronously.
- **Public package subpaths.** New subpaths should remain narrow and stable;
  they should not expose Host internals.
- **False warning removal.** The fix is valid only if `vite build` no longer
  emits the chunk-size warning without changing the warning limit.

## Verification

- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run web:smoke:mounted-surfaces`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
- `bun run web:smoke:mounted-surfaces`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-13 15:41: Created and claimed after investigation confirmed the
  warning comes from a single static Worker Web entry chunk and heavy conditional
  surfaces.
- 2026-05-13 15:49: Completed. Worker Web now lazy-loads the HR specialized
  workbench and nested markdown preview stack, and imports workbench descriptors
  from a lightweight shared catalog subpath.

## Verification Results

- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-shared' test src/soul-workbench.test.ts`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`

All commands above exited 0. The root build emitted no Vite chunk-size warning.
Worker Web JS chunks were:

- `index-BbKMgXvz.js`: 351.99 kB, gzip 104.43 kB
- `markdown-preview-DFe-rfff.js`: 162.29 kB, gzip 48.87 kB
- `people-workbench-uvIp9a3i.js`: 28.52 kB, gzip 8.79 kB

Mounted surface smoke, diff check and code-review-graph also exited 0.
`crg:review` reported static test-gap warnings for touched lazy modules, while
focused Web tests and browser smoke cover the HR workbench and mounted surface
behavior.
