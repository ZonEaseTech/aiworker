# Shape Catalog

Every built-in D2 shape, grouped by what it communicates. `shape:` is a property, not a keyword — a typo silently falls back to `rectangle`, so always match this catalog exactly.

All shapes accept: `label`, `icon`, `tooltip`, `link`, `near`, `width`, `height`, `class`, and any `style.*` key from `styles.md`.

---

## Generic

| Shape | ID | Use for |
|---|---|---|
| Rectangle | `rectangle` | Default — abstract box, generic component |
| Square | `square` | Component where the 1:1 aspect ratio matters (icons, modules) |
| Circle | `circle` | Start / end / event / generic token |
| Oval | `oval` | Actor in a flowchart, state in a state machine |
| Diamond | `diamond` | Decision / branching in a flowchart |
| Hexagon | `hexagon` | Pipeline stage, honeycomb layouts |
| Parallelogram | `parallelogram` | Input / output step in a flowchart |

```d2
start.shape: circle
decide.shape: diamond
load.shape: parallelogram
```

---

## System & data

| Shape | ID | Use for |
|---|---|---|
| Cylinder | `cylinder` | Database, storage volume, block device |
| Queue | `queue` | Message queue, event bus, stream |
| Page | `page` | Static document, report |
| Document | `document` | File, spec, markdown doc |
| Stored data | `stored_data` | Cache, key-value store — not relational DB |
| Package | `package` | Library, bundle, npm package |
| Cloud | `cloud` | External service, SaaS, internet |
| Step | `step` | Workflow stage, stage gate |
| Callout | `callout` | Annotation, footnote reference |

```d2
pg.shape: cylinder
pg.label: Postgres 16
events.shape: queue
events.label: Kafka
cache.shape: stored_data
cdn.shape: cloud
```

**`cylinder` vs `stored_data`** — use `cylinder` for relational / row-oriented databases and disk volumes, `stored_data` for caches, KV stores, object storage.

**`queue` vs generic `rectangle` with "queue" label** — the queue shape (an open-ended cylinder) is instantly recognizable; don't waste it.

---

## People

| Shape | ID | Use for |
|---|---|---|
| Person | `person` | Human user, operator, developer |

```d2
user.shape: person
user.label: Shopper
```

Use exactly one "person" per user role. Multiple people on a diagram should have distinct labels — `visitor`, `admin`, `operator`.

---

## Text & rich content

| Shape | ID | Use for |
|---|---|---|
| Text | `text` | Title, caption, legend — no border by default |
| Code | `code` | Code snippet (markdown fenced) |
| Class | `class` | UML class box with fields / methods (special syntax) |
| Sql table | `sql_table` | ERD table with typed columns (special syntax) |
| Image | `image` | Pure icon, no label — just the image |
| Sequence diagram | `sequence_diagram` | Container whose children are actors on a lifeline |

Class, sql_table, and sequence_diagram have dedicated syntax — see `special-diagrams.md`.

---

### `text` — titles, labels-as-shapes, freeform notes

```d2
title: A winning strategy {
  shape: text
  near: top-center
  style.font-size: 36
  style.bold: true
}
```

`text` has no border or fill by default. For a labeled block with rendered markdown content, use a normal rectangle with a `|md ... |` label instead.

---

### `code` — inline code snippet

```d2
handler: {
  shape: code
  language: go
  content: |go
    func Handle(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, "ok")
    }
  |
}
```

Use for "this is the exact snippet that does X" — evidence artifacts in architecture diagrams.

---

### `image` — icon as a standalone shape

```d2
direction: right
server: {
  shape: image
  icon: https://icons.terrastruct.com/tech/022-server.svg
}
github: {
  shape: image
  icon: https://icons.terrastruct.com/dev/github.svg
}
server -> github
```

Difference from `icon:` on a regular shape: `shape: image` is **only** the icon with no enclosing box and no label rendered below. Use for decorative elements where the icon alone communicates.

---

## Icons on any shape

Any shape can carry an `icon:`, rendered inside the shape alongside its label.

```d2
api: {
  icon: https://icons.terrastruct.com/dev/nodejs.svg
  label: API Server
}
```

Icon sources:

- <https://icons.terrastruct.com/> — the official catalog (AWS / GCP / Azure / K8s / dev / tech)
- <https://www.svgrepo.com/> — permissively-licensed SVGs
- Local file paths (`icon: ./assets/logo.svg`) — bundled with `d2 --bundle`

---

## Shape + class combo

The common pattern is a class that encodes both the shape and the style:

```d2
classes: {
  db: {
    shape: cylinder
    style.fill: "#f5f3ff"
    style.stroke: "#8b5cf6"
  }
}

users.class: db
orders.class: db
payments.class: db
```

One-line per database instead of 3-line maps each. See `classes.md`.

---

## Shape fallback behavior (gotcha)

D2 will silently render `shape: databse` (typo) as a rectangle. There's no warning. **Always copy `shape:` values from this catalog** and prefer classes (`.class: db`) over re-typing `shape: cylinder` on every database node — a typo in a class fires once; a typo on each node fires repeatedly.

---

## Choosing shape by concept

| Concept | Shape |
|---|---|
| Service / microservice | `rectangle` (default) |
| Database (relational) | `cylinder` |
| Cache / KV store | `stored_data` |
| Queue / event bus | `queue` |
| External SaaS / third-party | `cloud` |
| Human user | `person` |
| Decision point in a flow | `diamond` |
| Stage in a pipeline | `step` or `hexagon` |
| Document / spec | `document` or `page` |
| Start / end state | `circle` or `oval` |
| Title / caption | `text` |
| ERD table | `sql_table` |
| OO class | `class` |
| Pure icon | `image` |
| Sequence lifeline container | `sequence_diagram` |

When none fit, default to `rectangle` with an informative label — not an invented shape name.
