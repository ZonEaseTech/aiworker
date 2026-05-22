# HR Mounted Layout Scoped CSS Design

## Goal

Restore the HR Soul App three-column reading-room layout when it is mounted
through Host Web via `@micro-zoe/micro-app`.

The fix must keep HR layout ownership inside `apps/aiworker-hr`. Host Web remains
a generic micro-app mount container and must not learn HR-specific profile,
reading-room, or composer semantics.

## Context

The regression appears after the HR workbench moved to an app-owned
`micro-app` mounted route. The rendered HR surface still contains the expected
three children and the current React markup still emits:

```text
grid-cols-1 xl:grid-cols-[minmax(12rem,0.55fr)_minmax(0,1.85fr)_minmax(15rem,0.72fr)]
```

Initial suspicion was that the child app might not see the real viewport.
Documentation and source review showed that is not the primary issue:

- AIWorker starts micro-app with `iframe: false`, `disable-sandbox: false`, and
  `disable-scopecss: false`.
- micro-app with sandbox falls back to the base app `rawWindow` for properties
  that are not defined on the sandbox target.
- A local 1600px browser measurement showed `matchMedia('(min-width: 80rem)')`
  is true inside the mounted page, but the HR surface computed
  `grid-template-columns` remains one column.
- The scoped CSSOM includes `xl:grid-cols-1` after micro-app processing, but the
  Tailwind arbitrary `xl:grid-cols-[minmax(...)]` rules are missing after scoped
  CSS rewriting.

Therefore the fix should not disable micro-app or move layout decisions into
Host. It should remove the fragile arbitrary Tailwind selector from the mounted
layout contract.

Relevant sources:

- micro-app base element and runtime docs:
  <https://jd-opensource.github.io/micro-app/docs.html#/zh-cn/start>
- micro-app sandbox docs:
  <https://raw.githubusercontent.com/jd-opensource/micro-app/master/docs/zh-cn/sandbox.md>
- micro-app scoped CSS docs:
  <https://raw.githubusercontent.com/jd-opensource/micro-app/master/docs/zh-cn/scopecss.md>
- micro-app source, with sandbox proxy:
  <https://github.com/jd-opensource/micro-app/blob/master/src/sandbox/with/window.ts>
- micro-app source, mounted container clone:
  <https://github.com/jd-opensource/micro-app/blob/master/src/create_app.ts>

## Architecture

HR owns the reading-room grid. Host owns only the mount shell.

`apps/web/src/worker/worker-studio.tsx` should keep rendering the generic
`<micro-app>` element, passing only narrow mount data. It should not add
HR-specific layout classes, profile-specific container logic, or alternate
renderers.

`apps/aiworker-hr/product/web/people-workbench/app.tsx` should keep the existing
semantic data attributes:

- `data-layout="reading-room-primary"`
- `data-left-panel="open|closed"`
- `data-right-panel="open|closed"`

The React class list should keep only stable base layout utilities such as
`grid`, `grid-cols-1`, `h-full`, `min-h-0`, and visual token classes. It should
stop relying on `xl:grid-cols-[...]` arbitrary classes for the production
mounted layout.

## Components

### HR Workbench React

`HrPeopleWorkbenchApp` should expose a stable CSS hook, preferably an app-owned
class such as `hr-reading-room-grid`, while preserving the existing data
attributes that describe panel state.

The component should not calculate column widths in JavaScript and should not
read `window.innerWidth`. Layout stays declarative CSS.

### HR App-Owned CSS

`apps/aiworker-hr/product/web/styles.css` should define the three-column rules
with ordinary selectors inside an app-owned layer. The selector should target
the HR reading-room surface by class and data attributes.

Default layout remains one column. At desktop viewport width:

```css
@media (min-width: 80rem) {
  .hr-reading-room-grid[data-left-panel="open"][data-right-panel="open"] {
    grid-template-columns:
      minmax(12rem, 0.55fr)
      minmax(0, 1.85fr)
      minmax(15rem, 0.72fr);
  }

  .hr-reading-room-grid[data-left-panel="open"][data-right-panel="closed"] {
    grid-template-columns: minmax(12rem, 0.55fr) minmax(0, 1.85fr);
  }

  .hr-reading-room-grid[data-left-panel="closed"][data-right-panel="open"] {
    grid-template-columns: minmax(0, 1.85fr) minmax(15rem, 0.72fr);
  }

  .hr-reading-room-grid[data-left-panel="closed"][data-right-panel="closed"] {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

Column separators can also move from `xl:border-l/r` utilities to ordinary
app-owned CSS if verification shows scoped CSS has the same fragility there.
The primary acceptance target is the grid column count.

## Data Flow

No protocol or API changes are required.

Host continues to resolve the HR route through:

```text
Host Web -> /api/local/apps/aiworker-hr/surfaces/hr-home
  -> <micro-app name="aiworker-hr--hr-home" ...>
  -> HR mounted service /micro-app/routes/hr-home
```

Host mount data remains limited to app id, surface id, theme, worker id,
workspace id, session id, and related mount context. HR still loads workbench
data through its app-owned mounted API paths.

## Error Handling

The runtime error behavior does not change.

If CSS fails to load or micro-app scoped CSS drops a rule, the workbench falls
back to the default one-column layout. This should be treated as a visual
regression caught by tests and smoke validation, not as a new user-facing domain
error.

## Testing

Tests should move from string presence to behavior:

1. HR component/static tests should assert the stable layout hook and semantic
   data attributes, not the old arbitrary Tailwind class string.
2. HR mounted service tests should prove the HTML still loads app-owned
   `styles.css` and serves the real reading-room surface.
3. A browser or mounted-surface smoke should measure computed layout in Host
   mounted mode:
   - desktop viewport such as 1600px: `grid-template-columns` should contain
     three tracks when both panels are open;
   - narrow viewport: it should remain one track.

Focused verification should include:

- `bun run --filter '@zonease/aiworker-hr' test`
- the focused Worker Web mounted-surface smoke or equivalent computed-layout
  script
- `bun run ui:check`
- code-review-graph update/review after code changes

## Scope

In scope:

- HR app-owned React class cleanup for the reading-room grid.
- HR app-owned CSS for mounted-safe three-column layout.
- Focused tests that catch scoped CSS/layout regressions.

Out of scope:

- Disabling micro-app scoped CSS.
- Moving HR layout rules into Host Web.
- Changing Host/Soul manifest, protocol, or mounted API data contracts.
- Reworking HR profile, draft, review, or session data behavior.
