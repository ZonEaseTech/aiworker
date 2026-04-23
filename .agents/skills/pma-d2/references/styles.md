# Style Reference

Every supported `style.*` key with the values that matter. Styles apply to shapes, containers, and (with a few exceptions) connections.

All keys live under `style:` and can be written flat (`x.style.fill: red`) or grouped in a map.

---

## Colors — `fill`, `stroke`

```d2
x.style.fill: "#f5f3ff"      # hex — quote if it contains #
y.style.fill: lavender       # CSS color name
z.style.fill: "linear-gradient(0deg, #10b981, #06b6d4)"    # gradient
```

- Every CSS color name works unquoted.
- Hex values **must** be quoted (the `#` otherwise starts a comment).
- Gradients take standard CSS gradient syntax.

For connections, `stroke` is the line color. For shapes, `stroke` is the border; for `sql_table` and `class`, `stroke` is actually the header-band color because their bodies are fixed-white.

---

## Borders — `stroke`, `stroke-width`, `stroke-dash`, `double-border`

```d2
x.style.stroke: "#334155"
x.style.stroke-width: 2       # pixels, default 2
x.style.stroke-dash: 4        # 0 = solid; typical values 2, 4, 6
x.style.double-border: true   # second border ring for emphasis
```

Use `stroke-dash` to encode "weak / async / deprecated". `double-border: true` is an accent — reserve for 1–2 nodes per diagram.

---

## Fill pattern — `fill-pattern`

```d2
aws.style.fill-pattern: dots
aws.style.fill: "#fff7ed"     # pattern needs a base fill to contrast
```

Values: `dots`, `lines`, `grid`, `paper`. Useful to distinguish multiple containers without relying on color. Falls back gracefully in older renderers.

---

## Shadow, 3D, multiple

```d2
x.style.shadow: true            # subtle drop shadow
x.style.3d: true                # 3-D extruded look for rectangles
x.style.multiple: true          # stacked appearance (instances, replicas)
```

- `shadow` adds weight without changing shape; good for "important" nodes.
- `3d` only works on `rectangle`, `square`, `hexagon`. Use for compute / VMs.
- `multiple` adds a back copy behind the shape — idiomatic for pods / workers / shards / replicas.

```d2
workers: Worker pool {
  shape: rectangle
  style.multiple: true
}
```

---

## Corners — `border-radius`

```d2
x.style.border-radius: 8      # rounded corners; 0 = sharp; 999 = pill
```

Shape-dependent: no effect on `cylinder`, `cloud`, etc.

---

## Opacity

```d2
legacy.style.opacity: 0.4
```

Values 0–1. Use for deprecated / future / backgrounded elements so they stay visible but secondary.

---

## Text — `font-size`, `bold`, `italic`, `underline`, `font-color`

```d2
title: {
  shape: text
  style: {
    font-size: 32
    bold: true
    font-color: "#0f172a"
  }
}
```

- `bold`, `italic`, `underline`: boolean. Default for shape labels is `bold: true`; set to `false` for normal weight.
- `font-size`: integer, unitless (px).
- `font-color` overrides the default label color (usually derived from `stroke` / theme).

On shapes, these style the label. On connections, they style the edge label.

---

## Animations — `animated`

```d2
kafka.style.animated: true                  # pulsing border on a shape
(producer -> kafka)[0].style.animated: true # marching ants on an edge
```

Animation is an SVG `<animate>` element — works in browsers, not in static PDF output. Use for event streams and the "hot path" in an incident diagram.

---

## Text wrap — `text-transform`

```d2
banner.style.text-transform: uppercase
```

Values: `uppercase`, `lowercase`, `capitalize`, `none`.

---

## Connection-specific notes

Connections share the catalog above but:

- `fill` on a connection styles the **label background**, not the line.
- `stroke-width` defaults to 2; raise for "data flow" emphasis.
- No `shadow`, `3d`, `multiple`, `border-radius`, `double-border`, `fill-pattern` — silently ignored.

---

## Label label-specific (`.label.near`, `.label.style`)

Labels are themselves stylable objects.

```d2
warehouse: Warehouse {
  label.near: outside-top-left
  label.style.font-size: 14
}
```

`label.near` values: `top-left | top-center | top-right | center-left | center-right | bottom-left | bottom-center | bottom-right | outside-top-left | outside-top-center | outside-top-right | outside-bottom-...`. For a full-bleed container with the label tucked outside, `outside-top-left` keeps the inside clean.

---

## Recommended palette

Consistent, colorblind-safe defaults that pair with both light and dark themes:

| Semantics | fill | stroke |
|---|---|---|
| Frontend | `#eff6ff` | `#3b82f6` |
| Backend | `#ecfdf5` | `#10b981` |
| Database | `#f5f3ff` | `#8b5cf6` |
| Cache | `#fef2f2` | `#ef4444` |
| Queue | `#fefce8` | `#eab308` |
| Orchestrator | `#ecfeff` | `#06b6d4` |
| External / cloud | `#f1f5f9` | `#64748b` |
| User | `#f0fdf4` | `#22c55e` |
| Error / failure | `#fee2e2` | `#dc2626` |
| Deprecated | any with `opacity: 0.4` | — |

Convert these into a class block (see `classes.md`) at the top of the file; the rest of the diagram stays palette-free.

---

## Style precedence (reminder)

1. Theme defaults (from `vars.d2-config.theme-id`).
2. Global globs (`**.style.fill: ...`).
3. Class applied by `.class:`.
4. Direct per-node / per-edge style.

Each layer can override the previous; the last write wins when there's a tie.

---

## Don'ts

- Don't set a gradient on a small shape — it reads as a gradient bug, not an intentional choice.
- Don't combine `animated` + `stroke-dash` on every edge; the diagram becomes seizure-inducing.
- Don't use `3d` for anything that isn't a compute / VM instance — it's load-bearing semantics.
- Don't invent keys (`style.color`, `style.thickness`) — D2 silently ignores unknown keys.
