# Viewing & Exporting (pma-viewer)

pma-draw only generates `.rfd.json`. Rendering, interactive editing, and export are delegated to **pma-viewer** — a ReactFlow-based SPA that implements the node / edge type catalog defined in this skill. No local Node / browser / build step is needed from the skill side.

---

## Contract With pma-viewer

pma-viewer must implement:

1. A custom React component for every node `type` in `node-types.md`, reading the documented `data` contract.
2. A preset style + edge component for every `type` in `edges.md`.
3. Theme tokens matching the slots in `colors.md`.
4. A file loader that accepts `.rfd.json` (validates `schema: "pma-draw/v1"`).
5. Exports: PNG (via `html-to-image` on the ReactFlow pane) and SVG (via ReactFlow's built-in SVG export).

If pma-viewer drifts from these contracts, generated files may render with fallback styles or missing components — fix the viewer, not the skill.

---

## Open Options

| Method | Steps |
|--------|-------|
| **Hosted pma-viewer** | Upload / drag `.rfd.json` onto the SPA, or load via `?src=<url>` query param |
| **Local pma-viewer** | Run `pnpm dev` in the viewer repo, then drag the file onto the dev server |
| **Embedded mode** | Pass the file's JSON as a prop to `<PmaViewer data={...} />` when embedding in a docs site |

---

## Exporting to PNG / SVG

Export is driven by pma-viewer, not by this skill:

1. Open the `.rfd.json` in pma-viewer.
2. Click the export button in the toolbar.
3. Choose PNG, SVG, or the underlying JSON (for re-editing).
4. Save alongside the `.rfd.json` file (`system.rfd.json` → `system.svg` / `system.png`).

---

## Pre-Delivery Self-Check

Because the agent cannot view the rendered diagram, quality has to be enforced at the JSON level. Run every check in `validation.md`:

1. **Structural** — IDs unique, types from the catalog, edges reference existing nodes, `parentNode` chain valid.
2. **Handle** — `sourceHandle` / `targetHandle` match what the node type exposes.
3. **Layout** — positions cluster to a shared grid; no unintended overlaps; children fit inside groups.
4. **Semantic** — the chosen node and edge types actually match the concept (a message queue is `queue`, not `process`; an event stream is `stream`, not `flow`).
5. **Content** — labels and subtitles are real names, not placeholders; evidence nodes carry actual code / JSON.

If any check fails, fix the JSON before delivering. In the handoff message, call out any structural assumptions that couldn't be verified without rendering.

---

## Handoff Format

When delivering a generated diagram, tell the user:

- Path to the `.rfd.json` file
- One-line summary of what the diagram argues (not just describes)
- Which layout template and palette were used
- How to open it: either "drop it on pma-viewer at `<url>`" or local instructions
- Any assumptions the agent couldn't verify without rendering

Example:

> Wrote `docs/architecture/ingest.rfd.json` — hub-and-spoke argument showing Kafka as the single ingestion boundary, five consumer workers depending on it. Default palette, viewport zoom 0.9. Open in pma-viewer to confirm edge routing and spacing; request adjustments if the fan-out looks crowded.

---

## Troubleshooting (User-Side)

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Blank canvas | `schema` or `type` wrapper missing / wrong | Check wrapper per `json-schema.md` |
| Nodes render as empty boxes | Node `type` not in pma-viewer's catalog | Use a preset from `node-types.md`; update pma-viewer if a new type was added |
| Edges disconnected / floating | `source` / `target` points at a non-existent node id | Check edge `source` / `target` against node IDs |
| Child node drifts outside its group | `position` exceeds `parent.style.width` / `height` | Enlarge parent or move child |
| All edges look the same | Every edge set to `flow` | Apply semantic edge types per `edges.md` |
| Everything clustered in one corner | All nodes at `(0, 0)` or very small positions | Apply the grid math from `layouts.md` |
| Stream animation missing | `type: "flow"` used for an event stream | Change to `type: "stream"` |
