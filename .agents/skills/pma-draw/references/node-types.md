# Node Type Catalog

Predefined `type` values for nodes. pma-viewer ships a matching custom component for each. Every type declares its `data` contract (required + optional fields), default handles, and the color palette slot it pulls from `colors.md`.

**Rule**: always pick a type from this catalog. Do not invent new types unless the user asks and pma-viewer is extended to support them.

---

## Categories

| Category | Purpose |
|----------|---------|
| Semantic | Domain components with type-specific color + icon |
| Structural | Layout / organization primitives (group, marker, title, divider) |
| Evidence | Concrete content (code snippets, JSON payloads, UI mockups) |
| Utility | Generic shapes for simple / conceptual diagrams |

---

## Semantic Nodes

All semantic nodes share a common `data` contract:

```ts
{
  label: string              // primary text
  subtitle?: string          // secondary text, smaller font
  icon?: string              // override the type's default icon (lucide name)
  badges?: string[]          // small tags: version, tech, status
  href?: string              // clickable link (docs, repo)
  dimmed?: boolean           // reduced emphasis (use for context-only nodes)
}
```

Default `sourcePosition: "right"`, `targetPosition: "left"` — override per layout.

| Type | Palette Slot | Default Icon | Use For |
|------|--------------|--------------|---------|
| `frontend` | Frontend / UI | `monitor` | React/Vue/Next web apps, mobile clients |
| `backend` | Backend / API | `server` | Express, FastAPI, Spring, Rails |
| `database` | Database | `database` | Postgres, MySQL, Mongo, DynamoDB |
| `storage` | Storage | `hard-drive` | S3, GCS, Blob, file systems |
| `cache` | Cache | `zap` | Redis, Memcached, in-memory stores |
| `queue` | Message Queue | `layers` | Kafka, RabbitMQ, SQS, NATS |
| `ai` | AI / ML | `brain` | LLMs, embeddings, model servers, Vertex, Bedrock |
| `external` | External API | `globe` | Stripe, Twilio, OAuth providers |
| `orchestrator` | Orchestration / Hub | `git-merge` | Temporal, Airflow, Cloud Workflows, schedulers |
| `decision` | Decision / Validator | `split` | Router, feature flag, policy check. Solid border, dashed inner accent. |
| `user` | User / Actor | `user-round` | End user, admin, external actor (ellipse shape) |
| `monitoring` | Monitoring | `activity` | Prometheus, Grafana, OpenTelemetry collectors |
| `security` | Network / Security | `shield` | IAM, WAF, KMS, auth gateways |

Semantic nodes auto-render with:
- Icon on the left (from lucide-react)
- Bold label + lighter subtitle below
- Badges as small pill tags across the bottom
- Background + border color from the `colors.md` slot

---

## Structural Nodes

### `group`

Parent container for hierarchical grouping. Always declared **before** its children.

```json
{
  "id": "group__backend",
  "type": "group",
  "position": { "x": 200, "y": 200 },
  "style": { "width": 600, "height": 400 },
  "data": {
    "label": "Backend Tier",
    "color": "backend",
    "dashed": true
  }
}
```

`data` contract:
- `label` (string) — shown at top-left of the group
- `color` (string, optional) — palette slot name for border color. Default `neutral`.
- `dashed` (boolean, optional) — dashed border. Default `true`.

### `title`

Free-floating section heading, bold large typography, transparent background.

```json
{
  "id": "title__overview",
  "type": "title",
  "position": { "x": 100, "y": 40 },
  "data": { "text": "System Architecture", "level": 1 }
}
```

- `text` (string, required)
- `level` (1 | 2 | 3) — controls font size / weight

### `note`

Free-floating annotation text. No border, light background, small font.

```json
{
  "id": "note__scaling",
  "type": "note",
  "position": { "x": 720, "y": 460 },
  "data": { "text": "Scales to ~10k RPS with HPA enabled." }
}
```

### `marker`

Small dot used as a timeline anchor or bullet point. No label — use a `note` nearby instead.

```json
{
  "id": "marker__t1",
  "type": "marker",
  "position": { "x": 300, "y": 500 },
  "data": { "color": "primary", "size": 12 }
}
```

### `divider`

Horizontal or vertical thin line, dashed or solid. Non-interactive.

```json
{
  "id": "divider__phases",
  "type": "divider",
  "position": { "x": 100, "y": 420 },
  "data": { "orientation": "horizontal", "length": 1000, "dashed": true }
}
```

---

## Evidence Nodes

For comprehensive / technical diagrams. Dark background, monospaced content.

### `evidence-code`

```json
{
  "id": "evidence__subscribe",
  "type": "evidence-code",
  "position": { "x": 200, "y": 700 },
  "data": {
    "language": "javascript",
    "title": "Subscribe to run events",
    "code": "agui.subscribe('RUN_STARTED', (e) => render(e))"
  }
}
```

- `language` (e.g. `"typescript"`, `"python"`, `"bash"`) — drives syntax highlighting
- `title` (optional) — header row
- `code` (string, required) — full snippet, `\n`-separated

### `evidence-json`

```json
{
  "id": "evidence__event",
  "type": "evidence-json",
  "position": { "x": 600, "y": 700 },
  "data": {
    "title": "STATE_DELTA event",
    "json": "{\n  \"type\": \"STATE_DELTA\",\n  \"path\": \"/cart/items\",\n  \"op\": \"append\"\n}"
  }
}
```

Green text on dark background. `title` optional.

### `evidence-ui`

Mockup showing actual UI composition. Nested `data.elements` render as stacked rectangles with labels.

```json
{
  "id": "evidence__dashboard",
  "type": "evidence-ui",
  "position": { "x": 900, "y": 700 },
  "data": {
    "title": "Dashboard",
    "elements": [
      { "kind": "header", "text": "Sales — Q4" },
      { "kind": "chart", "text": "Line chart (12mo)" },
      { "kind": "table", "text": "Top accounts" }
    ]
  }
}
```

---

## Utility Nodes (simple diagrams)

For conceptual / abstract diagrams where semantic typing is overkill.

| Type | Shape | Use For |
|------|-------|---------|
| `process` | Rectangle | Generic action / step |
| `start` | Ellipse | Entry point / trigger |
| `end` | Ellipse | Exit / result |
| `io` | Parallelogram | Input / output data reference |

`data` contract: `{ label: string, subtitle?: string }`.

---

## Handle Conventions

Most nodes expose single handles on each side via `sourcePosition` / `targetPosition`. Some custom types expose named handles:

| Type | Named Handles | Usage |
|------|---------------|-------|
| `decision` | `yes`, `no` (on bottom) | Route based on condition |
| `orchestrator` | `out-1` … `out-N` (on bottom), `in` (on top) | Fan-out to multiple workers |
| `queue` | `in` (left), `out` (right) | Producer / consumer directionality |

When using named handles, edges must set `sourceHandle` / `targetHandle` explicitly:

```json
{
  "id": "edge__decide-yes",
  "source": "route-decide",
  "sourceHandle": "yes",
  "target": "success-branch",
  "type": "flow"
}
```

---

## Picking a Type

```
Is it a real technical component?
├── yes → pick the matching semantic type
│         (frontend / backend / database / cache / queue / ai / external / ...)
└── no  → is it organizing other nodes?
          ├── yes → group (parent-child) or divider
          └── no  → is it teaching with real content?
                    ├── yes → evidence-code / evidence-json / evidence-ui
                    └── no  → utility (process / start / end / io)
```
