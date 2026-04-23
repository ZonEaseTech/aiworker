# Integration Reference

How to embed D2 diagrams in docs, READMEs, websites, and CI pipelines.

---

## Approaches

| Approach | Pros | Cons |
|---|---|---|
| **Checked-in SVG** (rendered once, committed) | Zero runtime deps; renders anywhere (GitHub, browsers, PDFs) | Must regenerate on every source change; diff noise |
| **Build-time render** (rendered in CI/docs build) | Source-of-truth is `.d2`; no stale SVGs; clean PR diffs | Build pipeline must have `d2` installed |
| **Live render** (d2 inside the app) | Interactive, no pre-rendering | Requires JS bundling of `d2-wasm`; heavy |

Pick by the dominant viewer:

- **GitHub README** → checked-in SVG.
- **Docusaurus / Nextra / MDX docs** → build-time render.
- **In-app diagrams** → ReactFlow instead (`pma-draw`), not D2.

---

## GitHub README (checked-in SVG)

1. Commit the `.d2` source under `docs/architecture/`.
2. Render once: `d2 docs/architecture/system.d2 docs/architecture/system.svg`.
3. Commit the SVG.
4. Embed in `README.md`:

   ```markdown
   ![System architecture](docs/architecture/system.svg)
   ```

GitHub renders SVGs inline. For dark-mode support:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture/system-dark.svg">
  <img src="docs/architecture/system.svg" alt="System architecture">
</picture>
```

Render light + dark:

```sh
d2 --theme 0 docs/architecture/system.d2 docs/architecture/system.svg
d2 --theme 200 docs/architecture/system.d2 docs/architecture/system-dark.svg
```

### Pre-commit hook

Regenerate SVGs when `.d2` files change. In `.pre-commit-config.yaml`:

```yaml
- repo: local
  hooks:
    - id: d2-render
      name: Render D2 diagrams
      entry: bash -c 'for f in docs/architecture/*.d2; do d2 "$f" "${f%.d2}.svg"; done'
      language: system
      files: '\.d2$'
      pass_filenames: false
```

---

## Docusaurus

Option A — **MDX with build-time render plugin**:

```sh
npm install docusaurus-plugin-d2
```

`docusaurus.config.js`:

```js
module.exports = {
  plugins: [
    ['docusaurus-plugin-d2', {
      layoutEngine: 'elk',
      theme: 0,
      darkTheme: 200,
    }],
  ],
};
```

Then in an `.mdx` file:

````mdx
```d2
direction: right
web -> api -> db
```
````

The plugin renders each D2 code block at build time and inlines the SVG.

Option B — **Checked-in SVG**:

```mdx
import system from '@site/static/img/architecture/system.svg';

<img src={system} alt="System" />
```

Simpler but requires manual regeneration.

---

## Nextra / Next.js

Nextra 3 supports MDX with custom code block handling.

`mdx-components.tsx`:

```tsx
import { renderD2 } from './lib/d2';

export function useMDXComponents(components) {
  return {
    ...components,
    pre: ({ children, ...props }) => {
      const codeProps = children?.props;
      if (codeProps?.className === 'language-d2') {
        return <div dangerouslySetInnerHTML={{ __html: renderD2(codeProps.children) }} />;
      }
      return <pre {...props}>{children}</pre>;
    },
  };
}
```

`lib/d2.ts` can shell out to the `d2` CLI at build time (via `next.config.js` + a build script) or use `@terrastruct/d2` WASM.

---

## Astro / SvelteKit / Remix

All support Markdown/MDX with custom renderers. Pattern is identical:

1. Detect `d2` code fences.
2. Shell out to `d2` binary at build time.
3. Inline the SVG.

An alternative: precompile D2 sources to SVGs in a separate pipeline step, commit them, and embed as static assets.

---

## WASM (live render in browser)

D2 ships a WASM build for in-browser rendering:

```sh
npm install @terrastruct/d2-wasm
```

```ts
import { D2 } from '@terrastruct/d2-wasm';

