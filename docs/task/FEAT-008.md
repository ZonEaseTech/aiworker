# FEAT-008 Host-level HA and multi-host fleet

- **status**: pending
- **priority**: P3
- **owner**: (unassigned)
- **createdAt**: 2026-04-21 07:30

## Description

Extend the fleet runtime to span more than one host. MVP runs all workers on a single docker host (`gateway.example.test`, 1 CPU / 961 MiB). When fleet size or availability requirements outgrow one host, we need multi-host coordination.

Scope:

- Overlay network across docker hosts (or move to a lightweight orchestrator like nomad / k3s)
- Distributed supervisor: worker placement, health-driven migration
- Shared fleet.db (Postgres or replicated SQLite) or consensus on the workers registry
- Per-worker DR: backup/restore of `worker.db` volumes
- Dashboard shows per-host utilisation + placement decisions

## ActiveForm

Planning multi-host fleet HA (deferred)

## Dependencies

- **blocked by**: REFACTOR-002
- **blocks**: (none)

## Notes

Only relevant once a single host is provably insufficient. The MVP architecture does not preclude this; supervisor + network assumptions live at clearly-named seams so they can be swapped without tearing the rest apart.
