# Core Syntax Reference

The minimum grammar needed to read and write D2 without surprises.

---

## Identifiers & Labels

A line of the form `key` creates a shape whose ID equals its label.

```d2
api              # ID "api", label "api"
web server       # ID "web server" (spaces OK), label "web server"
```

A line of the form `key: label` sets an explicit label (any unicode string).

```d2
api: API Gateway
api.svc: "gRPC (v1)"       # quotes let you include special chars
```

**Case is significant.** `API` and `api` are different IDs. Convention: lowercase with spaces for node IDs unless the label must be mixed-case.

**Reserved characters in bare IDs**: `{ } [ ] ( ) : ; # -> <- <-> -- / . & | *`. If any appear in a natural name, wrap the ID in quotes: `"v1.api".shape: cylinder`.

**Unicode is fine**. So is `\n` inside quoted strings to line-break labels: `svc: "write\nreplica"`.

---

## Maps (attribute blocks)

Curly braces attach attributes to a key.

```d2
db: {
  shape: cylinder
  label: Primary DB
  style.fill: "#f5f3ff"
}
```

Equivalent flat form:

```d2
db.shape: cylinder
db.label: Primary DB
db.style.fill: "#f5f3ff"
```

Use the flat form for one-line tweaks, the map form for ≥ 3 attributes on one node. Mix freely in the same file.

---

## Comments

```d2
# Single-line comment
""" block comment
spanning multiple lines
"""
```

Comments belong on decisions, not descriptions. Don't narrate what the next line obviously does.

---

## Nesting (container declaration)

A map that contains other shape declarations is a **container**.

```d2
aws: {
  api: API Gateway
  db: { shape: cylinder }
  api -> db
}
```

The container itself renders as a bordered box grouping its children. See `containers.md` for cross-container references and `_` (parent) syntax.

---

## Connections

Four operators; see `connections.md` for full details.

```d2
a -> b      # directed arrow
a <- b      # reversed
a <-> b     # bidirectional
a -- b      # line, no arrows
```

Chained form — one label applies to every segment:

```d2
frontend -> api -> db: reads
```

Connections implicitly declare their endpoints. Writing `a -> b` with no prior `a` or `b` creates both as default rectangles. Declare them first when you need a non-default shape.

---

## Style shorthand

`style.fill: "#eee"` on a line of its own equals a map entry:

```d2
# flat
x.style.fill: "#eee"

# map
x: { style.fill: "#eee" }

# deep map
x: {
  style: {
    fill: "#eee"
    stroke: "#333"
  }
}
```

Pick the form that minimizes repetition. Flat is better for scattered tweaks; map is better for clusters of style keys on one node.

---

## Escaping labels

- **Colon in a label**: quote the whole label — `svc: "url: /v1"`.
- **Brace in a label**: quote it — `cmd: "{ jq . }"`.
- **Markdown / HTML**: wrap with `|md ... |` block (see `special-diagrams.md`).
- **Literal backslash**: `"\\n"` for the two chars `\n`, `"\n"` for a newline.

---

## Variables (`vars:`)

Declared once at the top of a file and interpolated with `${name}`.

```d2
vars: {
  primary: "#0ea5e9"
  muted: "#64748b"
}

x.style.fill: ${primary}
y.style.fill: ${muted}
```

Special key `vars.d2-config` is read by the D2 compiler for theme / layout settings. See `vars.md`.

---

## Globs

Pattern match across the diagram.

```d2
*.shape: circle              # every top-level shape
**.style.fill: lightyellow   # every shape at any depth
***.shape: oval              # every shape, even in layers / imports
service*.class: svc          # every top-level shape whose ID starts with "service"
```

Use globs for classes and for defensive styling ("all databases get a stroke color"). Don't use them to hide complex per-node styling — name-based rules outlast their authors longer than glob rules do.

See `classes.md` for the common "glob + class" pattern.

---

## Order matters (for duplicate keys)

Later declarations win.

```d2
x.style.fill: red
x.style.fill: blue     # x ends up blue
```

Globs and class applications follow the same "last write wins" rule, which is why you put container-specific styling after a global glob.

---

## Whitespace & indentation

- 2-space indent inside maps. The compiler doesn't care; readers do.
- One blank line between top-level blocks.
- No trailing whitespace; file ends with `\n`.

A consistent file diffs cleanly and is grep-friendly — a core reason to use D2 over a binary diagram format in the first place.

---

## Minimum viable file

```d2
direction: right
user -> web -> api -> db
db.shape: cylinder
```

Four lines, renders to a usable architecture diagram. Start here, add structure as the concept demands.
