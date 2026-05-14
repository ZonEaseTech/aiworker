# REFACTOR-076 Remove legacy gateway and fleet surfaces

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 17:13
- **plan**: PLAN-297
- **relatesTo**: packages/gateway, packages/gateway-proto, packages/storage-sqlite, packages/shared, apps/cli, apps/api, Dockerfile, ops, docs

## Description

Host / Soul App dual autonomy no longer uses the historical remote
fleet/gateway control plane. Remove the gateway/proto workspaces and the
remaining active build, smoke, storage, Docker and documentation surfaces that
would keep that control plane alive.

Acceptance criteria:

- `packages/gateway` and `packages/gateway-proto` are removed from the
  workspace and lockfile.
- CLI/API/core package manifests no longer depend on gateway/proto packages.
- Dead gateway smoke scripts and fleet DB generation paths are removed.
- Shared runtime types still needed by the current local Host path are moved out
  of `packages/shared/src/fleet`.
- Active deployment and README docs no longer instruct operators to use
  gateway, fleet, Docker compose gateway deployment or public gateway runbooks.
- Root quality gates and code-review-graph pass after the removal.

## ActiveForm

Removing historical gateway/fleet packages and converging active surfaces onto
the local Host / Soul App runtime.

## Notes

- 2026-05-13 17:13: Created and claimed after confirming current runtime code no
  longer imports gateway/proto and the remaining references are legacy manifests,
  smoke scripts, fleet storage, Docker/ops and docs.
- 2026-05-13 17:28: Removed gateway/proto packages, fleet storage/schema
  surfaces, Docker/ops deployment paths and active gateway docs; rehomed current
  shared id/engine typing; verification and code-review-graph completed.
