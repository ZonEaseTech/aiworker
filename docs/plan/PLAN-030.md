# PLAN-030 Restore Web Tailwind utility generation

- **status**: completed
- **createdAt**: 2026-04-28 19:03
- **approvedAt**: 2026-04-28 19:06
- **relatedTask**: BUG-028

## Context

Investigation confirmed the Web production build succeeds but emits CSS bundles
that only contain Tailwind base/theme output:

1. `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-web' build`
   succeeds for both bundles.
2. The emitted CSS remains 6111 bytes for both
   `apps/web/dist/fleet/assets/index-BPew1ixe.css` and
   `apps/web/dist/worker/assets/index-BPew1ixe.css`.
3. Searching those CSS files for representative app utilities such as `.flex`,
   `.min-h-screen`, `.rounded-md`, `.p-6`, `.border-r`, `.bg-background`, and
   `.text-foreground` finds no matches.
4. The source uses those utilities in the bundle shells and shared UI,
   including `apps/web/src/fleet/routes/__root.tsx`,
   `apps/web/src/worker/routes/__root.tsx`, and
   `apps/web/src/shared/components/ui/button-variants.ts`.
5. `apps/web/vite.config.ts` changes Vite `root` to
   `apps/web/{fleet,worker}` during production builds, while the HTML entries
   import application code from `../src/{fleet,worker}/main.tsx`.
6. Tailwind CSS v4 documentation says automatic source detection starts from
   the current working directory by default and supports explicit source
   registration with `@source` or import `source(...)`. That matches the
   observed multi-root build gap.

Existing CLI publish packaging already copies `apps/web/dist/{fleet,worker}` to
`apps/cli/dist/web/{fleet,worker}` in
`apps/cli/scripts/build-publish-manifest.ts`, so the packaging path should not
need structural changes if the Web build output is corrected.

## Proposal

1. In `apps/web/src/shared/styles/globals.css`, explicitly register the app
   source tree for Tailwind v4 scanning:

   ```css
   @import 'tailwindcss';
   @source '../..';
   ```

   The stylesheet lives under `apps/web/src/shared/styles`, so `../..` points at
   `apps/web/src`, covering fleet, worker, and shared UI code for both bundles.
2. Extend `scripts/web-quality.ts` with a `css-utilities` command that reads the
   built fleet and worker CSS assets and fails when any critical selectors are
   missing.
3. Add an app-local script, for example `check:css-utilities`, and run it from
   `apps/web/package.json` after both production bundle builds.
4. Verify the CLI packaging path by building `@zonease/aiworker-cli` and
   checking the copied CSS under `apps/cli/dist/web/{fleet,worker}` contains the
   same representative utilities.

## Risks

- Explicitly scanning all of `apps/web/src` can generate utilities used by the
  other view in each bundle, increasing CSS size. The current shared stylesheet
  is imported by both entrypoints, so this is acceptable for the immediate bug;
  if size becomes an issue, split bundle-specific stylesheets later.
- The regression check must inspect selectors robustly without depending on
  hashed CSS filenames.
- Existing bundle size baselines may need review after this bug fix because the
  corrected CSS is expected to be larger than the broken 6 KB output.

## Scope

Expected implementation files:

- `apps/web/src/shared/styles/globals.css`
- `scripts/web-quality.ts`
- `apps/web/package.json`

Expected verification:

- `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-web' build`
- `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-web' check:css-utilities`
- `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' build`
- selector checks against `apps/cli/dist/web/{fleet,worker}/assets/*.css`

## Alternatives

1. Use `@import 'tailwindcss' source('../..')` instead of `@source '../..'`.
   This is similarly valid, but `@source` keeps the existing import line stable
   and documents that the extra scan path is compensating for the multi-root
   build layout.
2. Register only `../../fleet`, `../../worker`, and `../../shared` per bundle.
   That would require bundle-specific stylesheets or build-time CSS branching,
   which is more invasive than this bug fix needs.
3. Safelist a small set of utilities with `@source inline(...)`. That would
   hide the current smoke failure but would not restore full application styling.

## Annotations

- 2026-04-28 19:10 Completed. Web fleet and worker builds now emit 38320-byte
  CSS bundles with the representative Tailwind utilities, and the CLI build
  copies the same CSS assets into `apps/cli/dist/web/{fleet,worker}`.
