# Edge Type Catalog

Predefined `type` values for edges. Each preset encodes a specific semantic and ships with matching style in pma-viewer.

**Rule**: always pick a type from this catalog. Reach for raw `default` only when no preset fits and document why in `edge.data.note`.

---

## Preset Catalog

| Type | Visual | `markerEnd` | `animated` | Use For |
|------|--------|-------------|------------|---------|
| `flow` | Solid, smoothstep | `arrowclosed` | false | Default request/response, data flow |
| `stream` | Dashed, smoothstep | `arrow` | **true** | Event streams, pub/sub, WebSocket |
| `callback` | Dashed bezier | `arrow` | false | Return values, error paths, feedback loops |
| `dependency` | Thin gray, straight | `null` | false | "uses", "depends on" — no data movement |
| `comparison` | Double arrow, smoothstep | both `arrow` | false | Bidirectional sync, two-way integration |
| `annotated` | Solid, smoothstep, prominent label | `arrowclosed` | false | Edges whose label carries critical info (protocol, contract) |
| `rejected` | Dotted red | `null` | false | Disallowed / blocked path, failure branch |
| `async` | Dashed with clock icon | `arrow` | false | Fire-and-forget async dispatch |

pma-viewer reads the `type` field and applies the preset's `style`, `markerEnd`, and `animated` automatically. You don't need to set those properties on the edge unless overriding.

---

## Choosing an Edge Type

```
Does data actually move along this edge?
├── no  → dependency (static relationship)
│         or rejected (blocked / invalid path)
│
└── yes → is it ongoing / streamed?
          ├── yes → stream (events, feeds, WebSocket)
          │
          └── no  → is it a response / return / feedback?
                    ├── yes → callback
                    │
                    └── no  → is both directions primary?
                              ├── yes → comparison
                              │
                              └── no  → does the label carry the key info?
                                        ├── yes → annotated
                                        └── no  → flow (default)
```

---

## Handles

For most diagrams, set `sourcePosition` / `targetPosition` on each node and leave `sourceHandle` / `targetHandle` unset on edges — ReactFlow picks the default handle for that side.

Set `sourceHandle` / `targetHandle` explicitly when:

- The node type exposes named handles (see `decision`, `orchestrator`, `queue` in `node-types.md`).
- You need multiple edges leaving the same side but attached at distinct points — name the handles `out-1`, `out-2`, etc. in the node's custom component.

### Handle Position Presets

| Layout | Default `sourcePosition` | Default `targetPosition` |
|--------|--------------------------|--------------------------|
| Vertical flow (top → bottom) | `bottom` | `top` |
| Horizontal pipeline (left → right) | `right` | `left` |
| Hub-and-spoke | auto (depends on spoke direction) | auto |
| Swimlanes (horizontal) | `right` | `left` |
| Cycle / feedback | `right` → `bottom` (callback goes back on top/left) | varies |

---

## Labels

```json
{
  "id": "edge__api-to-db",
  "source": "api-server",
  "target": "postgres-db",
  "type": "annotated",
  "label": "SQL (asyncpg, pool=20)"
}
```

Label rendering comes from the preset. For long labels, break them across two lines using `\n`.

### Label Guidelines

- Keep labels under ~25 characters per line — longer reads as noise.
- Prefer protocol + key constraint (`"gRPC (TLS)"`, `"HTTP 2, JWT"`) over vague verbs (`"sends"`).
- Use `annotated` edges when the label is the main point (e.g. protocol diagram).
- Avoid labeling every edge — only those carrying information the reader needs.

---

## Staggering Multiple Edges Between the Same Nodes

ReactFlow overlaps edges that share the same source/target. When you need multiple edges between the same two nodes:

1. Declare **named handles** on the source and/or target node types (pma-viewer's custom component exposes them).
2. Reference each handle explicitly:

```json
{ "id": "edge__sync",  "source": "svc-a", "sourceHandle": "out-sync",  "target": "svc-b", "targetHandle": "in-sync",  "type": "flow" },
{ "id": "edge__async", "source": "svc-a", "sourceHandle": "out-async", "target": "svc-b", "targetHandle": "in-async", "type": "stream" }
```

If the node type doesn't expose named handles, the edges will overlap — use a single edge with a compound label instead (`"flow + async (stream)"`).

---

## Edge Data (metadata, not rendered)

`data` is free-form and doesn't affect rendering. Use it to carry semantics for future tooling:

```json
{
  "id": "edge__api-to-db",
  "source": "api-server",
  "target": "postgres-db",
  "type": "flow",
  "data": {
    "protocol": "Postgres wire",
    "sync": true,
    "critical": true,
    "contract": "openapi://api-server#/paths/~1users/get"
  }
}
```

pma-viewer may surface this in a side panel on edge click; skill generation does not need to populate it.

---

## Override Style (last resort)

Only when the preset doesn't fit and no new preset is appropriate:

```json
{
  "id": "edge__custom",
  "source": "a",
  "target": "b",
  "type": "flow",
  "style": {
    "stroke": "#7c3aed",
    "strokeWidth": 3,
    "strokeDasharray": "8 4"
  },
  "data": { "note": "highlighted path for the tutorial" }
}
```

Prefer adding a new preset to pma-viewer (and documenting it here) over scattering `style` overrides across diagrams.