const d2 = new D2();
const svg = await d2.compile('web -> api -> db');
document.getElementById('chart').innerHTML = svg;
```

Trade-offs:
- Bundle size: WASM + wasm-pack runtime adds ~3 MB.
- Performance: acceptable for small diagrams; slow on large graphs.
- Use case: interactive playgrounds, docs where diagrams change based on user selection.

For most docs, build-time rendering is cheaper and faster.

---

## Obsidian / Notion / VS Code

- **Obsidian** — plugin `obsidian-d2` renders `d2` code blocks in the preview pane.
- **Notion** — no native support; export SVG and embed as image.
- **VS Code** — `terrastruct.d2` extension gives syntax highlighting + preview pane (`Cmd+Shift+V`).

---

## CI pipelines

### GitHub Actions

```yaml
name: Render D2 diagrams
on:
  push:
    paths:
      - 'docs/architecture/*.d2'

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install d2
        run: curl -fsSL https://d2lang.com/install.sh | sh -s --
      - name: Render
        run: |
          for f in docs/architecture/*.d2; do
            d2 "$f" "${f%.d2}.svg"
            d2 --theme=200 "$f" "${f%.d2}-dark.svg"
          done
      - name: Commit rendered SVGs
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: 'chore: rerender D2 diagrams'
```

### GitLab CI

```yaml
render:d2:
  image: terrastruct/d2
  script:
    - for f in docs/architecture/*.d2; do d2 "$f" "${f%.d2}.svg"; done
  artifacts:
    paths:
      - docs/architecture/*.svg
```

### Docker

```dockerfile
FROM terrastruct/d2 AS renderer
COPY docs/architecture /d2
RUN for f in /d2/*.d2; do d2 "$f" "${f%.d2}.svg"; done

FROM nginx:alpine
COPY --from=renderer /d2/*.svg /usr/share/nginx/html/diagrams/
```

---

## Confluence / Google Docs / Slack

These platforms don't support D2 natively. Workflow:

1. Render to SVG or PNG locally.
2. Drag-and-drop / upload into the platform.
3. Keep the `.d2` source in git; note its path in the page so future edits find the source.

Never re-draw a D2 diagram in the native tool — you'll duplicate truth and drift.

---

## Project convention

Standard layout for a project that uses D2:

```
docs/
  architecture/
    system.d2           # checked in
    system.svg          # committed (if using checked-in SVG flow)
    system-dark.svg
    deployment.d2
    deployment.svg
  sequences/
    oauth.d2
    oauth.svg
  erd/
    core-schema.d2
    core-schema.svg
  shared/
    styles.d2           # imported via ...@shared/styles.d2
    icons.d2
```

Top-level `shared/styles.d2`:

```d2
vars: {
  d2-config: {
    theme-id: 0
    dark-theme-id: 200
    layout-engine: elk
    pad: 80
  }
  color: {
    frontend: "#eff6ff"
    backend: "#ecfdf5"
    database: "#f5f3ff"
  }
}

classes: {
  frontend: {style: {fill: ${color.frontend}; stroke: "#3b82f6"}}
  backend:  {style: {fill: ${color.backend};  stroke: "#10b981"}}
  db:       {shape: cylinder; style: {fill: ${color.database}; stroke: "#8b5cf6"}}
}
```

Every diagram starts with:

```d2
...@../shared/styles.d2

direction: right
# …the diagram
```

Change one file → every diagram retints. This is the core payoff of text-based diagrams.

---

## Anti-patterns

- **Committing `.svg` without the `.d2` source** — loses editability; treat the source as canonical.
- **Re-drawing D2 diagrams in Excalidraw** for a specific doc — duplicate truth.
- **Live WASM rendering for a static docs site** — adds MB of JS; precompile.
- **Per-doc theme customization** — drift; use a shared styles file.
- **No CI render** — PRs ship stale SVGs; the diagram diverges from the source.
