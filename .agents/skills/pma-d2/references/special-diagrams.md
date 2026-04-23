# Special Diagrams Reference

Four D2 shape types have dedicated syntax and rendering: `sequence_diagram`, `sql_table`, `class`, and markdown/code/LaTeX blocks. Their rules differ from ordinary shapes — learn them once, reuse them.

---

## Sequence diagrams — `shape: sequence_diagram`

Container-level shape. Children become actors (lifelines); messages between them become spans.

```d2
oauth: OAuth 2.0 Authorization Code Flow {
  shape: sequence_diagram

  user: User
  browser: Browser
  client: Client App
  auth: Auth Server
  api: Resource API

  user -> browser: click "Sign in"
  browser -> client: GET /login
  client -> auth: redirect to /authorize
  auth -> browser: consent screen
  browser -> auth: POST /consent
  auth -> client: redirect w/ code
  client -> auth: POST /token (code)
  auth -> client: access_token + refresh_token
  client -> api: GET /me (Bearer)
  api -> client: 200 { profile }
  client -> browser: render dashboard
}
```

Rules:
- Actors render in declaration order, left-to-right.
- Each `a -> b: message` adds a message span.
- Chains (`a -> b -> c: ...`) become sequential messages.

### Self-messages

```d2
api -> api: validate token
```

Render as a loop-back arrow on the same actor.

### Groups (nested maps as groups)

```d2
oauth: {
  shape: sequence_diagram
  user; browser; client; auth

  auth_flow: Authorization phase {
    user -> browser -> client -> auth: initiate
    auth -> client: code
  }

  token_exchange: Token phase {
    client -> auth: POST /token
    auth -> client: access_token
  }
}
```

Each nested map becomes a labeled group box around its messages.

### Notes

```d2
oauth: {
  shape: sequence_diagram
  client; auth

  client -> auth: POST /token
  note_over_auth: auth {
    shape: text
    label: "Validates code,\nissues JWT"
  }
  auth -> client: access_token
}
```

Notes in D2 are just `text` shapes placed between messages — declaration order controls their vertical position.

### Ordering guarantees

Messages and groups are rendered **top-to-bottom in source order**. This makes sequence diagrams trivially diffable — reordering lines reorders the diagram.

### When to use sequence diagrams

- Protocol exchanges (OAuth, TLS handshake, distributed consensus rounds).
- API call flows across services.
- Timing-sensitive interactions where "before" vs "after" matters.

When **not** to:
- "Who calls whom" without ordering — use an architecture diagram.
- More than ~7 actors — becomes unreadable.

---

## ERDs — `shape: sql_table`

Relational tables with typed columns and foreign keys.

```d2
users: {
  shape: sql_table
  id: int {constraint: primary_key}
  email: varchar(255) {constraint: unique}
  created_at: timestamp
}

orders: {
  shape: sql_table
  id: int {constraint: primary_key}
  user_id: int {constraint: foreign_key}
  total: decimal(10,2)
  status: varchar(32)
}

orders.user_id -> users.id: fk
```

### Column syntax

Inside a `sql_table`, each line is `column_name: type`. Types are free-form text — use whatever your DDL uses (`uuid`, `jsonb`, `text`, `int4`, etc.).

### Constraints

```d2
orders: {
  shape: sql_table
  id: int {constraint: primary_key}
  user_id: int {constraint: foreign_key}
  sku: text {constraint: unique}
  email: text {constraint: [unique; not_null]}   # array for multiple
}
```

Built-in constraint strings: `primary_key`, `foreign_key`, `unique`, `not_null`. Other strings render as plain labels on the column.

### Foreign-key arrows — crow's foot idiom

```d2
orders.user_id -> users.id: {
  source-arrowhead: {shape: cf-many; label: "*"}
  target-arrowhead: {shape: cf-one-required; label: "1"}
}
```

Crow's-foot arrowheads (`cf-one`, `cf-one-required`, `cf-many`, `cf-many-required`) encode cardinality. Pair with labels `1`, `*`, `0..1` for clarity.

A class makes this reusable:

```d2
classes: {
  fk: {
    source-arrowhead: {shape: cf-many}
    target-arrowhead: {shape: cf-one-required}
  }
}

(orders.user_id -> users.id)[0].class: fk
(orders.sku -> products.sku)[0].class: fk
```

### Styling tables

`sql_table` bodies are fixed-white by design; only the **header band** recolors via `style.stroke`.

