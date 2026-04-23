# Validation Reference

Before handing a `.d2` file to the user, run it through this checklist. D2 parses loose input silently (typos become rectangles, bad paths silently fail), so manual validation is worth more than a parse-pass.

---

## Pre-flight checklist

Walk every section of the file and verify:

### 1. Header

- [ ] `vars.d2-config` block present with `theme-id`, and `layout-engine` if non-default.
- [ ] If `layout-engine: tala`, a comment in the file notes it requires a paid install.
- [ ] `direction:` set explicitly at the root.

### 2. Shapes

- [ ] Every `shape:` value appears in `shapes.md`. No typos (`databse`, `cylindar`).
- [ ] Shape matches the concept (cylinder for DB, queue for MQ, cloud for external, person for user).
- [ ] No shapes default to `rectangle` accidentally — rectangles should be a choice, not a leftover.
- [ ] `shape: sequence_diagram`, `sql_table`, `class` only at container level with correct child syntax.

### 3. Containers

- [ ] Containers are used for **semantic groups** (service, cloud, bounded context), not cosmetic grouping.
- [ ] No container has exactly one child (flatten it).
- [ ] Nesting depth ≤ 3 levels, or each level carries distinct meaning.
- [ ] Cross-container edges use correct dotted paths (verify each path resolves).

### 4. Connections

- [ ] Every edge describes one specific relationship — no composite arrows.
- [ ] Edge direction (`->` vs `<->` vs `--`) matches reality.
- [ ] Chains (`a -> b -> c`) only when every segment shares the same semantics / label.
- [ ] Edge style encodes meaning (solid/dashed/animated/color) — no decoration.

### 5. Classes

- [ ] If a style pattern repeats ≥ 2 times, it's a class.
- [ ] Class names are semantic (`database`, not `purple`).
- [ ] No inline styles that duplicate a class (unless intentionally overriding).

### 6. Styling

- [ ] All colors come from `vars.color.*` or the `classes:` block — no scattered hex values.
- [ ] No gradients on small shapes.
- [ ] No `animated: true` on every edge.
- [ ] Hex values quoted (`"#abc123"`, not `#abc123` — the latter is a comment).

### 7. Labels

- [ ] Edge labels carry a verb (`reads`, `publishes`, `authenticates`); boring edges left unlabeled.
- [ ] Markdown labels (`|md ... |`) don't exceed ~10 lines.
- [ ] No labels contain live identifiers from code (e.g., actual hostnames) if the diagram will be public.

### 8. Composition

- [ ] If using `layers:`, each layer answers a distinct question.
- [ ] If using `scenarios:`, each scenario only contains *deltas* from the baseline.
- [ ] If using `steps:`, each step genuinely adds content (no cosmetic-only steps).
- [ ] Imports (`@file`, `...@file`) use correct relative paths.

### 9. File hygiene

- [ ] 2-space indentation throughout.
- [ ] No trailing whitespace.
- [ ] File ends with a newline.
- [ ] Comments (`#`) explain *why*, not *what*.
- [ ] UTF-8 encoding (BOM will break the parser).

---

## Common D2 mistakes (silent failures)

D2 errors tend to be silent — it renders *something*, just not what you meant. Watch for these:

### Shape typos fall back to rectangle

```d2
# BUG
db.shape: cylindar           # typo → renders as rectangle, no warning

# FIX
db.shape: cylinder
```

Prevention: put shape into a class (`classes.db.shape: cylinder`). Typo there fires once visibly.

### Unquoted hex becomes a comment

```d2
# BUG
x.style.fill: #f5f3ff          # parsed as comment — no fill applied

# FIX
x.style.fill: "#f5f3ff"
```

### Edge class applied to node

```d2
# BUG
x -> y.class: async            # applies to node y, not the edge

# FIX
(x -> y)[0].class: async
```

### Dotted path to nonexistent node creates it silently

```d2
# BUG (if `db` isn't declared in aws)
aws.api -> aws.db              # silently creates aws.db as an empty rectangle

# FIX — declare first
aws: {
  api
  db.shape: cylinder
  api -> db
}
```

### Container direction under dagre is ignored

```d2
# BUG (dagre flattens child direction)
direction: down
aws: {
  direction: right             # ignored by dagre
  api -> db
}

# FIX — use elk
vars.d2-config.layout-engine: elk
```

### Array separator `,` vs `;`

```d2
# BUG
x.class: [base, critical]      # comma — parse error

# FIX
x.class: [base; critical]
```

### Spread import brings only shapes, not vars

```d2
# BUG — vars in shared.d2 not visible here
...@shared.d2
x.style.fill: ${color.primary}   # ${color.primary} undefined if shared.d2 has layers/scenarios
```

Prevention: keep `vars:` / `classes:` in dedicated "tokens" files without `layers:` / `scenarios:`.

### Unknown style keys silently ignored

```d2
# BUG — D2 has no `style.color`; the fill stays default
x.style.color: "#ff0000"

# FIX — use `fill` / `stroke` / `font-color`
x.style.font-color: "#ff0000"
```

Keep `styles.md` open while reviewing — unknown keys are the single most common silent failure.

### `near:` vs `label.near:` confusion

```d2
# These do different things
title.near: top-center            # places shape on canvas
title.label.near: top-center      # places shape's label relative to shape
```

### `<->` arrow where `->` is correct

```d2
# BUG — double-arrow implies symmetric relationship
client <-> server                 # if client initiates and server responds, this is wrong

# FIX
client -> server                  # request
client <- server: response        # or make the response explicit
```

### `_` parent ref at root is a no-op

```d2
# BUG — silently does nothing
_.foo.style.fill: red             # at root level, `_` is nothing

# FIX — use direct path
foo.style.fill: red
```

---

## Parser-level verification (optional but cheap)

If the user has `d2` installed, suggest a parse dry-run:

```sh
d2 --dry-run input.d2        # exits 0 if parses; non-zero on error
```

Dry-run catches structural errors (unclosed braces, invalid tokens) but **not** semantic ones (wrong shape, bad relationship). The checklist above is still necessary.

For live iteration:

```sh
d2 --watch input.d2          # opens browser, live-reloads on save
```

---

## Review-by-reading

After the checklist, read the file top to bottom out loud. If any line requires an explanation that isn't already in the diagram or a comment, the diagram is incomplete.

A second test: open the source in a text editor and ask "does a reader who doesn't know the system *and* can't run D2 get the shape of the architecture just from the IDs, containers, and edges?". Indentation alone should convey most of the structure.

---

## Handoff statement (what to tell the user)

When returning a finished `.d2` file, tell the user:

1. **Path** — where the file lives (default `docs/architecture/<name>.d2`).
2. **Render command** — `d2 <name>.d2 <name>.svg` (or PNG / PDF / GIF as appropriate).
3. **Layout engine** — mention if non-default (`--layout=elk` or `--layout=tala`).
4. **Theme** — if you set a specific `theme-id`, note which one.
5. **External assets** — if the diagram references icons by URL, note whether they need mirroring internally (use `d2 --bundle` to inline).
6. **Follow-up diagrams** — if the concept would benefit from additional views (deployment, sequence, ERD), suggest them.

Example:

> Saved as `docs/architecture/order-service.d2`. Render with
> `d2 --layout=elk docs/architecture/order-service.d2 docs/architecture/order-service.svg`.
> Uses theme 0 (neutral) + dark theme 200 for light/dark. Icons pulled from
> `icons.terrastruct.com`; run with `d2 --bundle` if you need offline rendering.
> Consider a follow-up sequence diagram for the checkout flow.
