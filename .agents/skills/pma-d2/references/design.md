# Design Reference

How to decide *what* to draw before deciding *how*. This file is about the upstream judgment — pattern selection, isomorphism, and tool choice — not D2 syntax.

---

## Concept → pattern map

Start from the thing the reader needs to understand; pick the pattern that's native to it.

| Reader needs to understand | Pattern |
|---|---|
| "What are the components and how do they connect?" | **Architecture**: nodes + containers + directed edges |
| "What happens when X happens, in order?" | **Sequence**: `shape: sequence_diagram` |
| "How is the data modeled?" | **ERD**: `sql_table` + crow's-foot arrows |
| "How are these types related?" | **UML class**: `shape: class` |
| "What's the state machine?" | **State diagram**: oval nodes + labeled edges |
| "What are the branches of a decision?" | **Flowchart**: diamond nodes + yes/no edges |
| "What's on which machine?" | **Grid / physical layout**: `grid-rows` / `grid-columns` |
| "Before and after of a refactor" | **Scenarios**: baseline + `scenarios:` |
| "Step-by-step of a process" | **Steps**: `steps:` (animated) |
| "Multiple views of one system" | **Layers**: `layers:` |

If two patterns fit, pick the one that matches the reader's question most directly. A sequence diagram and an architecture diagram can both describe "auth", but only the sequence answers *when*.

---

## The isomorphism test

A good diagram has a **one-to-one** correspondence between:

- Shapes ↔ things that exist in the real system.
- Edges ↔ relationships that exist in the real system.
- Containers ↔ logical or physical boundaries that exist.

**If a reader points to a shape and says "what's that in production?", you must have an answer.**

Failure modes:

- **Ghost nodes** — boxes that exist only to make the layout look symmetric. Delete.
- **Composite edges** — one arrow that silently represents multiple different interactions. Split.
- **Decorative containers** — a border around nodes that don't actually share a boundary. Replace with a class for color grouping.
- **Wrong semantic arrow** — `->` where data flows both ways, or `<->` where it's actually one-sided with a callback. Read each arrow out loud: "X sends *what* to Y". If you can't answer, the arrow is wrong.

---

## One concept per diagram

A diagram answers **one** question. If the reader has two questions, you have two diagrams.

Examples of two-concept diagrams (split them):

- "Architecture + deployment" → architecture diagram + deployment diagram, linked via `layers:`.
- "Sync vs async paths on one diagram" → baseline diagram + scenarios for each mode.
- "Current + future state" → baseline + `after` scenario.
- "Tech stack + request flow" → two diagrams; the stack rarely matters while explaining flow.

Symptom of a two-concept diagram: the reader asks you to explain half the nodes because they aren't relevant to the current question.

---

## When D2 wins

- **Source-controlled** — lives in git, diffs cleanly, reviewable in PRs.
- **Code-friendly syntax** — people who write code can edit D2 confidently.
- **Semantic shapes** — cylinder, queue, cloud, person are instantly recognizable.
- **Composition** — `layers:`, `scenarios:`, `steps:`, imports scale past single-diagram mental models.
- **No position management** — the layout engine handles it; you focus on relationships.
- **Classes + vars** — theme changes are single-line.

---

## When D2 loses

- **Interactive, in-browser diagrams with React custom nodes** — use ReactFlow (see `pma-draw`).
- **Free-form whiteboard sketches** — use Excalidraw.
- **Pixel-exact design mockups** — use Figma.
- **Massive graphs (thousands of nodes)** — use Graphviz or a dedicated graph layout tool; D2 renders the source but the result isn't readable.
- **Gantt charts / timelines** — D2 has no native gantt; use Mermaid or a gantt-specific tool.
- **Inherently 2D-positional diagrams** (e.g., chip floorplans) — D2's layout engine will fight you.

---

## D2 vs Mermaid

Both are text-to-diagram DSLs, both live in git. Pick:

- **D2** when:
  - You need containers with rich styling (classes, vars, fill-pattern).
  - You want crow's-foot ERDs, sequence diagrams, and architecture *in the same tool*.
  - The diagram will be viewed as a standalone SVG / PNG (not inline in Markdown).
- **Mermaid** when:
  - The diagram is inline in a GitHub Markdown file and you want GitHub's native render.
  - You want ubiquity over polish.
  - The diagram is small and you don't need styling knobs.

D2 looks dramatically better once you're past "three boxes and two arrows"; Mermaid is friendlier for the first three boxes.

---

## D2 vs ReactFlow (pma-draw)

- **D2** → static SVG/PNG. No interactivity. Best for docs, READMEs, static architecture references.
- **ReactFlow** → interactive React components. Zoom, pan, click, custom nodes, live data. Best for in-app diagrams, admin panels, live dashboards.

If the diagram lives in a doc site: D2.
If the diagram lives inside a running app: ReactFlow (use `pma-draw`).

---

## Level of detail

Match detail to audience:

| Audience | Detail level |
|---|---|
| **Executive / new team member** | 5–10 boxes, one layer of containers, no edge styles beyond direction |
| **Engineer onboarding to a subsystem** | 15–30 boxes, 2 layers of containers, semantic edge styles |
| **Debugging a specific incident** | Focused on one path, highlight failed edges with error class |
| **Architecture review** | Full system, but split into `layers:` — don't cram on one board |

When in doubt: one more diagram is better than one bigger diagram.

---

## Consistency rules for docs-wide use

When a project has many `.d2` files, define conventions once:

1. **Color palette** — pick 5–7 semantic colors and stick with them. Purple = database everywhere, never one-off.
2. **Shape map** — cylinder for DB, queue for MQ, cloud for external, person for user. Don't mix.
3. **Edge semantics** — solid for sync, dashed for async, red dashed for errors. Always.
4. **Direction** — pick `right` for architecture, `down` for flows; apply consistently.
5. **Naming** — lowercase_snake_case for IDs, Title Case for labels.

Encode these in a shared `styles.d2` file imported via `...@styles.d2` at the top of every diagram. One edit = the whole doc site retheme.

---

## Diagram review checklist (before shipping)

Ask each of these:

- Does every shape correspond to a real component? (isomorphism)
- Does every edge describe one specific relationship? (no composite edges)
- Is there one central question the diagram answers? (one concept)
- Could an engineer reproduce the system from this diagram alone? (completeness at the chosen level)
- Would a colleague recognize the shapes without a legend? (idiomatic)
- Is the edge style encoding something meaningful, or is it decoration? (semantics)
- Does the layout engine render it cleanly at default settings? (no manual layout hacks)
- Would a palette change require more than one edit? (should be classes + vars)

If any answer is no, revise before the file goes into git.

---

## Anti-patterns

- **Diagram as ER** — drawing the team's org chart as the architecture.
- **Diagram as wishlist** — including components that don't exist yet without marking them `style.opacity: 0.4` or using a separate scenario.
- **Legend-driven diagrams** — if you need a legend to explain ordinary shapes, you're not using semantic shapes.
- **Rendered once, never updated** — a diagram in git with a last-modified date three years old is worse than no diagram.
- **Massive god-diagram** — one `.d2` file trying to be everything; nobody reads it.
