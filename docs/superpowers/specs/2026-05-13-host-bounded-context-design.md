# Host bounded context design

## Decision

Keep API, CLI and Web as separate delivery adapters, but make Host a first-class
core boundary. The Host is not a fourth UI surface; it is the shared use-case
layer that owns Host/Soul App invariants.

## Shape

`packages/core` will expose a Host runtime facade. It wraps existing Soul App
registry and local worker runtime primitives into product-level operations:

- list, show, install, enable, disable and healthcheck Host Soul Apps;
- bootstrap first-party official Soul Apps and discard legacy built-in Soul
  metadata through one operation;
- project the Host catalog into app-projected Souls and capability templates;
- create Soul workers only from available app-projected Souls;
- create worker runtimes with the correct workspace root;
- validate worker/template ownership and enrich session metadata from the same
  Host catalog.

API keeps Hono routes, authentication, streaming, settings, mounted services and
HTTP response shaping. CLI keeps command parsing, daemon process lifecycle and
JSON output. Web keeps consuming API state. The shared Host facade prevents the
three adapters from inventing independent Host semantics.

## Success Criteria

- API and CLI no longer duplicate core Host decisions for app lifecycle,
  available Soul lookup, worker creation, template ownership or metadata
  enrichment.
- Host contract tests exercise the shared facade directly.
- Existing API/CLI tests continue to prove adapter compatibility.
- Mounted Soul App surfaces still pass the browser smoke.
