# REFACTOR-077 Make Host runtime a first-class bounded context

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 17:54
- **plan**: PLAN-298
- **relatesTo**: packages/core, apps/api, apps/cli, Host/Soul App architecture

## Description

The Host experience should not be assembled by CLI, API and Web each carrying
their own Host semantics. Keep CLI/API/Web as delivery adapters, but move Host
use cases and invariants into a shared core boundary.

Acceptance criteria:

- `packages/core` exposes a Host runtime facade for app lifecycle, official app
  bootstrap, catalog projection, worker creation, template lookup and session
  metadata enrichment.
- API and CLI call the Host facade for shared Host decisions instead of
  duplicating soul/template/worker rules.
- Host contract tests prove legacy built-in Soul ids are rejected, official apps
  are bootstrapped through the shared boundary, worker metadata is app-scoped,
  duplicate worker ids fail consistently and template metadata enrichment uses
  the same app catalog.
- Existing mounted surface and local daemon behavior stays intact.

## ActiveForm

Converging Host rules into a core Host runtime boundary while keeping API, CLI
and Web as adapters.

## Notes

- 2026-05-13 17:54: Created after architecture review concluded the smell is
  not the three delivery apps, but the lack of a first-class Host use-case
  boundary.
- 2026-05-13 18:05: Added the core Host runtime facade, direct Host contract
  tests, API adapter delegation and CLI adapter delegation; full verification
  and code-review-graph completed.
