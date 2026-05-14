# Active Docs Cleanup Design

## Context

The active architecture entrypoints have been converged to root `AGENTS.md` and
`docs/architecture.md`. Several root-level docs still drift from that model:

- `docs/cli.md` describes an older `brief/run` command tree.
- `docs/deployment.md` mostly matches local daemon deployment, but still uses
  old product topology language.
- `docs/e2e-smoke.md` documents a deleted PLAN-004 smoke script.
- `docs/executor-engines.md` is useful but not linked from active docs.
- `docs/governance-node-status.md` is a historical transition note that became
  a third required entrypoint.

## Decision

Keep active docs small and task-routed:

```text
AGENTS.md -> docs/architecture.md
task-specific docs -> cli / deployment / executor-engines / soul-app-developer
```

Delete docs whose referenced runtime no longer exists or whose only value is
historical. Historical PMA/changelog mentions remain as audit trail; current
guidance should not route agents through stale pages.

## Scope

In scope:

- Delete `docs/e2e-smoke.md`.
- Delete `docs/governance-node-status.md`.
- Rewrite `docs/cli.md` against the current CLI command tree.
- Tighten `docs/deployment.md` to the Host/Soul App local daemon contract.
- Keep `docs/executor-engines.md` as the engine auth/readiness manual and link
  it from active docs.
- Keep `AGENTS.md` clean: one required architecture entrypoint, plus
  task-specific doc pointers.

Out of scope:

- Runtime, CLI, API, Web or test changes.
- Rewriting historical PMA/changelog entries that mention deleted docs.
- Adding new smoke scripts.

## Verification

- Search active docs for deleted doc references.
- Search active docs for stale `brief/run` CLI terms.
- Search active docs for `durable org memory` and governance-first language.
- Run `git diff --check`.
