# Layout Templates

ReactFlow uses absolute pixel `position` values. Pick a template, fix a grid, emit nodes on that grid. Consistency comes from shared numbers, not from auto-layout.

---

## Grid Basics

- Node default width: **220px** (semantic / evidence nodes wider).
- Node default height: **80px** (headerful nodes ~110, evidence nodes ~160).
- Horizontal gap between columns: **80–120px** (220 + 80 = 300 stride).
- Vertical gap between rows: **60–100px** (80 + 60 = 140 stride).
- Outer padding: **60px** from canvas edge.

Reserve the top **60–80px** for a `title` node when the diagram has a heading.

---

## Vertical Flow (Most Common)

Top-to-bottom layers. Best for request/response stacks, layered architectures.

```
Col x:    100    340    580    820    1060
Row y:
  60   [ title                                         ]
 140   [ user ]
 280   [ frontend ]
 420   [ api gateway ]
 560   [ backend ]
 700   [ database / storage / cache (three columns) ]
```

Node defaults:
- `sourcePosition: "bottom"`, `targetPosition: "top"`
- Edge type: `flow` for call chains, `dependency` for static refs

### Positions

```
title:      { x: 100, y: 60 }
user:       { x: 440, y: 140 }
frontend:   { x: 440, y: 280 }
gateway:    { x: 440, y: 420 }
backend:    { x: 440, y: 560 }
database:   { x: 220, y: 700 }
cache:      { x: 440, y: 700 }
storage:    { x: 660, y: 700 }
```

---

## Horizontal Pipeline

Left-to-right stages. Best for ETL, CI/CD, data pipelines.

```
Col x:   100   380   660   940   1220
Row y:
 60   [ title                                  ]
 140  [ src ] → [ xform1 ] → [ xform2 ] → [ sink ]
 320  [ evidence nodes aligned below each stage ]
```

Node defaults:
- `sourcePosition: "right"`, `targetPosition: "left"`
- Edge type: `flow`, with `annotated` for stage-transition contracts

### Positions

```
src:       { x: 100,  y: 140 }
xform1:    { x: 380,  y: 140 }
xform2:    { x: 660,  y: 140 }
sink:      { x: 940,  y: 140 }
evidence1: { x: 100,  y: 320 }
evidence2: { x: 380,  y: 320 }
```

---

## Hub-and-Spoke

Central `orchestrator` (or `queue` acting as event bus) with radial spokes.

```
Center: (660, 400)
Radius: 260

8 slots at 45° increments:
  N   (660, 140)
  NE  (844, 216)
  E   (920, 400)
  SE  (844, 584)
  S   (660, 660)
  SW  (476, 584)
  W   (400, 400)
  NW  (476, 216)
```

Node defaults:
- Hub: `sourcePosition` & `targetPosition` both `"top"` (handled per-edge via handle names)
- Spokes: set `sourcePosition`/`targetPosition` based on which side faces the hub
- Edge type: `stream` for event bus, `flow` for RPC hub

Use at most 8 spokes; beyond that the diagram gets noisy — split into two hubs.

---

## Swimlanes (Parallel Actors)

Parallel horizontal lanes, each belonging to one actor (User / System / External Service). Time flows left to right.

```
Col x:    100    340    580    820    1060
Lane y bands (group nodes as backdrops):
   60–160  User
  180–300  System
  320–440  External API
```

Approach:
1. Create three full-width `group` nodes stacked vertically as the lanes.
2. Nodes belonging to a lane use `parentNode: "group__lane-<name>"` with `extent: "parent"`.
3. Edges crossing lanes are the story.

### Positions (child `position` is relative to parent)

```
group__lane-user:     { x: 100, y: 60  }, style: { width: 1160, height: 100 }
group__lane-system:   { x: 100, y: 180 }, style: { width: 1160, height: 120 }
group__lane-external: { x: 100, y: 320 }, style: { width: 1160, height: 120 }

Within lane-system:
  gateway:   { x: 20,  y: 20 }    // absolute ~(120, 200)
  worker:    { x: 280, y: 20 }
  queue:     { x: 540, y: 20 }
```

---

## Timeline

Horizontal `divider` with `marker` dots. Use `note` nodes above/below for labels.

```
divider:   y: 400, length: 1000, x: 100, orientation: horizontal
markers:   y: 394, x: 200, 400, 600, 800, 1000 (6px offset so centers align)
notes:     alternate above (y: 340) and below (y: 440) to avoid collisions
```

Evidence nodes (code/json) go further below (y: 540+) tied to specific markers with `dependency` edges.

---

## Matrix (Grid Comparison)

N rows × M columns grid for side-by-side comparisons (features × products, phases × teams).

```
Header row:  y: 60   — `title` level 3 for each column
Header col:  x: 100  — `title` level 3 for each row
Cells:       nodes at (x: 340 + col*220, y: 180 + row*140)
```

Cell contents are typically `note` nodes (text) or small semantic nodes (present/absent as different types).

---

## Choosing a Layout

```
Is it sequential?
├── yes → Vertical flow (request/response) or Horizontal pipeline (data transform)
│
└── no  → Is there a central coordinator?
          ├── yes → Hub-and-Spoke
          │
          └── no  → Multiple actors in time?
                    ├── yes → Swimlanes
                    │
                    └── no  → Comparing N × M categories?
                              ├── yes → Matrix
                              │
                              └── no  → Is it events over time?
                                        ├── yes → Timeline
                                        └── no  → Custom — default to Vertical flow
```

---

## Viewport Defaults

Pick `viewport.zoom` and `viewport.x/y` so the rendered diagram lands centered in a 1400×900 SPA viewport with all nodes visible:

- Small diagram (≤8 nodes, spans ~800×500): `{x: 0, y: 0, zoom: 1}`
- Medium (≤20 nodes, spans ~1200×700): `{x: 0, y: 0, zoom: 0.9}`
- Large (≤50 nodes, spans ~1600×1000): `{x: 0, y: 0, zoom: 0.75}`
- Very large: use `{zoom: 0.6}` and rely on the user's "fit view" action

pma-viewer always renders a "Fit View" button, so viewport is a convenience, not a hard constraint.
