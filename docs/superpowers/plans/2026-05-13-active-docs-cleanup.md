# Active Docs Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove stale root-level docs and leave a clean, task-routed agent documentation map.

**Architecture:** The repository keeps `AGENTS.md` as execution guidance and `docs/architecture.md` as the architecture contract. CLI, deployment, executor engine and Soul App developer docs are task-specific references rather than mandatory entrypoints.

**Tech Stack:** Markdown, PMA docs, git verification.

---

## Files

- Create: `docs/task/DOC-012.md`
- Create: `docs/plan/PLAN-303.md`
- Create: `docs/superpowers/specs/2026-05-13-active-docs-cleanup-design.md`
- Create: `docs/superpowers/plans/2026-05-13-active-docs-cleanup.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/cli.md`
- Modify: `docs/deployment.md`
- Modify: `docs/executor-engines.md`
- Modify: `docs/changelog.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Delete: `docs/e2e-smoke.md`
- Delete: `docs/governance-node-status.md`

## Task 1: Claim PMA Tracking

- [x] Add `DOC-012` and `PLAN-303`.
- [x] Append index entries without staging unrelated REFACTOR-079 hunks.

## Task 2: Remove Stale Pages

- [x] Delete `docs/e2e-smoke.md`.
- [x] Delete `docs/governance-node-status.md`.
- [x] Remove governance status from mandatory agent entrypoints.

## Task 3: Re-home Active References

- [x] Rewrite `docs/cli.md` for the current command tree.
- [x] Tighten `docs/deployment.md` to local daemon / Host / Soul App deployment.
- [x] Refresh `docs/executor-engines.md` as engine auth/readiness guidance.
- [x] Add a compact docs map to README and AGENTS.

## Task 4: Verify And Commit

- [x] Search active docs for deleted doc references.
- [x] Search active docs for stale `brief/run` CLI terms.
- [x] Search active docs for stale governance/product language.
- [x] Run `git diff --check`.
- [ ] Commit only this slice.
