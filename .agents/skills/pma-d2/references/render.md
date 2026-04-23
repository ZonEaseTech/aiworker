# Render Reference

What to tell the user so they can turn `.d2` source into pixels. This skill never runs the renderer — but it must hand over the right command.

---

## Install D2

Cross-platform install options:

```sh
# macOS (Homebrew)
brew install d2

# Linux / macOS (official install script)
curl -fsSL https://d2lang.com/install.sh | sh -s --

# Go
go install oss.terrastruct.com/d2@latest

# Docker
docker pull terrastruct/d2
docker run --rm -v "$(pwd)":/d2 terrastruct/d2 input.d2 output.svg

# Windows
scoop install d2
# or via the install script under WSL
```

Verify: `d2 --version`.

---

## Basic render

```sh
d2 input.d2                    # writes input.svg alongside input.d2
d2 input.d2 output.svg         # explicit output path
d2 input.d2 output.png         # PNG — requires Chromium (auto-downloaded)
d2 input.d2 output.pdf         # PDF
d2 input.d2 output.gif         # GIF (requires steps:)
```

Output format is inferred from the output file extension.

---

## CLI flag cheat sheet

| Flag | Meaning |
|---|---|
| `--theme ID` | Light theme ID (default 0) |
| `--dark-theme ID` | Dark theme ID (pairs with `--theme` for auto light/dark) |
| `--layout ENGINE` | `dagre` (default) / `elk` / `tala` |
| `--sketch` | Hand-drawn look |
| `--pad N` | Canvas padding in px (default 100) |
| `--center` | Center diagram in viewport |
| `--watch` | Live-reload browser preview on file change |
| `--host HOST`, `--port N` | Watch-mode server binding (default localhost:0) |
| `--bundle` | Inline remote assets (icons) into the SVG |
| `--scale N` | Render scale (for PNG) |
| `--animate-interval MS` | GIF frame interval (for `steps:` diagrams) |
| `--dry-run` | Parse-check without emitting output |
| `--var KEY=VAL` | Override a `vars.*` entry at render time |
| `--timeout SEC` | Render timeout |
| `--target NAME` | Render a specific layer / scenario / step |
| `--stdout-format FMT` | Write SVG / text to stdout instead of a file |

Run `d2 --help` for the full list; the flags above cover ~95% of usage.

---

## Watch mode

Best for iteration:

```sh
d2 --watch architecture.d2
# opens http://localhost:<random> in a browser; re-renders on save
```

Stops on Ctrl+C. Watch mode also runs a self-contained web server with click-through navigation for `layers:` / `scenarios:` / `steps:` diagrams.

---

## Themes

D2 ships with a gallery of numbered themes.

### Light themes (by ID)

| ID | Name | Vibe |
|---|---|---|
| 0 | Neutral default | Clean, professional |
| 1 | Neutral gray | Understated |
| 3 | Flagship terrastruct | Signature bluish |
| 4 | Cool classics | Muted cool palette |
| 5 | Mixed berry blue | Blue-forward |
| 6 | Grape soda | Pink/purple pop |
| 7 | Aubergine | Warm purple |
| 8 | Colorblind clear | Accessible palette |
| 100 | Shallow sea | Teal accent |
| 101 | Dark mauve | Dusky |
| 102 | Dark flagship | Bold accent |

### Dark themes

| ID | Name |
|---|---|
| 200 | Dark mauve |
| 201 | Dark flagship |

Pair a light + dark theme:

```sh
d2 --theme 0 --dark-theme 200 input.d2 output.svg
```

The output SVG embeds both palettes and switches with the user's OS theme (when embedded in HTML that respects `prefers-color-scheme`).

Set in-file via `vars.d2-config.theme-id` and `vars.d2-config.dark-theme-id` — CLI flags override.

---

## Sketch mode

```sh
d2 --sketch input.d2 output.svg
```

Or in-file:

```d2
vars.d2-config.sketch: true
```

Renders a hand-drawn look. Good for brainstorming / whiteboard-style diagrams; step back to crisp rendering for production docs.

---

## Layout engines

```sh
d2 --layout=elk input.d2
d2 --layout=tala input.d2    # requires paid install
```

See `layouts.md` for when to pick each. `tala` must be installed separately (https://terrastruct.com/tala).

---

## Animated GIFs from `steps:`

```d2
# lifecycle.d2
steps: {
  s1: { client -> api }
  s2: { api -> db }
  s3: { api -> client }
}
```

```sh
d2 --animate-interval=1500 lifecycle.d2 lifecycle.gif
```

- `--animate-interval` is milliseconds per frame.
- 1000–2000ms is typical; too fast = unreadable, too slow = tedious.

Same works for `scenarios:` to produce a walk-through GIF across scenarios.

---

## Rendering multi-board diagrams

`layers:` / `scenarios:` / `steps:` produce multi-board output:

```sh
d2 main.d2 main.svg           # renders all boards with a navigator
d2 --target='root.*.deployment' main.d2 deployment.svg
```

`--target` accepts a board path; wildcards supported.

---

## Bundling remote assets

If the diagram references icons by URL:

```d2
github.icon: https://icons.terrastruct.com/dev/github.svg
```

Render with inlined icons:

```sh
d2 --bundle input.d2 output.svg
```

Without `--bundle`, the SVG references the icons remotely — broken on offline viewing.

---

## Icon catalogs

| Source | URL | Notes |
|---|---|---|
| Terrastruct (official) | https://icons.terrastruct.com/ | AWS / GCP / Azure / K8s / dev / tech |
| SVG Repo | https://www.svgrepo.com/ | Permissively licensed SVGs |
| Simple Icons | https://simpleicons.org/ | Brand icons |
| Material Icons | Material symbols | Permissive, universal |

Usage:

```d2
aws_lambda.icon: https://icons.terrastruct.com/aws/Compute/AWS-Lambda_light-bg.svg
```

Local icons:

```d2
logo.icon: ./assets/logo.svg      # bundled with --bundle
```

---

## Playground (no install required)

- https://play.d2lang.com/ — paste `.d2` source, live render, shareable URL.
- https://terrastruct.com/d2 — official landing, links to tour and docs.

Useful for quick sanity checks and for users who won't install D2 locally.

---

## Size tips

- **Large diagrams feel slow in watch mode** — split into `layers:` or `@file` imports; render each separately.
- **PNG outputs look blurry** — use `--scale 2` or `--scale 4` for 2×/4× raster.
- **Files grow past 500 lines** — split by imports; a 2000-line `.d2` file is a red flag.

---

## Error output

D2 errors appear on stderr with file:line context:

```
err: identifier "databse" unknown
  --> input.d2:14:3
```

Pipe through `less` for large files:

```sh
d2 input.d2 2>&1 | less
```

But remember: most D2 "errors" are silent shape/style fallbacks — not stderr messages. Always validate visually.
