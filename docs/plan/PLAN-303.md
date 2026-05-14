# PLAN-303 Clean active documentation map

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-13 20:58
- **relatedTask**: DOC-012

## Current State

`AGENTS.md` and `docs/architecture.md` now define the active entrypoint model.
Several root docs still conflict with that model:

- `docs/cli.md` describes the older `brief/run` command tree instead of the
  current app/worker/workspace/session/turn CLI.
- `docs/deployment.md` is mostly current but still uses old topology wording.
- `docs/e2e-smoke.md` references a deleted PLAN-004 smoke script.
- `docs/executor-engines.md` is useful but not discoverable from active docs.
- `docs/governance-node-status.md` is historical and should not remain a
  required agent entrypoint.

## Decision

Delete the broken historical pages. Keep active docs task-routed:

```text
AGENTS.md -> docs/architecture.md
README docs map -> cli / deployment / executor-engines / soul-app-developer
```

## Scope

In scope:

- Delete `docs/e2e-smoke.md`.
- Delete `docs/governance-node-status.md`.
- Rewrite `docs/cli.md`.
- Refresh `docs/deployment.md`.
- Refresh `docs/executor-engines.md`.
- Add compact task-specific doc pointers to `AGENTS.md` and README.
- Sync PMA and changelog.

Out of scope:

- Runtime behavior.
- CLI command changes.
- API/Web/test changes.
- Historical PMA or changelog rewrites.

## Verification Plan

- `test ! -e docs/e2e-smoke.md && test ! -e docs/governance-node-status.md`
- `rg -n "docs/e2e-smoke|e2e-smoke\\.md|docs/governance-node-status|governance-node-status\\.md" AGENTS.md README.md docs/architecture.md docs/cli.md docs/deployment.md docs/executor-engines.md docs/soul-app-developer.md`
- `rg -n "brief create|run start|run list|run show|run cancel|executor select|executor doctor" docs/cli.md`
- `rg -n "durable org memory|governance-first|Project Brain node|Fleet summary" AGENTS.md README.md docs/cli.md docs/deployment.md docs/executor-engines.md`
- `git diff --check`

## Implementation Record

- Deleted the broken PLAN-004 smoke doc and the historical governance status
  doc from active docs.
- Rewrote CLI docs around the current app/worker/workspace/session/turn command
  tree.
- Refreshed deployment and executor engine docs around the local daemon and
  Host/Soul App boundary.
- Added task-routed documentation pointers to `AGENTS.md` and README.

## Verification

- `test ! -e docs/e2e-smoke.md && test ! -e docs/governance-node-status.md`
- `rg -n "docs/e2e-smoke|e2e-smoke\\.md|docs/governance-node-status|governance-node-status\\.md" AGENTS.md README.md docs/architecture.md docs/cli.md docs/deployment.md docs/executor-engines.md docs/soul-app-developer.md`
- `rg -n "brief create|run start|run list|run show|run cancel|executor select|executor doctor" docs/cli.md`
- `rg -n "durable org memory|governance-first|Project Brain node|Fleet summary" AGENTS.md README.md docs/cli.md docs/deployment.md docs/executor-engines.md`
- `git diff --check`
- code-review-graph skipped because this plan changes only documentation, root
  agent instructions and skill planning markdown.
