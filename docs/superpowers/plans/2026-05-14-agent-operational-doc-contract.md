# Agent Operational Documentation Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AIWorker's active docs machine-routable for agents by centralizing hard constraints and checking the active documentation contract.

**Architecture:** `docs/architecture.md` becomes the normative constraint registry. `AGENTS.md`, README files and skills remain thin routing/execution layers. A small Bun TypeScript script validates the active docs contract and is wired into lint.

**Tech Stack:** Markdown, Bun TypeScript script, root package scripts, `rg`, `git diff --check`, code-review-graph.

---

## File Structure

- Modify `docs/architecture.md`: add `Constraint Registry` with stable IDs.
- Modify `AGENTS.md`: point hard constraints at the registry and label audit docs.
- Modify `README.md`: point developer route to the registry.
- Replace `README.zh-CN.md`: short pointer to canonical docs.
- Modify `docs/soul-app-developer.md`: refer to registry IDs for boundaries.
- Modify `.agents/skills/aiworker-host-dev/SKILL.md`: route hard constraints to the registry.
- Modify `.agents/skills/aiworker-soul-app-dev/SKILL.md`: route hard constraints to the registry.
- Create `scripts/check-doc-contract.ts`: validate active docs contract.
- Modify `package.json`: add `docs:check` and include it in `lint`.
- Update PMA docs and changelog.

## Task 1: Tracking Setup

**Files:**
- Create: `docs/task/DOC-013.md`
- Create: `docs/plan/PLAN-314.md`
- Create: `docs/superpowers/plans/2026-05-14-agent-operational-doc-contract.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Create PMA task, PMA plan and implementation plan.**

Create DOC-013, PLAN-314 and this Superpowers implementation plan.

- [x] **Step 2: Claim task and plan in indexes.**

Append DOC-013 and PLAN-314 with in-progress markers and update index headers.

- [x] **Step 3: Add changelog progress entry.**

Add a top `[progress]` entry for DOC-013 / PLAN-314.

## Task 2: Constraint Registry

**Files:**
- Modify: `docs/architecture.md`

- [x] **Step 1: Add registry section.**

Add `## Constraint Registry` with ID, rule, owner, source, enforcement and thin references for:

- `ARCH-001`
- `HOST-001`
- `SOUL-001`
- `PROTO-001`
- `IMPORT-001`
- `DATA-001`
- `BROKER-001`
- `DOC-001`

- [x] **Step 2: Keep adjacent sections readable.**

Ensure existing boundary sections can refer to the registry without turning the
file into a second onboarding portal.

## Task 3: Thin Router Cleanup

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/soul-app-developer.md`
- Modify: `.agents/skills/aiworker-host-dev/SKILL.md`
- Modify: `.agents/skills/aiworker-soul-app-dev/SKILL.md`

- [x] **Step 1: Update AGENTS.md.**

State that hard constraints live in the architecture registry; AGENTS remains a
route map and work protocol.

- [x] **Step 2: Update README.md.**

Point the developer route at the Constraint Registry.

- [x] **Step 3: Replace README.zh-CN.md.**

Replace stale architecture prose with a short pointer to README and the active
agent-operational entrypoints.

- [x] **Step 4: Update Soul App authoring and route skills.**

Reference registry IDs for hard rules, leaving skills focused on execution.

## Task 4: Docs Contract Gate

**Files:**
- Create: `scripts/check-doc-contract.ts`
- Modify: `package.json`

- [x] **Step 1: Add docs contract checker.**

Create a Bun script that checks:

- required active docs exist;
- `CLAUDE.md` is `@AGENTS.md`;
- architecture registry includes the required IDs;
- active thin layers reference the registry and route skills;
- `README.zh-CN.md` does not contain stale old-path terms;
- active docs do not reintroduce `GOALS.md` or `aiworker-validate`;
- audit docs are labelled as audit trail.

- [x] **Step 2: Add package scripts.**

Add `docs:check` and include `bun run docs:check` in root `lint`.

## Task 5: Verification And Closeout

**Files:**
- Modify: `docs/task/DOC-013.md`
- Modify: `docs/plan/PLAN-314.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`
- Modify: this implementation plan

- [x] **Step 1: Run docs check.**

Run `bun run docs:check`.

- [x] **Step 2: Run lint.**

Run `bun run lint`.

- [x] **Step 3: Run diff hygiene.**

Run `git diff --check`.

- [x] **Step 4: Run code-review-graph.**

Run `bun run crg:update` and `bun run crg:review`.

- [x] **Step 5: Complete PMA and commit.**

Mark DOC-013 and PLAN-314 completed, update changelog, and commit with:

```bash
git commit -m "docs: 收束 agent 文档约束体系"
```
