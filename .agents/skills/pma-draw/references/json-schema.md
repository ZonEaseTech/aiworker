# ReactFlow Diagram Schema

Reference for the `.rfd.json` file format consumed by pma-viewer.

---

## File Wrapper

```json
{
  "schema": "pma-draw/v1",
  "type": "reactflow",
  "metadata": {
    "title": "System Architecture",
    "description": "High-level overview of the ingest + serving pipeline",
    "createdAt": "2026-04-17",
    "author": "pma-draw"
  },
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [],
  "edges": []
}
```

Required top-level fields: `schema`, `type`, `nodes`, `edges`, `viewport`.
Optional: `metadata`.

`schema: "pma-draw/v1"` locks the contract. pma-viewer validates this on load.

---

## Node Object

```json
{
  "id": "api-server",
  "type": "backend",
  "position": { "x": 400, "y": 240 },
  "data": {
    "label": "API Server",
    "subtitle": "Express.js",
    "badges": ["Node 20", "TS"]
  },
  "sourcePosition": "right",
  "targetPosition": "left",
  "parentNode": "group__api-tier",
  "extent": "parent",
  "draggable": false,
  "selectable": true,
  "zIndex": 10,
  "style": {}
}
```

### Required

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Unique across the whole file. Kebab-case. Prefix with section (`ingest__source`) for large diagrams. |
| `type` | string | Must be a preset from `node-types.md` (e.g. `frontend`, `backend`, `database`, `evidence`, `group`). |
| `position` | `{x, y}` | Absolute pixel coordinates. For children of a group, relative to the parent. |
| `data` | object | Type-specific payload. At minimum `data.label` for labeled nodes. Schema per type is defined in `node-types.md`. |

### Optional

| Field | Type | Notes |
|-------|------|-------|
| `sourcePosition` | `"top"` / `"right"` / `"bottom"` / `"left"` | Default handle side for outgoing edges. Default `right` for flow layouts, `bottom` for vertical layouts. |
| `targetPosition` | same enum | Default handle side for incoming edges. |
| `parentNode` | string | Node ID of containing `group`. Enables hierarchical grouping. |
| `extent` | `"parent"` | With `parentNode`, locks child inside parent bounds. |
| `draggable` / `selectable` / `deletable` | boolean | Default `true`. Set `false` for static documentation. |
| `zIndex` | number | Higher renders on top. Use for evidence artifacts over background groups. |
| `style` | object | CSS overrides. Avoid unless a preset's color semantics need to be broken. |
| `width` / `height` | number | Fixed size override. Custom nodes usually size themselves. |

---

## Edge Object

```json
{
  "id": "edge__api-to-db",
  "source": "api-server",
  "target": "postgres-db",
  "sourceHandle": "right",
  "targetHandle": "left",
  "type": "flow",
  "label": "SQL",
  "animated": false,
  "markerEnd": { "type": "arrowclosed" },
  "data": {
    "semantics": "sync",
    "protocol": "Postgres wire"
  },
  "style": {}
}
```

### Required

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Unique. Convention: `edge__{source}-to-{target}` or `edge__{section}__{n}`. |
| `source` | string | Must match an existing node `id`. |
| `target` | string | Must match an existing node `id`. |
| `type` | string | Preset from `edges.md` (`flow`, `stream`, `callback`, `dependency`, `comparison`, `annotated`). |

### Optional

| Field | Type | Notes |
|-------|------|-------|
| `sourceHandle` | string | When a node exposes multiple handles, target one by ID. Common presets: `"right"`, `"left"`, `"top"`, `"bottom"`. |
| `targetHandle` | string | Same semantics, on target side. |
| `label` | string | Text shown on the edge. |
| `animated` | boolean | Only `stream` type should set `true`. |
| `markerEnd` / `markerStart` | `{type, color?}` | `"arrow"`, `"arrowclosed"`, or omit. Dependency edges typically omit `markerEnd`. |
| `data` | object | Free-form metadata (semantics tag, protocol, direction). Not rendered. |
| `style` | object | CSS overrides. Use preset style instead when possible. |

