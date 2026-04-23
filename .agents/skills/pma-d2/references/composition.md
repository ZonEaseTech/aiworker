# Composition Reference

D2 composes multiple diagrams — or multiple *views* of one diagram — via `layers:`, `scenarios:`, `steps:`, and file imports. This is how you tell a story without cramming every nuance into one board.

---

## Three composition primitives at a glance

| Primitive | Inheritance | Use for |
|---|---|---|
| `layers:` | **No** — each layer is isolated | Unrelated views (architecture + deployment + sequence) |
| `scenarios:` | **Yes** — inherits parent, overrides only deltas | Before/after, with-failure, alternative paths |
| `steps:` | **Yes** — each step inherits the previous step | Animated walk-through of a flow |

All three produce multi-board SVGs. The D2 renderer emits one SVG per board, plus a navigator; the playground and `d2 --watch` let the user click through.

---

## `layers:` — multiple isolated boards

```d2
# root board — shown by default
title: System overview {
  shape: text
  near: top-center
}
web -> api -> db

layers: {
  deployment: {
    title: Deployment view {
      shape: text
      near: top-center
    }
    k8s_cluster: Cluster {
      grid-rows: 2
      pod1; pod2; pod3; pod4
    }
  }

  runtime: {
    title: Runtime sequence {
      shape: text
      near: top-center
    }
    seq: {
      shape: sequence_diagram
      user; web; api; db
      user -> web -> api -> db
      db -> api -> web: result
    }
  }
}
```

- Each key under `layers:` is an independent board.
- Names become navigator entries.
- The root board is the default view.
- Layers **do not inherit** from the root — every layer is a fresh namespace.

### When to use

- Three different views of the same system (architecture + deployment + data flow).
- A presentation-style deck: one board per "slide".

### When not to

- If views share 80%+ of nodes, use `scenarios:` — layers duplicate the shared content.

---

## `scenarios:` — inherit + override

```d2
# Base scenario (default view)
user -> web -> api -> db

scenarios: {
  db_down: {
    db.style.fill: "#fee2e2"
    db.style.stroke: "#dc2626"
    (api -> db)[0].style.stroke: "#dc2626"
    (api -> db)[0].style.stroke-dash: 2

    fallback: Read-only cache {
      shape: stored_data
      style.fill: "#fefce8"
    }
    api -> fallback: degrade
  }

  high_load: {
    worker_2; worker_3
    api -> worker_2
    api -> worker_3
  }
}
```

- Each scenario **starts from the root board** and applies its deltas.
- A scenario can add nodes, override styles, add or re-style edges.
- Scenarios cannot remove nodes directly — use `style.opacity: 0` as a workaround.

### When to use

- Before/after (before-refactor, after-refactor).
- Failure modes (db-down, region-failover, rate-limited).
- Alternate paths (logged-in vs anonymous).

---

## `steps:` — animated walk-through

```d2
# Starting state
start.shape: circle
end.shape: oval

steps: {
  s1: Request arrives {
    request.shape: document
    request -> api
  }
  s2: Validate token {
    api -> auth: verify
    auth -> api: valid
  }
  s3: Fetch data {
    api -> db: SELECT
    db -> api: rows
  }
  s4: Respond {
    api -> client: 200 OK
  }
}
```

- Each step **inherits everything from the previous step**.
- Every step is rendered as a separate frame.
- `d2 --animate-interval=1500 name.d2 name.gif` produces an animated GIF with 1.5s per frame.

### When to use

- Tutorials: "first, A happens; then B; then C".
- Request lifecycle walkthroughs.
- Algorithm animations (for short steps, not 30-frame walks).

### Constraints

- Content only grows (you can't undo a previous step's node).
- Use a sibling style override to "dim" nodes that aren't active in this step (`opacity: 0.3`).

---

## Nesting

Layers, scenarios, and steps can be nested:

```d2
layers: {
  architecture: {
    web -> api -> db

    scenarios: {
      failure: {
        (api -> db)[0].style.stroke: "#dc2626"
      }
    }
  }

  deployment: {
    # separate board
  }
}
```

