# Connections Reference

Edges in D2 are first-class — they have IDs, labels, styles, and arrowheads. Use edge style to encode semantics, not decoration.

---

## Operators

| Operator | Meaning |
|---|---|
| `a -> b` | Directed: arrow on `b` |
| `a <- b` | Reverse of `a -> b` — same rendering, different read direction |
| `a <-> b` | Bidirectional — arrows on both ends |
| `a -- b` | Undirected line, no arrows |

Prefer `->` for dataflow / request flow; `<->` only when the relationship is genuinely symmetric (peer replication, handshake, partnership). `--` for structural associations without flow (e.g., "is part of", "references").

---

## Chained connections

A chain is one statement. A label on a chain applies to **every segment** in it.

```d2
web -> api -> db: reads
# renders two arrows, both labeled "reads"
```

Break the chain when the segments mean different things:

```d2
web -> api: HTTP
api -> db: SQL
```

Chains are a readability tool. If a chain is longer than three segments or mixes directions, split it.

---

## Labels

Attach a label with `:`. Any string (including quotes or multiline) works.

```d2
client -> server: "GET /users/:id"
producer -> queue: "event\nbatches"
api -> db: |md
  **SQL** · Postgres wire
|
```

Label placement is controlled by the layout engine; D2 doesn't expose explicit positioning. If a label clashes, shorten it or move the detail to a `note` shape beside the edge.

---

## Multiple edges between the same pair

Each `a -> b` adds another distinct edge with its own ID.

```d2
client -> server: request
client <- server: response       # two separate arrows
```

Reference a specific edge by index for styling:

```d2
(client -> server)[0].style.stroke: "#0ea5e9"
(client -> server)[1].style.stroke-dash: 4
```

Use when you need the overlap collapsed — otherwise prefer two explicit lines, which read better in text.

---

## Edges inside maps

Edges can be declared inside a container, and they reference only that container's children:

```d2
aws: {
  api
  db.shape: cylinder
  api -> db
}
```

Cross-container edges live at the outer level and use dotted paths:

```d2
user -> aws.api
aws.api -> gcp.auth
```

---

## Arrowheads

Both ends can carry a custom arrowhead via `source-arrowhead` and `target-arrowhead`.

| Value | Look |
|---|---|
| `triangle` (default) | Solid filled triangle |
| `arrow` | Slimmer pointer |
| `diamond` | Diamond — filled or hollow (`style.filled`) |
| `circle` | Dot |
| `box` | Square tip |
| `cross` | X |
| `cf-one` | Crow's foot "one" |
| `cf-one-required` | Crow's foot "exactly one" |
| `cf-many` | Crow's foot "many" |
| `cf-many-required` | Crow's foot "one or many" |

```d2
orders -> customers: {
  source-arrowhead.shape: cf-many
  source-arrowhead.label: "*"
  target-arrowhead.shape: cf-one-required
  target-arrowhead.label: "1"
}
```

Crow's-foot arrowheads are idiomatic in ERDs — use them on `sql_table` relationships.

---

## Style catalog for connections

Edges accept the same `style:` keys as shapes with a few connection-specific meanings.

| Key | Effect |
|---|---|
| `stroke` | Line color — hex, CSS name, gradient |
| `stroke-width` | Line thickness (default 2) |
| `stroke-dash` | Dash length (0 = solid; 3–6 typical for async) |
| `opacity` | 0–1, useful for backgrounded / deprecated edges |
| `animated` | `true` for a marching-ants effect (streams, events) |
| `bold` / `italic` / `underline` | On the label |
| `font-size` | On the label |
| `fill` | Label background |
| `border-radius` | On the label box |

```d2
producer -> kafka: publish {
  style.stroke: "#06b6d4"
  style.stroke-width: 2
  style.stroke-dash: 0
  style.animated: true
}
```

---

## Semantic edge styles (conventions)

Use the table below as defaults; override only when the domain demands it. When a diagram uses multiple styles, add a legend via a `layers.legend:` board (`composition.md`).

| Relationship | Style |
|---|---|
| **Synchronous call / request** | Solid arrow, `stroke: "#64748b"` (slate-500) |
| **Asynchronous / event** | `stroke-dash: 4`, `animated: true`, cyan `#06b6d4` |
| **Callback / response** | `stroke-dash: 4`, purple `#8b5cf6` |
| **Dependency / uses** | Thin solid, slate, `stroke-width: 1` |
| **Data flow (bulk)** | Thick solid, `stroke-width: 3` |
| **Error / failure path** | Red `#dc2626`, `stroke-dash: 2` |
| **Deprecated / future** | `opacity: 0.4` |
| **Bidirectional sync** | `<->`, solid, slate |
| **Schema relationship** | Crow's foot arrowhead |

Apply these via classes so a change in convention edits one place:

```d2
classes: {
  sync: { style.stroke: "#64748b" }
  async: { style.stroke: "#06b6d4"; style.stroke-dash: 4; style.animated: true }
  error: { style.stroke: "#dc2626"; style.stroke-dash: 2 }
}

(web -> api)[0].class: sync
(api -> kafka)[0].class: async
(api -> dlq)[0].class: error
```

---

## Label positioning (near)

Edges don't take `near`, but their labels render at the midpoint by default. For titles, legends, and captions use a separate `text` shape with `near: top-center | top-left | bottom-right | ...` — see `layouts.md`.

---

## Self-loops

```d2
retry_loop -> retry_loop: on failure
```

Renders as a loop on the node. Use sparingly — one self-loop per diagram at most; more and the layout engine struggles.

---

## Conventions summary

1. Direction carries meaning: dataflow moves with `->`.
2. One semantic style per purpose; use a class.
3. A long chain of `->` is a smell — break into named hops if labels differ.
4. Label edges that carry a distinct verb (`reads`, `publishes`, `authenticates`); leave boring edges unlabeled.
5. Multi-edge between the same pair: use indexed styling or named handles via containers (rarely needed).
