# PLAN-290 Remove legacy OD and control-plane guidance from current contracts

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 21:20
- **approvedAt**: 2026-05-12 21:20
- **completedAt**: 2026-05-12 21:20
- **relatedTask**: DOC-010

## Current State

After FEAT-060..065 / PLAN-284..289, AIWorker's current architecture is Host /
Soul App dual autonomy. Current entrypoint docs still carried older guidance:

- Open Design mapping tables in GOALS, architecture, and README.
- OD-style reboot listed as required reading in AGENTS.
- Fleet/gateway deferral language in GOALS, architecture, README, and AGENTS.
- Old OD-style PMA entries still marked in progress in task/plan indexes.
- Codex memory contains historical OD/fleet/gateway entries that can bias future
  sessions unless treated as stale.

## Decision

Current product contracts should use only AIWorker-native language:

```text
Host -> Soul App / Soul worker -> workspace -> session -> artifact -> review -> memory
```

Historical Open Design and fleet/gateway materials remain in task/plan/changelog
history, but they must not be presented as active constraints. Memory cleanup is
called out separately because Codex memory is outside the repository and should
not be changed without explicit operator authorization.

## Scope

In scope:

- Remove Open Design mapping from current docs.
- Remove fleet/gateway deferral guidance from current docs.
- Point AGENTS required reading at FEAT-060..065 / PLAN-284..289 instead of
  REFACTOR-026 / PLAN-192.
- Mark old active OD-style task/plan index entries as superseded.
- Add superseded notes to REFACTOR-026 and PLAN-192.
- Add changelog entry.

Out of scope:

- Deleting historical PMA files.
- Removing `packages/gateway*` or other runtime packages.
- Changing build/package scripts that may still depend on old bundle shapes.
- Updating Codex memory directly.

## Risks

- **Over-cleaning history**：deleting old PMA records would remove useful
  decision evidence.
  Mitigation: keep historical files and mark superseded instead.
- **Runtime breakage**：removing gateway/fleet code could affect build/release
  paths.
  Mitigation: docs-only cleanup; runtime/code isolation must be a separate
  implementation plan.
- **Memory drift**：future sessions may still retrieve older memory.
  Mitigation: final handoff will identify stale memory themes and request
  explicit authorization before writing a memory correction note.

## Verification Plan

- `git diff --check`
- Focused search over current entrypoints:
  `GOALS.md`, `docs/architecture.md`, `README.md`, `AGENTS.md`.
- Confirm task/plan index markers for old OD-style active entries are
  superseded.
- Confirm new DOC-010 / PLAN-290 files and index links exist.

## Progress

- 2026-05-12 21:20: Approved by operator request to follow the cleanup
  recommendation and to account for memory interference. Completed docs-only
  cleanup and verification.
