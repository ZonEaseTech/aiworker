# Host And Soul App Developer Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AIWorker's active docs and agent skills answer where to start for Host work, Soul App work, and Host/Soul boundary questions.

**Architecture:** Keep `docs/architecture.md` as the single architecture contract. Add a Host-side agent skill to mirror the existing Soul App skill, then route active entrypoints to the correct skill without creating a competing onboarding portal.

**Tech Stack:** Markdown agent skills, PMA docs, Superpowers specs/plans, `rg`, YAML frontmatter parsing, `git diff --check`.

---

## Scope Check

This plan implements FEAT-081 / PLAN-313 and the approved Superpowers design
spec. It is instruction/documentation-only. It does not change runtime code,
API contracts, Web UI, app manifests, database schema, CLI behavior, or tests.

## File Structure

- Create `.agents/skills/aiworker-host-dev/SKILL.md`: Host platform development route.
- Modify `.agents/skills/aiworker-soul-app-dev/SKILL.md`: explicit handoff for Host-owned changes.
- Modify `AGENTS.md`: active agent route split.
- Modify `README.md`: human-readable developer route table.
- Modify `docs/architecture.md`: compact development entry routing section.
- Modify `docs/soul-app-developer.md`: cross-link to Host route when a change is not Soul-owned.
- Create/update `docs/task/FEAT-081.md`, `docs/plan/PLAN-313.md`, `docs/task/index.md`, `docs/plan/index.md`, and `docs/changelog.md`.

## Task 1: Tracking Setup

**Files:**
- Create: `docs/task/FEAT-081.md`
- Create: `docs/plan/PLAN-313.md`
- Create: `docs/superpowers/plans/2026-05-14-host-soul-developer-onboarding-routing.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Create PMA task, PMA plan, and Superpowers implementation plan.**

Add FEAT-081, PLAN-313, and this implementation plan.

- [x] **Step 2: Mark index entries as in progress.**

Append:

```markdown
- [-] [**FEAT-081 Host and Soul App developer route onboarding**](FEAT-081.md) `P0`
- [-] [**PLAN-313 Host and Soul App developer route onboarding**](PLAN-313.md) `2026-05-14`
```

- [x] **Step 3: Add changelog progress entry.**

Add a top entry describing the dual-route onboarding implementation.

## Task 2: Host Skill

**Files:**
- Create: `.agents/skills/aiworker-host-dev/SKILL.md`

- [x] **Step 1: Create Host development skill.**

Create one lean SKILL.md with:

```yaml
---
name: aiworker-host-dev
description: "Use when creating, modifying, or reviewing AIWorker Host platform surfaces such as local daemon API, Worker Web Shell, CLI lifecycle, Host runtime, app registry, brokers, auth/security review, shared Host/Soul protocol, storage metadata, fs layout, or shared UI primitives."
argument-hint: "[surface]"
arguments: [surface]
---
```

The body must cover:

- fit check;
- Host product contract;
- Host/Soul boundary rules;
- read set by surface;
- workflow;
- validation matrix;
- completion checklist.

- [x] **Step 2: Self-check skill scope.**

Verify the Host skill does not instruct agents to interpret HR/QA domain
objects, import Soul App internals, or revive fleet/gateway validation paths.

## Task 3: Soul App Skill Handoff

**Files:**
- Modify: `.agents/skills/aiworker-soul-app-dev/SKILL.md`

- [x] **Step 1: Add Host handoff to Fit Check.**

Add that Host platform lifecycle, daemon API, CLI lifecycle, Web shell,
broker enforcement, security review, storage schema, and shared Host/Soul
protocol implementation should use `aiworker-host-dev`.

- [x] **Step 2: Add boundary handoff to workflow.**

State that when a requested Soul App change needs Host-owned behavior, the
agent should switch to the Host skill and design a protocol/SDK/broker surface
instead of stretching Soul App responsibilities.

## Task 4: Active Entrypoints

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/soul-app-developer.md`

- [x] **Step 1: Update AGENTS.md route split.**

Add Host route and Soul App route under active reads/task reads.

- [x] **Step 2: Add README Developer Route table.**

Add a short table mapping common changes to starting docs and skills.

- [x] **Step 3: Add architecture Development Entry Routing section.**

Map Host-owned and Soul-owned responsibilities to repo paths and skills without
duplicating the whole architecture.

- [x] **Step 4: Add Soul App developer cross-link.**

Add a note that Host-owned changes should route to `aiworker-host-dev`.

## Task 5: Verification And Closeout

**Files:**
- Modify: `docs/task/FEAT-081.md`
- Modify: `docs/plan/PLAN-313.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Parse skill frontmatter.**

Run a YAML parser against both Host and Soul App skills and require `name` and
`description`.

- [x] **Step 2: Verify active references.**

Run `rg` across active entrypoints for both skill names and `aiworker-validate`.

- [x] **Step 3: Run diff hygiene.**

Run:

```bash
git diff --check
```

- [x] **Step 4: Complete PMA records.**

Mark FEAT-081 and PLAN-313 completed and update changelog with verification
evidence.

- [x] **Step 5: Commit.**

Commit with:

```bash
git commit -m "docs: 增加 Host 与 Soul App 开发入口路由"
```
