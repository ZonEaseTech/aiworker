# FEAT-008 Host-level HA and multi-host fleet

- **status**: closed
- **priority**: P3
- **owner**: local
- **createdAt**: 2026-04-21 07:30
- **closedAt**: 2026-05-01 14:53

## 关闭标记 / Reopen Guidance

本任务作为早期多 host HA 占位关闭。当前开发成果仍围绕单 gateway / worker fleet runtime、npm CLI 部署和测试服验证；没有证据表明单 host 已成为瓶颈。

未来如需要多 host，应重新发起 ops/architecture 任务，先定义真实容量目标、故障模型、worker.db 备份恢复、fleet.db 持久化策略和部署边界。

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
