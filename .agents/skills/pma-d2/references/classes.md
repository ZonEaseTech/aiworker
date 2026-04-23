# Classes Reference

Classes are D2's native mechanism for reusable styling. They replace ad-hoc per-node copy-paste and give one place to change a convention.

---

## Declare

`classes:` is a top-level map. Each entry is a style bundle.

```d2
classes: {
  db: {
    shape: cylinder
    style: {
      fill: "#f5f3ff"
      stroke: "#8b5cf6"
    }
  }
  async: {
    style: {
      stroke-dash: 4
      animated: true
      stroke: "#06b6d4"
    }
  }
}
```

A class can set any property a shape or edge can — `shape`, `icon`, `width`, `height`, `style.*`, `source-arrowhead`, `target-arrowhead`, etc.

---

## Apply by name

`.class: name` on a shape or edge:

```d2
orders.class: db
users.class: db
payments.class: db

(web -> api)[0].class: async
```

Edge classes need the indexed form `(src -> dst)[0]` because there can be multiple edges between the same pair.

---

## Multi-class

An array applies all classes in order. Later classes override earlier ones on conflicting keys.

```d2
classes: {
  base: { style.font-size: 14 }
  large: { width: 220 }
  critical: { style.stroke: "#dc2626" }
}

payment_gateway.class: [base; large; critical]
```

Arrays use `;` as separator inside D2.

---

## Apply by glob

Classes pair naturally with globs — you write the matcher once and the class handles the styling.

```d2
# Every node whose ID ends with "_db"
*_db.class: db

# Every shape at any depth under "aws"
aws.**.class: aws-service

# Every shape in the file
**.class: base
```

Globs + classes is the preferred pattern for large diagrams: one declaration covers every current and future matching node.

---

## Order of precedence

Later writes win. If a class sets `style.fill: red` and a later line writes `x.style.fill: blue`, `x` ends up blue.

```d2
classes: {
  db: { style.fill: "#f5f3ff" }
}
orders.class: db
orders.style.fill: "#ecfdf5"   # overrides the class
```

Use direct overrides sparingly — if a node disagrees with its class, either the class is wrong or the node needs a different class.

---

## Recommended class vocabulary

Starter set for most architecture diagrams:

```d2
classes: {
  # Semantic node types
  frontend: { style: { fill: "#eff6ff"; stroke: "#3b82f6" } }
  backend:  { style: { fill: "#ecfdf5"; stroke: "#10b981" } }
  database: { shape: cylinder; style: { fill: "#f5f3ff"; stroke: "#8b5cf6" } }
  cache:    { shape: stored_data; style: { fill: "#fef2f2"; stroke: "#ef4444" } }
  queue:    { shape: queue; style: { fill: "#fefce8"; stroke: "#eab308" } }
  external: { shape: cloud; style: { fill: "#f1f5f9"; stroke: "#64748b" } }
  user:     { shape: person; style: { fill: "#f0fdf4"; stroke: "#22c55e" } }

  # Edge semantics
  sync:     { style.stroke: "#64748b" }
  async:    { style.stroke: "#06b6d4"; style.stroke-dash: 4; style.animated: true }
  error:    { style.stroke: "#dc2626"; style.stroke-dash: 2 }
  deprecated: { style.opacity: 0.4 }
}
```

Drop this block at the top of the file; apply via `.class:` or glob. Change one line here, the whole diagram shifts.

---

## Class vs inline style — when to pick which

Use a class when:
- The styling recurs on ≥ 2 nodes.
- The styling encodes a semantic ("this is a database").
- The styling might evolve (color palette, dash length).

Use inline style when:
- The styling is unique to one node.
- It's a one-off emphasis (highlight the bug node in an incident diagram).
- It overrides a class locally.

Rule of thumb: if you catch yourself copy-pasting `style.fill: "#xxxxxx"` twice, convert to a class on the third.

---

## Naming classes

- lowercase, kebab-case.
- semantic names (`database`, `async`, `critical`), not appearance names (`purple`, `dashed`).
- short — they'll appear on every node that uses them.

Semantic names survive redesign. `purple` becomes confusing when you switch the palette; `database` doesn't.

---

## Common gotchas

- **Array separator** — inside a D2 array the separator is `;`, not `,`.
- **Class on an edge without index** — `x -> y.class: async` applies to the `y` node, not the edge. Use `(x -> y)[0].class: async`.
- **Class doesn't inherit into nested containers** by default — apply globs (`container.**.class: foo`) if you want every child to get the class.
- **Class setting `shape: cylinder` applied to an edge** — edges ignore shape, no error, no effect. Don't mix shape-classes and edge-classes.