---

## Viewport

```json
{ "x": 0, "y": 0, "zoom": 1 }
```

- `x`, `y` — translation offset applied at load.
- `zoom` — initial zoom level. `1` is 100%.

For diagrams designed on a 1200×800 canvas, `viewport: {x: 0, y: 0, zoom: 1}` is usually fine. pma-viewer adds a "fit view" button so the initial viewport is a hint, not a hard constraint.

---

## Grouping (Parent-Child)

Logical groupings (namespaces, VPCs, bounded contexts, phases) use a `group` node as parent:

```json
{
  "id": "group__backend",
  "type": "group",
  "position": { "x": 200, "y": 200 },
  "data": { "label": "Backend Services" },
  "style": { "width": 600, "height": 400 }
}
```

Children reference it:

```json
{
  "id": "api-server",
  "type": "backend",
  "position": { "x": 40, "y": 80 },
  "parentNode": "group__backend",
  "extent": "parent",
  "data": { "label": "API Server" }
}
```

Rules:
- Child `position` is **relative to the parent's top-left**, not absolute.
- Declare the parent node **before** its children in the `nodes` array so ReactFlow's z-order is correct.
- A group's `style.width` / `style.height` should accommodate all children plus 40px padding.
- Nested groups are allowed — declare grandparent, then parent, then child.

---

## Handles

ReactFlow attaches edges to node "handles". Presets:

- Built-in single handles via `sourcePosition` / `targetPosition` on each side.
- Custom node types in `node-types.md` may expose named handles (e.g. `in`, `out`, `error-out`) — edges then use `sourceHandle: "error-out"` explicitly.

For simple nodes, just set `sourcePosition` / `targetPosition` on the node and omit the handle fields on the edge.

---

## ID Naming Conventions

| Kind | Pattern | Example |
|------|---------|---------|
| Regular node | kebab-case, descriptive | `api-server`, `postgres-db`, `redis-cache` |
| Group | `group__<scope>` | `group__backend`, `group__ai-pipeline` |
| Section-prefixed node (large diagrams) | `<section>__<name>` | `ingest__source`, `process__worker` |
| Edge | `edge__<source>-to-<target>` | `edge__api-server-to-postgres-db` |
| Annotation / note | `note__<topic>` | `note__scaling-caveat` |

Keep IDs stable across edits — edges reference them by string.

---

## Minimal Valid File

```json
{
  "schema": "pma-draw/v1",
  "type": "reactflow",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    {
      "id": "a",
      "type": "process",
      "position": { "x": 100, "y": 100 },
      "data": { "label": "A" }
    },
    {
      "id": "b",
      "type": "process",
      "position": { "x": 400, "y": 100 },
      "data": { "label": "B" }
    }
  ],
  "edges": [
    {
      "id": "edge__a-to-b",
      "source": "a",
      "target": "b",
      "type": "flow"
    }
  ]
}
```

---

## Dynamic ID Generation (codebase extraction)

When deriving a diagram from codebase analysis:

| Discovered Component | Node Type | ID | `data.label` |
|---------------------|-----------|----|--------------|
| Express API server | `backend` | `express-api` | `"API Server"` + `subtitle: "Express.js"` |
| PostgreSQL database | `database` | `postgres-db` | `"PostgreSQL"` |
| Redis cache | `cache` | `redis-cache` | `"Redis"` |
| S3 bucket | `storage` | `s3-uploads` | `"S3"` + `subtitle: "uploads/"` |
| Lambda function | `backend` | `lambda-processor` | `"Lambda"` + `subtitle: "Processor"` |
| React frontend | `frontend` | `react-frontend` | `"React App"` |
| User / actor | `user` | `end-user` | `"End User"` |
| Third-party API | `external` | `stripe-api` | `"Stripe"` + `subtitle: "Payments"` |
