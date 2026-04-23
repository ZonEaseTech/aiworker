# Layouts Reference

D2 chooses where to put nodes; you choose only *direction*, *grouping*, and sometimes a *grid*. This file covers the dials you actually touch and the engine tradeoffs behind them.

---

## Direction

Set once at the root; overridable per container.

```d2
direction: down         # top-down flow (default on many templates)
# direction: right      # left-to-right (idiomatic for architecture / pipeline)
# direction: up         # bottom-up (rare; e.g., dependency stacks)
# direction: left       # right-to-left (very rare)

web -> api -> db
```

Pick once, up front — it's the biggest lever on readability.

| Direction | Best for |
|---|---|
| `right` | Architecture, request flow, pipelines (reads left→right like text) |
| `down` | Org charts, trees, decision flows (reads top→bottom) |
| `up` | Dependency stacks ("built on top of…") |
| `left` | Right-to-left reading order / reversed pipelines |

### Per-container direction

Different engines handle mixed directions differently.

```d2
direction: down

orchestration: {
  direction: right
  queue -> worker -> db
}
```

- **dagre** (default): flattens child direction to match root. Mixed directions are effectively ignored.
- **elk**: honors child direction; you get the "L-shape" inner layout.
- **tala**: honors child direction and optimizes routing around it.

If mixed-direction is important, switch engine (`layout-engine: elk`).

---

## Grid layouts

Lay out children on an explicit grid inside a container — orthogonal to the layout engine.

```d2
k8s_cluster: Cluster {
  grid-rows: 3
  grid-columns: 4
  grid-gap: 20            # spacing between cells, px
  # optional: horizontal-gap / vertical-gap for asymmetric spacing

  pod-a
  pod-b
  pod-c
  # …up to 12 cells
}
```

Rules:

- Specify **one** of `grid-rows` / `grid-columns` (the engine derives the other) or both (fixed grid).
- Children are placed in declaration order.
- Connections between grid cells render as usual — useful for matrix layouts where the *positions* are meaningful.
- Grid containers ignore the layout engine's internal routing for their children.

Use grid for:
- k8s node/pod matrices
- Comparison tables (rows = axes, columns = options)
- Regular array layouts where semantic position matters

---

## Layout engines

Set once at the top:

```d2
vars: {
  d2-config: {
    layout-engine: dagre      # dagre | elk | tala
  }
}
```

| Engine | License | Strengths | Weaknesses |
|---|---|---|---|
| **dagre** | MIT, bundled | Fast, predictable DAG layouts, no install | Flattens per-container direction; limited orthogonal routing; cramped on dense graphs |
| **elk** | EPL, bundled since v0.7 | Hierarchical layouts shine; orthogonal edges; respects per-container direction | Slower on large graphs; occasional long edges |
| **tala** | Proprietary, separate binary | Best-in-class density, crossings, label placement, compound routing | Paid; must be installed separately (`d2 --layout=tala` after install) |

### Choosing

- **Small-to-medium architecture, flat or shallow nesting** → `dagre`.
- **Deep nested containers, multiple per-container directions** → `elk`.
- **Dense diagrams (~50+ nodes, many crossings), client will pay for polish** → `tala`.

Tell the user in the file header if non-default:

```d2
# Requires: d2 + tala (paid) — install: https://d2lang.com/tour/tala
vars: {
  d2-config.layout-engine: tala
}
```

---

## Label positioning with `near:`

Shapes can be pinned "near" a constant position — effectively a floating label layer.

```d2
title: A winning strategy {
  shape: text
  near: top-center            # position on the canvas
  style: {
    font-size: 32
    bold: true
  }
}

legend: {
  near: bottom-right
  # …legend body
}
```

Values for `near`:

- `top-left`, `top-center`, `top-right`
- `center-left`, `center-right`
- `bottom-left`, `bottom-center`, `bottom-right`

Common uses:

- Diagram title (`near: top-center`).
- Legend box pinned to a corner.
- "Caption" `text` shape `near: bottom-center`.

The engine will not route edges through pinned-near shapes — they live on a floating layer.

---

## Label placement with `label.near:` (on containers / shapes)

Different from `near:` — this is the label's position *relative to its own shape*.

```d2
aws: AWS {
  label.near: outside-top-left
  # …children
}
```

Values: `top-left | top-center | top-right | center-left | center-right | bottom-left | bottom-center | bottom-right | outside-top-left | outside-top-center | outside-top-right | outside-bottom-left | outside-bottom-center | outside-bottom-right`.

`outside-*` is useful for containers whose interior should be fully readable — the label floats just above the frame.

---

## Size control — `width`, `height`

```d2
big_node: Aggregator {
  width: 260
  height: 140
}
```

- Values are pixels.
- The layout engine still places the node; you only fix its size.
- Use sparingly — D2 sizes by label length by default, which usually looks fine.

Common case: a callout / note shape that needs to feel prominent.

---

## Spacing knobs (per diagram)

There's no global `node-spacing` in D2 syntax (as of 0.7). Spacing is driven by:

- The chosen layout engine.
- `grid-gap` / `horizontal-gap` / `vertical-gap` for grid containers.
- Container nesting (containers force extra padding).

If a diagram feels cramped:
1. Shorten labels.
2. Flatten one level of nesting.
3. Switch engine to `elk` or `tala`.
4. Break into multiple `layers:` (see `composition.md`).

---

## Pad & center (global canvas)

```d2
vars: {
  d2-config: {
    pad: 100             # px of padding around entire diagram
    center: true          # center the diagram in the viewport
  }
}
```

Useful when the rendered SVG embeds in a doc with a background color that contrasts poorly with a flush-left diagram.

---

## Layout recipes

### Architecture (left → right, grouped)

```d2
direction: right
vars.d2-config.layout-engine: elk

classes: {
  service: { style.fill: "#ecfdf5"; style.stroke: "#10b981" }
  db: { shape: cylinder; style.fill: "#f5f3ff"; style.stroke: "#8b5cf6" }
}

user.shape: person

frontend: {
  web.class: service
}

backend: {
  api.class: service
  worker.class: service
}

data: {
  primary.class: db
  cache.shape: stored_data
}

user -> frontend.web -> backend.api
backend.api -> data.primary
backend.api -> data.cache
backend.api -> backend.worker
```

### Decision flow (top → bottom)

```d2
direction: down

start.shape: circle
decide.shape: diamond
path_a.shape: rectangle
path_b.shape: rectangle
end.shape: oval

start -> decide
decide -> path_a: yes
decide -> path_b: no
path_a -> end
path_b -> end
```

### Grid matrix (k8s cluster)

```d2
direction: right

cluster: Production Cluster {
  grid-rows: 3
  grid-columns: 4
  grid-gap: 16

  node1: { label: "node-01\n4 vCPU / 16Gi" }
  node2: { label: "node-02\n4 vCPU / 16Gi" }
  node3: { label: "node-03\n8 vCPU / 32Gi" }
  # …
}
```

---

## Anti-patterns

- **Forcing direction per-container under dagre** — it's ignored; either switch to elk or flatten.
- **Global `width` / `height` on every node** — fights the layout; pick one "big" shape and let D2 size the rest.
- **Using a grid when you actually want a list** — if position isn't meaningful, the grid forces awkward empty cells.
- **`near: top-center` on multiple shapes** — they stack awkwardly; use one title plus inline `label` elsewhere.
- **Swapping engines mid-diagram** — impossible, but users sometimes try via two `vars.d2-config.layout-engine` blocks. Only the last one wins.
