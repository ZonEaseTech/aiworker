# Vars Reference

`vars:` is D2's single source of truth for variables, theme config, and design tokens. One well-organized `vars:` block at the top of the file is the difference between "palette change = 40 edits" and "palette change = 1 line".

---

## Basic syntax

```d2
vars: {
  primary-color: "#3b82f6"
  danger-color: "#dc2626"
  emphasis-border-width: 3
}

api.style.fill: ${primary-color}
db.style.stroke: ${danger-color}
critical.style.stroke-width: ${emphasis-border-width}
```

- Declared under a top-level `vars:` map.
- Referenced as `${name}`.
- Values can be strings, numbers, or nested maps.
- Substitution happens at parse time — no runtime computation.

---

## Nested vars

Group related variables:

```d2
vars: {
  palette: {
    frontend: "#eff6ff"
    backend: "#ecfdf5"
    database: "#f5f3ff"
  }
  strokes: {
    frontend: "#3b82f6"
    backend: "#10b981"
    database: "#8b5cf6"
  }
}

classes: {
  frontend: {
    style.fill: ${palette.frontend}
    style.stroke: ${strokes.frontend}
  }
}
```

Dotted access mirrors container dotted paths.

---

## `d2-config` — renderer & theme settings

`vars.d2-config` is a reserved block D2 reads to configure rendering.

```d2
vars: {
  d2-config: {
    theme-id: 1                 # light theme ID
    dark-theme-id: 200          # dark theme ID
    sketch: false               # hand-drawn look when true
    pad: 100                    # canvas padding, px
    center: true                # center diagram in viewport
    layout-engine: elk          # dagre | elk | tala
  }
}
```

### Theme IDs (light)

| ID | Name |
|---|---|
| 0 | Neutral default |
| 1 | Neutral gray |
| 3 | Flagship terrastruct |
| 4 | Cool classics |
| 5 | Mixed berry blue |
| 6 | Grape soda |
| 7 | Aubergine |
| 8 | Colorblind clear |
| 100 | Shallow sea |
| 101 | Dark mauve |
| 102 | Dark flagship terrastruct |

### Theme IDs (dark)

| ID | Name |
|---|---|
| 200 | Dark mauve |
| 201 | Dark flagship |

Pair one of each for light/dark switching: `theme-id: 0` + `dark-theme-id: 200`.

### sketch mode

```d2
vars.d2-config.sketch: true
```

Hand-drawn look — useful for brainstorming diagrams, whiteboard vibes. Tone-down for production docs.

---

## Layout engine config

```d2
vars.d2-config.layout-engine: tala
```

- `dagre` (default, bundled)
- `elk` (bundled since v0.7)
- `tala` (paid, must be installed: https://d2lang.com/tour/tala)

See `layouts.md` for when to pick which.

---

## Design-token pattern

A common layout for production `.d2` files:

```d2
vars: {
  d2-config: {
    theme-id: 0
    dark-theme-id: 200
    pad: 80
  }

  color: {
    frontend: "#eff6ff"
    backend: "#ecfdf5"
    database: "#f5f3ff"
    cache: "#fef2f2"
    queue: "#fefce8"
    error: "#dc2626"
    async: "#06b6d4"
  }

  stroke: {
    frontend: "#3b82f6"
    backend: "#10b981"
    database: "#8b5cf6"
    cache: "#ef4444"
    queue: "#eab308"
  }

  size: {
    body: 14
    title: 24
  }
}

classes: {
  frontend: {
    style: {
      fill: ${color.frontend}
      stroke: ${stroke.frontend}
      font-size: ${size.body}
    }
  }
  backend: {
    style: {
      fill: ${color.backend}
      stroke: ${stroke.backend}
      font-size: ${size.body}
    }
  }
  db: {
    shape: cylinder
    style: {
      fill: ${color.database}
      stroke: ${stroke.database}
      font-size: ${size.body}
    }
  }
  cache: {
    shape: stored_data
    style: {
      fill: ${color.cache}
      stroke: ${stroke.cache}
    }
  }
  async: {
    style: {
      stroke: ${color.async}
      stroke-dash: 4
      animated: true
    }
  }
  error: {
    style: {
      stroke: ${color.error}
      stroke-dash: 2
    }
  }
}

direction: right

# …the actual diagram
user.shape: person
frontend: {
  web.class: frontend
}
backend: {
  api.class: backend
  worker.class: backend
}
data: {
  primary.class: db
  cache.class: cache
}

user -> frontend.web -> backend.api
backend.api -> data.primary
backend.api -> data.cache
(backend.api -> backend.worker)[0].class: async
```

Change `${color.frontend}` in one place → every frontend node retints. This is the idiomatic "theme the diagram once" pattern.

---

## Vars in sub-containers

Vars declared at the root are visible everywhere. Vars declared inside a container are local to that container.

```d2
vars: {
  global-bg: "#f9fafb"
}

aws: {
  vars: {
    aws-color: "#f97316"
  }
  style.fill: ${aws-color}

  api.style.fill: ${global-bg}    # root var visible here
}

# ${aws-color} is NOT visible at the root level
```

Keep vars at root unless you genuinely need container-scoped design tokens (rare).

---

## Vars can't be computed

D2's `${...}` is pure text substitution — no arithmetic, no conditionals, no concatenation at reference time.

```d2
vars.base: 10
# NOT allowed: x.style.stroke-width: ${base} + 2
```

If you need derived values, declare each one explicitly:

```d2
vars: {
  thin: 1
  medium: 2
  thick: 4
}
```

---

## Vars with shape / class / style values

Vars can hold more than colors — any value slot works.

```d2
vars: {
  default-shape: cylinder
  default-stroke-width: 2
}

db1.shape: ${default-shape}
db2.shape: ${default-shape}
edge.style.stroke-width: ${default-stroke-width}
```

For entire style bundles, prefer `classes:` — vars are for scalars.

---

## Environment overrides

D2 supports environment-driven vars via `--var`:

```sh
d2 --var=theme-id=5 architecture.d2 architecture.svg
```

This overrides `vars.d2-config.theme-id` at render time without editing the file. Useful for CI pipelines that publish light and dark variants from the same source.

---

## Anti-patterns

- **Hardcoded hex scattered through the file** — convert to `vars.color.*` the moment you see two uses.
- **Vars for one-off values** — if a color appears exactly once, inline it; vars are overhead for singletons.
- **Deep nesting (`vars.ui.theme.light.palette.primary`)** — flatten to `vars.color.primary`; the grouping isn't worth the typing.
- **Naming vars after appearance (`vars.blue-1`)** — semantic names (`vars.color.frontend`) survive palette changes.
- **Using vars for values that should be classes** — if you're repeating `style: {fill: ${x}; stroke: ${y}}` you want a class, not three vars.
- **Expecting var interpolation in markdown labels** — `${}` only works in attribute values, not inside `|md ... |` blocks.
