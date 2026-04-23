# Containers Reference

A container is a shape that has children. In D2 every map that declares nested shapes becomes a container — there's no separate "group" keyword. This is D2's most distinctive feature: structure is expressed by nesting, not by drawing boxes.

---

## Basic nesting

```d2
aws: {
  api
  db.shape: cylinder
  api -> db
}
```

Renders as a bordered region labeled "aws" containing `api` and `db`, with an internal `api -> db` arrow.

Give the container a label and ID separately:

```d2
aws: AWS us-west-2 {
  api
  db.shape: cylinder
}
```

---

## Dotted paths

Access a child by dotted path, even across levels.

```d2
aws.api -> aws.db
aws.api.style.fill: "#ecfdf5"

apartment.bedroom.bathroom -> office.spare_room.bathroom: Portal
```

Dotted paths work as both left-hand (declaration) and right-hand (reference) sides.

---

## Inline declaration (shorthand)

Declare a container and child on the same line:

```d2
aws.api: API Gateway
aws.api.shape: rectangle
aws.db.shape: cylinder
```

Equivalent to:

```d2
aws: {
  api: API Gateway
  db.shape: cylinder
}
```

Use the inline form for sparse trees (1–2 children per container), the map form when a container has 3+ children.

---

## `_` — parent reference

Inside a container, `_` refers to the parent. Use it to reach outward.

```d2
christmas: {
  presents
}
birthdays: {
  presents
  _.christmas.presents -> presents: regift
  _.christmas.style.fill: "#ACE1AF"
}
```

`_._` reaches the grandparent. `_` at the root is a no-op (already at root).

Prefer outer-level edges when both endpoints sit outside the same container — `_` is for when you want to keep the edge declaration near the child that owns it.

---

## Containers can be connected

A container itself is a shape and can participate in edges:

```d2
users -> clouds.aws.load_balancer
ci.deploys -> clouds          # edge to the whole cloud group
```

Connecting to a container is useful when the inner detail is intentionally hidden at this zoom level.

---

## Direction per container

Override the layout direction for a specific container:

```d2
direction: down

orchestration: {
  direction: right
  queue -> worker -> db
}
```

Different directions per container require the tala or elk layout engine; dagre flattens them. See `layouts.md`.

---

## When to use a container

Use a container when:

- Nodes belong to one logical boundary (service, bounded context, cloud account, namespace).
- A group label is meaningful to the reader ("the AWS side", "Auth service").
- Styling applies to the whole group (fill, border style).
- A connection to/from the group makes sense at the current zoom level.

Don't use a container when:

- You only want visual decoration without a semantic group — use a class for background styling instead.
- One node "logically belongs" to two groups — pick the primary container, link from the other.
- The group has exactly one child — flatten.

---

## When to flatten

If every container holds exactly one node or the nesting is ≥ 3 levels deep with little structural meaning, flatten. A flat graph with classes often reads better than a deeply-nested one that looks like a file browser.

Good:

```d2
web -> api -> db
```

Bad:

```d2
system: {
  layer: {
    service: {
      web
    }
  }
}
```

Unless those three container levels mean something specific (zone > cluster > pod, say), the flat form communicates the same thing with less noise.

---

## Container styling

Containers accept the full `style:` catalog. Common combinations:

```d2
aws: AWS {
  style: {
    fill: "#fff7ed"
    stroke: "#f97316"
    stroke-dash: 3
    border-radius: 8
  }
  api
  db.shape: cylinder
}
```

- `fill` — group background wash; keep values pale (7–10% saturation) so child shapes remain legible.
- `stroke-dash` — a dashed border signals a logical group rather than a physical one (e.g., a "bounded context").
- `border-radius` — softer groups read as looser associations.
- `fill-pattern: dots | lines | grid | ...` — useful to distinguish multiple containers without piling on colors. Requires D2 ≥ 0.6.

---

## Glob styling for every container at a level

```d2
**.style.border-radius: 6
```

`**` matches every shape at any depth. Apply global defaults at the top of the file; override per-container afterwards.

---

## Label placement on containers

```d2
aws: AWS {
  label.near: top-center      # default is top-center on containers
  # Other options: top-left | top-right | bottom-center | outside-top-* | ...
}
```

For a container used primarily as a visual frame (e.g., "Production region"), move the label to `outside-top-left` so internal nodes get full real estate.

---

## Container as a folder — multi-file composition

Large diagrams can split containers into separate files and compose them via imports:

```d2
# main.d2
users -> @aws
users -> @gcp

# aws.d2
api
db.shape: cylinder
api -> db
```

The import becomes the container's contents. See `composition.md` for `@file` and `...@file` spread.

---

## Anti-patterns

1. **Container with one child** — flatten.
2. **Container used only for a color background** — use a class or a `style.fill` + `style.stroke: none` rectangle instead.
3. **Containers nested > 3 deep** without distinct meaning at each level — readers get lost.
4. **Same node referenced from many containers via `_`** — the node probably belongs at the outer level; move it there.
5. **Styling each child individually when the whole container should share** — use a glob (`container.*.style.fill: ...`) or a class.
