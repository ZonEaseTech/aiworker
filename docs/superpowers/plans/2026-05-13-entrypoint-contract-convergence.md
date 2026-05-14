# Entrypoint Contract Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收敛 AIWorker 当前架构入口，只保留 `AGENTS.md` 作为 agent 执行指南，`docs/architecture.md` 作为 Host / Soul App 双自治架构合同，并删除 `GOALS.md`。

**Architecture:** 本轮是文档与规则入口重构，不改运行时代码。`docs/architecture.md` 承载产品与系统边界，`AGENTS.md` 承载执行规则，Soul App skill 和 developer guide 从架构合同读取边界，不再引用旧北极星文档。

**Tech Stack:** Markdown, PMA task/plan tracking, git verification.

---

## Files

- Create: `docs/task/DOC-011.md`
- Create: `docs/plan/PLAN-302.md`
- Create: `docs/superpowers/plans/2026-05-13-entrypoint-contract-convergence.md`
- Modify: `AGENTS.md`
- Modify: `docs/architecture.md`
- Modify: `.agents/skills/aiworker-soul-app-dev/SKILL.md`
- Modify: `docs/soul-app-developer.md`
- Modify: `docs/governance-node-status.md`
- Modify: `README.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`
- Delete: `GOALS.md`

## Task 1: Claim PMA Tracking

- [x] **Step 1: Add the task file**

Create `docs/task/DOC-011.md` with status `in_progress`, owner `codex`, priority `P0`, plan `PLAN-302`, and acceptance criteria covering entrypoint convergence, `GOALS.md` deletion, Host/Soul ownership clarity, and documentation-only verification.

- [x] **Step 2: Add the plan file**

Create `docs/plan/PLAN-302.md` with status `implementing`, related task `DOC-011`, current state, decision, scope, verification plan, and an initially empty implementation record.

- [x] **Step 3: Append PMA indexes**

Append `DOC-011` and `PLAN-302` to the task and plan indexes without overwriting existing uncommitted entries.

## Task 2: Replace Active Architecture Contract

- [x] **Step 1: Rewrite `docs/architecture.md`**

Replace the old mixed Host/runtime/review ownership narrative with a concise current contract:

- Host is a platform locator, capability shell, install/enable owner, auth/settings owner, broker, shell owner, and protocol consumer.
- Soul App owns vertical domain state, domain meaning, UI/API, artifact/profile/review/lesson semantics, standalone runtime, and app-local storage content.
- Host may only consume artifact/review/memory/audit/search surfaces through the app protocol and grants.
- If a Soul App does not expose a surface, Host does not infer or fetch it.
- HR profile composition is explicitly Soul-owned.

- [x] **Step 2: Delete `GOALS.md`**

Remove `GOALS.md` entirely with no redirect stub. The active conceptual entrypoint is `docs/architecture.md`.

## Task 3: Update Agent and Authoring Entry Points

- [x] **Step 1: Rewrite `AGENTS.md`**

Keep it short and execution-focused: active entrypoints, PMA workflow, implementation map, boundary rules, data/API rules, UI rules, common commands, and verification rules.

- [x] **Step 2: Update `.agents/skills/aiworker-soul-app-dev/SKILL.md`**

Remove `GOALS.md` from read-first and checklist sections. Align boundary rules with Soul App source-of-truth ownership and Host platform broker ownership.

- [x] **Step 3: Update `docs/soul-app-developer.md`**

Keep the authoring workflow but replace Host-owned artifact/review/memory claims with protocol/broker language.

- [x] **Step 4: Update `docs/governance-node-status.md`**

Remove `GOALS.md` and mark old governance language as historical support for platform guardrails or Soul-exposed review/lesson flows only.

- [x] **Step 5: Update `README.md`**

Adjust the public summary so it no longer says Host owns domain artifact/review/memory by default.

## Task 4: Verify and Record

- [x] **Step 1: Search for active north-star document references**

Run `rg -n "GOALS\\.md|GOALS" AGENTS.md README.md docs/architecture.md docs/soul-app-developer.md docs/governance-node-status.md .agents/skills/aiworker-soul-app-dev/SKILL.md`.
Expected: no matches in active entrypoint files. Historical PMA/changelog/spec files may still mention the deleted document as past evidence.

- [x] **Step 2: Search for stale ownership phrasing**

Run `rg -n "Host owns .*artifact|Host owns .*review|Host owns .*memory|artifact indexing, reviews|memory admission" AGENTS.md README.md docs/architecture.md docs/soul-app-developer.md .agents/skills/aiworker-soul-app-dev/SKILL.md`.
Expected: no default Host-owned domain semantics remain.

- [x] **Step 3: Run markdown whitespace verification**

Run `git diff --check`.
Expected: exit 0.

- [x] **Step 4: Complete PMA records**

Set `DOC-011` and `PLAN-302` to completed, add implementation and verification notes, and add a changelog entry.

- [ ] **Step 5: Commit**

Stage only this slice's files and hunks. Commit with `docs: 收敛 Host 与 Soul App 架构入口`.
