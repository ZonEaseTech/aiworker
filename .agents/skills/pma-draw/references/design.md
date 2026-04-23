# Design Methodology

Principles for making diagrams that **argue visually**, not just display information. Applies regardless of the underlying renderer — in pma-draw these translate to node type choice, layout, and edge semantics.

---

## Core Tests

**Isomorphism Test**: remove all labels. Does the structure alone communicate the concept? If not, redesign.

**Education Test**: could someone learn something concrete from this, or does it just label boxes? A good technical diagram teaches — it shows real formats, real event names, actual examples via `evidence-*` nodes.

---

## Depth Assessment (First Decision)

| Level | When to Use | What It Includes |
|-------|-------------|------------------|
| **Simple / Conceptual** | Mental models, philosophies, abstract ideas | Utility nodes (`process`, `start`, `end`), default edges, minimal palette |
| **Comprehensive / Technical** | Real systems, protocols, tutorials | Semantic nodes (`backend`, `database`, `queue`, `ai`), evidence nodes, typed edges (`stream`, `callback`) |

For comprehensive diagrams: **research first**. Look up actual specs, API endpoints, event names, JSON schemas before writing JSON.

Bad: generic `process` labeled `"Protocol"` → generic `frontend` labeled `"Frontend"`.
Good: `backend` labeled `"AG-UI Router"` with subtitle `"streams RUN_STARTED, STATE_DELTA, A2UI_UPDATE"` → `frontend` labeled `"CopilotKit"` with subtitle `"createA2UIMessageRenderer()"`, plus an `evidence-json` node showing a real event payload.

---

## Evidence Artifacts

Concrete examples that prove the diagram is accurate AND help viewers learn. Required in technical diagrams. Use the evidence node types:

| Artifact Type | Node Type | When to Use |
|---------------|-----------|-------------|
| Code snippet | `evidence-code` | APIs, integration points, method signatures |
| Data / JSON example | `evidence-json` | Data formats, event payloads, responses |
| UI mockup | `evidence-ui` | Showing actual output composition |
| Event / step sequence | `marker` + `note` on a `divider` timeline | Protocols, workflows, lifecycles |
| API / method name | `data.subtitle` on a semantic node | Real function calls, endpoints |

Principle: **show what things actually look like**, not just what they're called.

---

## Multi-Zoom Architecture

Comprehensive diagrams operate at three zoom levels simultaneously:

1. **Summary Flow** — simplified overview at top or bottom. Utility nodes + `flow` edges: `Input → Process → Output`.
2. **Section Boundaries** — `group` nodes grouping related components. By responsibility (Backend / Frontend), by phase (Setup / Execute / Cleanup), or by team (User / System / External).
3. **Detail Inside Sections** — evidence nodes, typed edges, real subtitles. This is where educational value lives.

Place the summary flow at the top as an anchor; sections in the middle; evidence nodes tucked into each section near what they illustrate.

---

## Visual Pattern Library

Each major concept gets the pattern that mirrors its behavior. No two major concepts in the same diagram should share the same pattern.

### Fan-Out (one-to-many)
One `orchestrator` or `backend` node with multiple outgoing edges radiating to children. Use for: sources, routers, central hubs, dispatchers.

### Convergence (many-to-one)
Multiple sources converging to a single sink via edges. Use for: aggregation, funnels, synthesis, reducers.

### Tree (hierarchy)
Parent `group` with child nodes stacked, or a decision tree with `decision` nodes branching into `yes` / `no` handles. Use for: file systems, org charts, taxonomies, routing logic.

### Cycle / Spiral
Nodes in sequence with a `callback` edge returning to the start. Use for: feedback loops, iterative processes, retry logic, reconciliation.

### Cloud (abstract state)
Multiple overlapping `group` nodes with light fills. Use for: context, memory, conversations, mental state.

### Assembly Line (transformation)
Horizontal pipeline: `start` → `process` → `process` → `end`, usually with `evidence-json` nodes above/below each stage showing before/after data. Use for: transformations, ETL pipelines.

### Side-by-Side (comparison)
Two parallel vertical columns with a `divider` between. Use for: before/after, A/B, options, trade-offs.

### Gap / Break (separation)
Visual whitespace plus a `divider` between sections. Use for: phase changes, context resets, trust boundaries.

### Timeline
Horizontal `divider` with `marker` dots at regular intervals, `note` labels beside each. Use for: sequences, protocols, lifecycle events.

### Hub-and-Spoke
Central node (typically `orchestrator`) with radial spokes to peripheral nodes. Use for: event bus, router, brokered architectures.

---

## Node Choice Discipline

- **Semantic nodes** over utility nodes whenever the component has a clear real-world type. A message queue is `queue`, not `process`.
- **Default to `data.subtitle`** for real tech stack: `"Express.js"`, `"Postgres 15"`, `"Redis Streams"`. Subtitles are where the diagram earns its keep.
- **Badges are optional**. Use sparingly for version or flag info (`"v2"`, `"deprecated"`), not for decoration.
- **One `orchestrator` per diagram** unless you're showing a federation. Multiple "hubs" dilute the argument.
- **`group` for organization, not decoration**. If a group doesn't have a meaningful label, it shouldn't exist.

---

## Edge Choice Discipline

- **Match semantics**: sync RPC is `flow`; event stream is `stream`; return value is `callback`; "depends on" with no data is `dependency`.
- **Label only when the label adds information**. "API → DB" labeled "SQL" is fine; labeled "sends data" is noise.
- **Stream edges are animated** — reserve animation for actual streaming, or the diagram looks busy.
- **Don't cross**: if two edges must cross, consider whether the layout is wrong.

---

## Layout Principles

- **Hierarchy through scale**: hero node larger (or wrapped in a standout `group`); primary in the main flow; secondary nodes smaller or dimmed (`data.dimmed: true`).
- **Whitespace = importance**: the most important node has the most empty space around it (200px+ gap).
- **Flow direction**: left→right or top→bottom for sequences; radial for hub-and-spoke.
- **Connections required**: if A relates to B, there must be an edge. Proximity alone is not a relationship.
- **Reading order matches concept order**: the eye should land on the entry point first, then follow edges through the primary story.

---

## Bad vs Good

| Bad (Displaying) | Good (Arguing) |
|------------------|----------------|
| 5 `process` nodes in a row | Each concept uses the semantic type that matches it (`queue`, `cache`, `ai`, `database`, `storage`) |
| `flow` edges everywhere | `stream` for events, `callback` for returns, `dependency` for static refs |
| Labels like "Input" → "Process" → "Output" | Labels are the actual component names; subtitles show tech and details |
| "Events" edge | Timeline with real event names in `marker` + `note` form |
| "UI" box | `evidence-ui` mockup with actual elements |
| Same grouping style for all sections | Meaningful groups with labels that reflect responsibility |
| Every node in a group | Free-floating `title` and `note` nodes mixed with grouped components |

---

## Quality Checklist (Design)

1. Isomorphism: visual structure mirrors concept structure
2. Variety: each major concept uses a different pattern
3. Semantic nodes chosen over utility nodes where applicable
4. Subtitles carry real tech stack / contracts
5. Evidence nodes present for technical diagrams
6. Multi-zoom: summary + sections (groups) + evidence details
7. Edge types chosen per semantics, not all `flow`
8. Every meaningful relationship has a visible edge
9. Flow has a clear entry point and direction
10. Whitespace around the hero node