```d2
users: {
  shape: sql_table
  style.stroke: "#8b5cf6"          # purple header
  # columns…
}
```

Use the same stroke per logical "table group" (all user-tables purple, all order-tables orange).

### ERDs vs plain diagrams with DB shapes

- **ERD** = you want to see columns and foreign-key cardinality. Use `sql_table`.
- **High-level data flow** = you just want "there's a users DB". Use `shape: cylinder`.

---

## UML class — `shape: class`

```d2
Vehicle: {
  shape: class

  # fields (public by default)
  vin: string
  make: string
  model: string

  # methods — identified by parens
  start(): void
  stop(): void
  serialize(): json
}

Car: {
  shape: class
  # private / protected via prefix
  \#owner: string        # # prefix for private
  \+insured: bool        # + prefix for public (explicit)
  drive(dest: string): void
}

Car -> Vehicle: extends
```

### Visibility prefixes

Escape the special chars with `\`:

| Prefix | Visibility |
|---|---|
| `\+` | public |
| `\#` | protected |
| `\-` | private |
| `\~` | package |

### Relationships

Use arrowheads to encode UML semantics:

| Arrowhead | Meaning |
|---|---|
| `triangle` (hollow) | Inheritance — `target-arrowhead.shape: triangle` + `style.filled: false` |
| `diamond` (hollow) | Aggregation |
| `diamond` (filled) | Composition |
| `arrow` | Association / dependency |

```d2
Car -> Vehicle: {
  target-arrowhead.shape: triangle
  target-arrowhead.style.filled: false
}
```

### Styling

Same as `sql_table` — body white, header band colorable via `style.stroke`.

### When to pick `class` vs `sql_table`

- **`class`** — OO design, interfaces, types, method signatures.
- **`sql_table`** — relational columns, foreign keys, database schemas.

They look similar but communicate different things.

---

## Markdown inside shapes

Any label can be markdown:

```d2
note: {
  label: |md
    ## Key decisions

    1. Migrate to Postgres 16.
    2. Drop per-tenant schemas.
    3. Publish change in **#eng-announce**.
  |
}
```

The `|md ... |` fence switches the label to rendered markdown. Works in node labels, container labels, and edge labels.

### Escaping `|`

If your markdown contains a literal `|`, use a longer fence: `||md ... ||` or `|||md ... |||`.

---

## Code blocks inside shapes

```d2
handler: {
  shape: code
  language: go
  content: |go
    func Handle(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, "ok")
    }
  |
}
```

- `shape: code` renders the content as a monospace block with syntax highlighting.
- `language:` is optional; common values: `go`, `python`, `ts`, `js`, `rust`, `sql`, `bash`.
- Use sparingly — code shapes are tall. Prefer linking out for anything longer than ~15 lines.

---

## LaTeX blocks

```d2
equation: {
  shape: text
  label: |latex
    E = mc^2
  |
}
```

D2 renders LaTeX via KaTeX. Good for papers / academic diagrams; overkill elsewhere.

---

## Image shapes

Pure icons with no surrounding box:

```d2
github: {
  shape: image
  icon: https://icons.terrastruct.com/dev/github.svg
}

aws_lambda: {
  shape: image
  icon: https://icons.terrastruct.com/aws/Compute/AWS-Lambda_light-bg.svg
}
```

The `icon:` URL can be remote or a local path. For offline rendering, bundle with `d2 --bundle name.d2 name.svg` — D2 inlines referenced images.

---

## Choosing among special shapes

| If you want to show | Use |
|---|---|
| "A calls B, then B calls C" with time | `sequence_diagram` |
| "Table X has columns and FK to Y" | `sql_table` |
| "Class X extends Y, implements Z" | `class` |
| "Here's the exact code this component runs" | `shape: code` |
| "Here's a rendered doc / note" | `|md ... |` label |
| "Here's an equation" | `|latex ... |` label |
| "Just the logo, no box" | `shape: image` |

---

## Anti-patterns

- **Mixing `sequence_diagram` and regular nodes** in the same container — D2 treats the whole container as sequence; loose nodes break layout.
- **`sql_table` with 30 columns** — unreadable; split into logical sub-tables or hide non-key columns.
- **`class` shapes for data-only entities** — use `sql_table` instead.
- **Long markdown (>10 lines) in a node** — renders tall and squishes the rest of the diagram. Move to a separate note doc and link via `link:`.
- **LaTeX in every label** — performance cliff; reserve for actual math.
