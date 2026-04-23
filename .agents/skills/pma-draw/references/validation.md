# Validation Reference

Pre-flight checks for `.rfd.json`. Because the agent cannot see the rendered output, JSON-level discipline is mandatory before delivery.

---

## Pre-Flight Algorithm

```
validate(file):
  errors = []

  # 1. Wrapper
  assert file.schema == "pma-draw/v1"            → else error
  assert file.type == "reactflow"                → else error
  assert isinstance(file.nodes, list)            → else error
  assert isinstance(file.edges, list)            → else error

  # 2. Node sanity
  seen_ids = set()
  for n in file.nodes:
    assert n.id and n.id not in seen_ids         → else "duplicate id"
    seen_ids.add(n.id)
    assert n.type in NODE_TYPE_CATALOG           → else "unknown type"
    assert n.position.x and n.position.y exist
    assert n.data is not None
    # Type-specific data-schema checks (see node-types.md)

  # 3. Group integrity
  for n where n.parentNode is not None:
    parent = lookup(seen_ids, n.parentNode)
    assert parent exists                          → else "dangling parentNode"
    assert parent.type == "group"                 → else "parent is not a group"
    assert n.extent == "parent"                   → else "child missing extent:parent"
    # position is relative — bounded inside parent.style.width / height if set

  # 4. Edge sanity
  seen_edge_ids = set()
  for e in file.edges:
    assert e.id and e.id not in seen_edge_ids    → else "duplicate edge id"
    assert e.source in seen_ids                   → else "edge.source missing"
    assert e.target in seen_ids                   → else "edge.target missing"
    assert e.type in EDGE_TYPE_CATALOG            → else "unknown edge type"
    # Handle validation: if sourceHandle set, source node must expose it
    if e.sourceHandle: assert handle exists on node type
    if e.targetHandle: assert handle exists on node type

  # 5. Layout sanity (soft checks)
  check_position_overlaps(file.nodes)            # two nodes with identical (x,y)
  check_column_grid_consistency(file.nodes)      # x values cluster to a grid
  check_row_grid_consistency(file.nodes)

  # 6. Semantics
  for n of type "orchestrator": count          → warn if > 1 without justification
  for edge where label is None and type == "annotated": warn

  return errors
```

`NODE_TYPE_CATALOG` is the set of types listed in `node-types.md`.
`EDGE_TYPE_CATALOG` is the set of types listed in `edges.md`.

---

## Before Generating (design checks)

- [ ] Depth assessed (simple vs. comprehensive)
- [ ] For technical: real specs / APIs / event names researched
- [ ] Concept-to-pattern mapping complete; no two major concepts share the same pattern
- [ ] Layout template chosen (vertical / horizontal / hub-and-spoke / swimlanes / timeline / matrix)
- [ ] Semantic node types selected per component (not defaulting to `process`)
- [ ] Edge types selected per relationship (not defaulting to `flow`)
- [ ] Palette selected (default / AWS / Azure / GCP / K8s)

---

## During Generation (per-element checks)

- [ ] Wrapper present with `schema`, `type`, `viewport`, `nodes`, `edges`
- [ ] Every node has `id`, `type`, `position`, `data`
- [ ] Every `data` payload matches its type's contract (from `node-types.md`)
- [ ] Every node `type` is from the catalog — no invented types
- [ ] Group parent declared **before** its children
- [ ] Child positions are relative to the parent
- [ ] Every edge has `id`, `source`, `target`, `type`
- [ ] Edge `source` and `target` reference real node IDs
- [ ] Named handles (`sourceHandle`, `targetHandle`) match handles exposed by the node type
- [ ] Every edge type is from the catalog — no raw `default` unless justified

---

## After Generation (file-level checks)

- [ ] No duplicate node or edge IDs
- [ ] No dangling `parentNode` references
- [ ] Every edge `source`/`target` resolves to an existing node
- [ ] Position grid is consistent (x / y values cluster to column/row bands)
- [ ] No identical `(x, y)` pairs unless intentional (overlapping groups)
- [ ] Children fit inside their parent group's `style.width` / `height`
- [ ] Viewport zoom reasonable for diagram size (see `layouts.md`)
- [ ] File parses as valid JSON
- [ ] `schema` and `type` fields set correctly

---

## Common Bugs & Fixes

### Node doesn't render in pma-viewer

Cause: `type` not in the catalog, so the viewer falls back to a default renderer (or nothing).
Fix: pick a preset from `node-types.md`. If the shape doesn't exist, use the closest semantic match and file a viewer issue.

### Child escapes its group bounds

Cause: child's `position` (relative) + node width/height exceeds parent's `style.width` / `height`.
Fix: either enlarge `parent.style.width` / `height`, or move the child to fit. `extent: "parent"` also constrains dragging at runtime.

### Edge renders but isn't attached to a node

Cause: `sourceHandle` / `targetHandle` names a handle that the node type doesn't actually expose.
Fix: either drop the handle field (ReactFlow picks the default side) or use a handle name from the catalog (`yes`, `no`, `in`, `out`, `out-1`, etc.).

### Edges overlap between the same two nodes

Cause: multiple edges between identical source/target without distinct handles.
Fix: use a node type that exposes named handles for each flow, or collapse to a single edge with a compound label.

### `parentNode` not recognized

Cause: parent group declared **after** the child in `nodes` array.
Fix: reorder — groups always come before their children.

### Viewport loads with everything off-screen

Cause: `viewport.zoom` too high for diagram size, or `viewport.x/y` offsets nodes out of view.
Fix: for medium diagrams use `{x: 0, y: 0, zoom: 0.9}`; for large, `{zoom: 0.75}`. The viewer's "Fit View" button will recover either way.

### Text overflows a semantic node

Cause: `data.label` or `subtitle` too long for the default 220px width.
Fix: shorten the label, add an explicit `style.width` override, or move detail into a `data.subtitle` or `note` node.

### "Unknown edge type" warning

Cause: a typo or a custom type name that pma-viewer doesn't have a preset for.
Fix: match the catalog exactly (`flow`, `stream`, `callback`, `dependency`, `comparison`, `annotated`, `rejected`, `async`).

### Badges look cramped

Cause: too many badges on a semantic node.
Fix: keep badges to 1–3. Move extra info to `subtitle` or an adjacent `note` node.

### Stream edges look frantic

Cause: too many animated edges on screen at once.
Fix: downgrade long-distance stream edges to `flow` and keep the animation for the critical path. Or add `data.animated: false` override on individual edges.