Navigator shows `architecture` → `failure` as a nested entry.

Keep nesting to 2 levels max — deeper navigation becomes unusable.

---

## File imports — `@file`

Split a large diagram across multiple files; stitch them with `@`.

```d2
# main.d2
users -> @services/aws.d2
users -> @services/gcp.d2
```

```d2
# services/aws.d2 — contents become the "aws" node's expansion
api.shape: rectangle
db.shape: cylinder
api -> db
```

Rules:
- The import becomes a **container** named after the import key (`aws` in the example).
- Imported files are standalone `.d2` files — they can be opened and rendered on their own.
- Relative paths are relative to the importing file.

### Import scope

- Only shapes and edges are imported — not `vars`, `layers`, `scenarios`, `steps`, `d2-config`.
- Root-level `direction:` in the imported file is ignored in the importing context.

### Use cases

- Team-owned slices: `@teams/payments.d2`, `@teams/auth.d2`.
- Reusable blocks: a standard "aws account" template imported into multiple diagrams.
- Size: keep single files below ~200 lines; split when you hit that.

---

## Spread imports — `...@file`

Spread *inlines* an imported file's content instead of wrapping it in a container.

```d2
# main.d2
...@common-styles.d2     # paste the contents verbatim here

web -> api -> db
```

```d2
# common-styles.d2
classes: {
  db: {shape: cylinder; style.fill: "#f5f3ff"}
  frontend: {style.fill: "#eff6ff"}
}
```

Use for:
- Shared `classes:` and `vars:` across diagrams.
- Boilerplate header (theme config, direction, palette).

### Vs `@file`

| | `@file` | `...@file` |
|---|---|---|
| Wraps in container | yes | no |
| Brings vars/classes into scope | no | yes |
| Use for | adding a subsystem | sharing styling / config |

---

## Composing scenarios with imports

A scenario can import additional file content:

```d2
web -> api

scenarios: {
  with_analytics: {
    ...@extras/analytics.d2
    api -> analytics_pipeline
  }
}
```

Layered power: a baseline diagram + bolt-on files for different variants.

---

## Recipes

### Before / after refactor

```d2
# Shared baseline
user -> monolith -> db

scenarios: {
  after: {
    # replace monolith with two services
    monolith.style.opacity: 0    # hide
    api: {style.fill: "#ecfdf5"}
    worker: {style.fill: "#ecfdf5"}
    user -> api
    api -> worker
    api -> db
    worker -> db
  }
}
```

### Animated request lifecycle

```d2
direction: right
client.shape: person
api.shape: rectangle
auth.shape: rectangle
db.shape: cylinder
cache.shape: stored_data

steps: {
  s1: Client requests {
    client -> api
  }
  s2: API checks cache {
    api -> cache: GET
    cache -> api: MISS
  }
  s3: Auth verifies {
    api -> auth: verify token
    auth -> api: ok
  }
  s4: DB read + cache write {
    api -> db
    db -> api: rows
    api -> cache: SET
  }
  s5: Respond {
    api -> client: 200
  }
}
```

Render:
```
d2 --animate-interval=1500 lifecycle.d2 lifecycle.gif
```

### Multi-view architecture deck

```d2
# main.d2
layers: {
  overview: {...@views/overview.d2}
  aws: {...@views/aws.d2}
  gcp: {...@views/gcp.d2}
  sequence: {...@views/auth-sequence.d2}
  erd: {...@views/erd.d2}
}
```

Each `views/*.d2` is renderable standalone; combined they form a navigable deck.

---

## Anti-patterns

- **Using `layers:` when `scenarios:` is the right tool** — duplicating 80% of a diagram to show one variant wastes maintenance.
- **Using `scenarios:` when `layers:` is the right tool** — tangling unrelated views into a single inheritance tree.
- **Too many steps** (>8) — viewer fatigue; split into separate animated diagrams.
- **Deeply nested layers / scenarios** — navigation becomes unusable past 2 levels.
- **Spread-importing a file with `layers:` inside** — composition primitives don't stack through spread.
- **Forgetting the imported file's path is relative** — breaks when the importing file moves.
