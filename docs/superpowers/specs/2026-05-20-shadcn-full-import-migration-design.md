# Shadcn Full Import Migration Design

## Goal

Make `packages/ui` the shadcn-first component source for AIWorker, then migrate `apps/web` and Soul App web surfaces to consume shadcn components directly from `@zonease/aiworker-ui`.

## Decisions

- Use the official shadcn CLI path. Full shared UI package maintenance runs with `bunx --bun shadcn@latest add --all -c packages/ui -y`, using `packages/ui/components.json` to keep generated components, hooks and libs inside `packages/ui`.
- Use app workspace shadcn config for app-local blocks or compositions. `apps/web/components.json` still resolves `ui` to `@zonease/aiworker-ui/components` so app code imports shared primitives instead of owning generated UI files.
- Fully import the shadcn component set into `packages/ui` up front. Current usage does not decide whether a component belongs in the UI package.
- Do not adapt `packages/component` to wrap shadcn. It remains a reference map for current UI needs and for business shell patterns that are not yet migrated.
- App code migrates directly from local raw elements or `@zonease/aiworker-component` primitives to `@zonease/aiworker-ui/components/*`.
- Migrate one visible component family at a time and verify after each slice against `localhost:5173`.

## First Slice

1. Full import shadcn registry components into `packages/ui`.
2. Migrate visible Host Web button actions in settings and creation dialogs to `@zonease/aiworker-ui/components/button`.
3. Migrate create-worker/create-workspace dialogs to direct shadcn `Dialog`, `Field`, `Input`, `Select` and `Button` usage.
4. Keep component-owned shell patterns in place until their owning page is migrated.

## Verification

- `bunx --bun shadcn@latest info -c apps/web --json`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
- `bun run --filter '@zonease/aiworker-ui' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
- Browser check on the user-running `http://localhost:5173/`
- `bun run ui:check` after app-local style/component changes
