# Worker Web build chunk reduction design

## Decision

Fix the Vite chunk-size warning by reducing the actual initial JavaScript
surface. Do not raise `chunkSizeWarningLimit`.

## Shape

Worker Web keeps one Host-served SPA entry, but conditional surfaces become lazy
runtime chunks:

- the HR specialized workbench loads through `React.lazy`;
- the markdown preview stack loads through a nested lazy import only when an
  artifact preview is rendered;
- Web imports workbench catalog data through a lightweight shared subpath rather
  than the `@zonease/aiworker-shared` top-level barrel.

The package subpaths are intentionally narrow:

- `@zonease/aiworker-shared/soul-workbench-catalog` exports workbench descriptor
  data and lookup helpers without importing zod/yaml-heavy schema modules;
- `@zonease/aiworker-component/markdown-preview` exports only the markdown
  preview component for dynamic import.

## Success Criteria

- Web build emits multiple JavaScript chunks and no chunk-size warning at the
  default Vite threshold.
- HR workbench and artifact markdown preview remain visible in tests and browser
  smoke.
- No product behavior is hidden behind a configuration-only warning limit.
