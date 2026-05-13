# Soul App Dev Skill Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an agent-native Soul App development skill and root routing rules so contributors can create or modify Soul Apps without drifting from the Host / Soul App autonomy model or product language.

**Architecture:** Keep rules executable by agents: `.agents/skills/aiworker-soul-app-dev/SKILL.md` becomes the primary workflow, root `AGENTS.md` routes Soul App changes to it, and `docs/soul-app-developer.md` links human-readable authoring docs to the skill. Do not add `apps/AGENTS.md`; nested app rules are not a primary mechanism until the target agent runner proves native support.

**Tech Stack:** Markdown project skills, root agent instructions, PMA task/plan docs, `rg`, `git diff --check`.

---

## File Structure

- Create `.agents/skills/aiworker-soul-app-dev/SKILL.md`
  - Responsibility: agent-executable Soul App development workflow, boundary rules, product-language checks, and verification gates.
- Modify `AGENTS.md`
  - Responsibility: root-level routing so agents know to load `aiworker-soul-app-dev` when touching `apps/aiworker-*` or Soul App authoring surfaces.
- Modify `docs/soul-app-developer.md`
  - Responsibility: connect human-readable authoring docs with the agent-native skill workflow.
- Create `docs/task/FEAT-071.md`
  - Responsibility: PMA task record for Soul App skill/rules delivery.
- Create `docs/plan/PLAN-300.md`
  - Responsibility: PMA implementation plan record for this repo change.
- Modify `docs/task/index.md`
  - Responsibility: include FEAT-071 in the task index.
- Modify `docs/plan/index.md`
  - Responsibility: include PLAN-300 in the plan index.
- Modify `docs/changelog.md`
  - Responsibility: record the completed repository-facing change after verification.
- Keep `docs/superpowers/plans/2026-05-13-soul-app-dev-skill-rules.md`
  - Responsibility: version the implementation plan used for this delivery.

### Task 1: PMA Tracking

**Files:**
- Create: `docs/task/FEAT-071.md`
- Create: `docs/plan/PLAN-300.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`

- [ ] **Step 1: Create the task record**

Create `docs/task/FEAT-071.md` with this content:

```markdown
# FEAT-071 Soul App development skill and rules

- **status**: in_progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 19:00
- **plan**: PLAN-300
- **relatesTo**: FEAT-060, FEAT-065, docs, AGENTS.md, .agents/skills, apps/aiworker-hr, apps/aiworker-qa

## 背景

Soul App 已经具备独立 app 目录、manifest、SDK、standalone 和 Host mounted 验证入口。
下一步需要把开发规则落在 agent 会实际执行的位置，让参与者修改或新增 Soul App 时能快速
进入同一套 Host / Soul App 双自治语义。

## 目标

新增 agent-native Soul App 开发 skill，并由根 `AGENTS.md` 路由到该 skill。开发者文档需要
说明人类可读 authoring guide 与 agent skill 的关系。

具体目标：

1. 提供 `.agents/skills/aiworker-soul-app-dev/SKILL.md`。
2. 在根 `AGENTS.md` 中声明 Soul App 修改必须使用该 skill。
3. 在 `docs/soul-app-developer.md` 中串联 skill 与 authoring workflow。
4. 严格沿用 Host / Soul App、workspace/session、artifact、review/lesson、
   standalone/Host mounted 设计语言。
5. 不新增 `apps/AGENTS.md` 作为主机制，除非先验证目标 agent 原生支持 nested AGENTS。

## 非目标

- 不修改 Soul App protocol、runtime、registry、broker 或 mounted proxy。
- 不重做 HR/QA app 的产品能力。
- 不把规则落成只给人类阅读、agent 不会执行的 app-level 文件。
- 不在本轮修改 `aiworker app create` scaffold。

## 验收标准

- 新 skill 能指导 agent 读上下文、识别边界、使用统一产品语言并运行验证。
- 根 `AGENTS.md` 能把 `apps/aiworker-*` 和 Soul App authoring 相关改动路由到该 skill。
- `docs/soul-app-developer.md` 能说明 agent workflow 和人工 authoring 文档的关系。
- 文档和 skill 文件通过 `git diff --check`。
```

- [ ] **Step 2: Create the PMA plan record**

Create `docs/plan/PLAN-300.md` with this content:

```markdown
# PLAN-300 Soul App development skill and rules

- **status**: in_progress
- **owner**: codex
- **createdAt**: 2026-05-13 19:00
- **relatedTask**: FEAT-071

## Current State

Soul App authoring already has `docs/soul-app-developer.md`, reference apps under
`apps/aiworker-hr` and `apps/aiworker-qa`, plus `aiworker app validate` and
`aiworker app smoke`. The missing piece is an agent-native development workflow
that contributors can load before changing Soul App manifests, prompts, schemas,
review rubrics, standalone surfaces, Host mounted surfaces, or authoring docs.

## Decision

Use a skill-first rules model:

```text
root AGENTS.md -> .agents/skills/aiworker-soul-app-dev/SKILL.md -> app manifest/docs/files -> validate/smoke evidence
```

Do not introduce `apps/AGENTS.md` as the primary route. It is only useful after
the target agent runner proves native nested AGENTS loading.

## Scope

In scope:

- Add `aiworker-soul-app-dev` as a repository skill.
- Route Soul App edits to the skill from root `AGENTS.md`.
- Update `docs/soul-app-developer.md` with an Agent Workflow section.
- Keep PMA task, plan and changelog synced.

Out of scope:

- CLI scaffold changes.
- Runtime or protocol changes.
- Nested `apps/AGENTS.md`.
- New HR/QA product features.

## Verification Plan

- Search for placeholder terms in changed files.
- Run `git diff --check`.
- Confirm no `apps/AGENTS.md` file was added.
- Confirm `AGENTS.md`, `docs/soul-app-developer.md`, and the new skill all use the same product vocabulary.
- Skip code-review-graph because this plan changes documentation, root agent instructions, and skill markdown only.
```

- [ ] **Step 3: Add task index entry**

Update the `docs/task/index.md` header to:

```markdown
> Updated: 2026-05-13 (FEAT-071 in progress)
```

Append this line to the end of `docs/task/index.md`:

```markdown
- [-] [**FEAT-071 Soul App development skill and rules**](FEAT-071.md) `P0`
```

- [ ] **Step 4: Add plan index entry**

Update the `docs/plan/index.md` header to:

```markdown
> Updated: 2026-05-13 (PLAN-300 in progress)
```

Append this line to the end of `docs/plan/index.md`:

```markdown
- [-] [**PLAN-300 Soul App development skill and rules**](PLAN-300.md) `2026-05-13`
```

- [ ] **Step 5: Verify PMA tracking diff**

Run:

```bash
git diff -- docs/task/FEAT-071.md docs/plan/PLAN-300.md docs/task/index.md docs/plan/index.md
```

Expected: diff shows only the new FEAT-071/PLAN-300 files and one new line in each index.

### Task 2: Agent Skill And Root Routing

**Files:**
- Create: `.agents/skills/aiworker-soul-app-dev/SKILL.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Create the Soul App development skill**

Create `.agents/skills/aiworker-soul-app-dev/SKILL.md` with this content:

```markdown
---
name: aiworker-soul-app-dev
description: "Use when creating, modifying, or reviewing AIWorker Soul Apps under apps/aiworker-* or related authoring, validation, scaffold, manifest, SDK, standalone, Host mounted, artifact, review, or capability surfaces."
argument-hint: "[app-path]"
arguments: [app_path]
---

# AIWorker Soul App Developer

Use this skill before creating, modifying, or reviewing a Soul App. It covers
production apps under `apps/aiworker-*`, app manifests, standalone surfaces,
Host mounted surfaces, capability prompts, artifact schemas, review rubrics,
Soul packs, authoring docs, validation harnesses, and scaffold behavior.

## Read First

Load the minimum context for the current change:

1. `GOALS.md`
2. `docs/architecture.md`
3. `docs/soul-app-developer.md`
4. The target app's `soul-app.manifest.json`
5. The target app's `README.md`
6. The target app files touched by the request, such as `capabilities/`,
   `schemas/`, `review/`, `packs/`, `src/standalone.ts`,
   `src/host-mounted.ts`, or `src/protocol/`

If `$app_path` is provided, start there. If no app path is supplied, infer the
target from changed files or the user request. Ask only when the target cannot
be inferred safely.

## Product Language

Use the same product vocabulary everywhere:

- `Host`
- `Soul App`
- `Soul worker`
- `workspace`
- `session`
- `artifact`
- `review`
- `lesson`
- `standalone`
- `Host mounted`
- `manifest`
- `SDK`
- `broker`

Keep the default product path intact:

```text
local daemon -> Soul worker -> workspace -> session -> artifact -> review -> lesson
```

Developer Soul is a supporting role for code review, release evidence, repo
report, handoff, and risk audit. Do not make repo, PMA, coding loop, admin
dashboard, governance kernel, or generic agent runtime the default product
center.

## Boundary Rules

Soul Apps own vertical product logic:

- domain UI/API
- manifest
- workspace types
- capability prompts
- artifact schemas
- review rubrics
- Soul packs
- app-scoped storage declarations
- standalone shell
- Host mounted service entrypoints

Host owns shared runtime concerns:

- local daemon and session runtime
- engine handoff
- connector credentials
- Host metadata storage
- artifact indexing
- review and lesson services
- permission and storage brokers
- mounted service launch/connect
- audit

Do not bypass those boundaries:

- Do not import `@zonease/aiworker-core`, `@zonease/aiworker-api`,
  `@zonease/aiworker-storage-sqlite`, or `@zonease/aiworker-web` from Soul App
  source.
- Do not import another Soul App's `src` from app code.
- Do not let Soul App code directly schedule engines, read/write Host DB
  handles, access connector credentials, or mutate global memory.
- Do not put secrets in manifests, generated app config, workspace metadata, DB
  metadata, logs, prompts, review rubrics, or skill files.
- Host mounted access to shared resources must go through scoped broker
  surfaces.

## Workflow

1. Identify whether the request changes a Soul App, authoring docs, validation
   harness, scaffold behavior, or Host/Soul App protocol-facing surface.
2. Read the required context above.
3. Confirm the change belongs in the Soul App boundary. If it needs Host-owned
   resources, design a protocol, SDK, or broker interaction instead of direct
   imports.
4. Keep standalone and Host mounted modes aligned. They should share the same
   manifest, domain definitions, artifact schemas, review rubrics, and handler
   semantics.
5. Keep user-facing text and prompts understandable to the vertical user. HR,
   QA, finance, legal, ops, DevOps, and PM users should see business objects,
   not Host internals.
6. For non-trivial repository work, follow PMA: investigate, proposal, then
   implementation after approval. Keep `docs/task/`, `docs/plan/`, and
   `docs/changelog.md` synced when the change has project-level impact.

## Validation

For each changed production Soul App, run:

```bash
aiworker app validate <app-path>
aiworker app smoke <app-path>
```

For package code under an app, also run the app's focused typecheck and test
scripts when present:

```bash
bun run --filter '<package-name>' typecheck
bun run --filter '<package-name>' test
```

For root-level authoring, scaffold, or validation changes, run the focused
package gates that own those files. Run root gates only when the change touches
shared contracts, CLI behavior, Host runtime, or cross-package configuration.

When code files changed, run code-review-graph before the final response:

```bash
bun run crg:update
bun run crg:review
```

Skip code-review-graph for documentation-only, instruction-only, or pure
formatting changes, and state that skip explicitly.

## Completion Checklist

Before reporting completion:

- the target app or authoring surface is named;
- Host / Soul App ownership stayed explicit;
- standalone and Host mounted implications are addressed;
- no Host-private or sibling app source imports were introduced;
- product language matches `GOALS.md`, `docs/architecture.md`, and
  `docs/soul-app-developer.md`;
- validation commands and results are recorded;
- PMA docs and changelog are synced when applicable;
- code-review-graph ran for code changes or was explicitly skipped for
  docs/instruction-only work.
```

- [ ] **Step 2: Route Soul App edits from root AGENTS**

In `AGENTS.md`, under `## 工作方式`, after this existing bullet:

```markdown
- 非平凡开发任务遵循 PMA：先调查，再 proposal，获批后实现，并同步 `docs/task/*.md`；后端参考 `/pma-bun`，前端参考 `/pma-web`，代码评审参考 `/pma-cr`。
```

Insert this bullet:

```markdown
- 修改或新增 `apps/aiworker-*` Soul App、Soul App scaffold/validation 或相关 authoring 文档时，先使用 `.agents/skills/aiworker-soul-app-dev/SKILL.md`；保持同一套 Host / Soul App、workspace/session、artifact、review/lesson、standalone/Host mounted 设计语言。
```

- [ ] **Step 3: Verify root routing diff**

Run:

```bash
git diff -- .agents/skills/aiworker-soul-app-dev/SKILL.md AGENTS.md
```

Expected: diff shows one new skill file and one new bullet in root `AGENTS.md`.

### Task 3: Developer Documentation Linkage

**Files:**
- Modify: `docs/soul-app-developer.md`

- [ ] **Step 1: Add Agent Workflow section**

In `docs/soul-app-developer.md`, after the opening paragraph and before `## Create`, insert:

```markdown
## Agent Workflow

Repository agents should load `.agents/skills/aiworker-soul-app-dev/SKILL.md`
before creating or modifying production Soul Apps, Soul App authoring docs,
validation harnesses, scaffold behavior, manifests, standalone surfaces, Host
mounted surfaces, artifact schemas, capability prompts, or review rubrics.

This document is the human-readable authoring guide. The skill is the
agent-native execution route. Keep both aligned with the same Host / Soul App,
workspace/session, artifact, review/lesson, standalone, Host mounted, manifest,
SDK, and broker vocabulary.

Do not treat `apps/AGENTS.md` as the canonical Soul App rule surface until the
target agent runner has proven native nested AGENTS loading. The current
canonical route is:

```text
root AGENTS.md -> aiworker-soul-app-dev skill -> app manifest/docs/files -> validate/smoke evidence
```
```

- [ ] **Step 2: Verify authoring doc diff**

Run:

```bash
git diff -- docs/soul-app-developer.md
```

Expected: diff shows only the new `Agent Workflow` section.

### Task 4: Verification, PMA Closure, And Commit

**Files:**
- Modify: `docs/task/FEAT-071.md`
- Modify: `docs/plan/PLAN-300.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`
- Track: `docs/superpowers/plans/2026-05-13-soul-app-dev-skill-rules.md`

- [ ] **Step 1: Run placeholder scan**

Run:

```bash
rg -n "待定|占位|apps/AGENTS.md" \
  .agents/skills/aiworker-soul-app-dev/SKILL.md \
  AGENTS.md \
  docs/soul-app-developer.md \
  docs/task/FEAT-071.md \
  docs/plan/PLAN-300.md
```

Expected: either no output, or output only for statements that explicitly reject `apps/AGENTS.md` as the canonical route.

- [ ] **Step 2: Confirm no nested AGENTS file was added**

Run:

```bash
test ! -e apps/AGENTS.md
```

Expected: exit code `0`.

- [ ] **Step 3: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

- [ ] **Step 4: Mark FEAT-071 complete**

In `docs/task/FEAT-071.md`, change:

```markdown
- **status**: in_progress
```

to:

```markdown
- **status**: completed
```

Append this section to the end of `docs/task/FEAT-071.md`:

```markdown
## 完成记录

- 新增 `.agents/skills/aiworker-soul-app-dev/SKILL.md`，覆盖 Soul App 上下文读取、
  Host / Soul App 边界、设计语言、standalone/Host mounted 一致性和验证 gate。
- 更新根 `AGENTS.md`，把 `apps/aiworker-*`、Soul App scaffold/validation 和 authoring
  文档改动路由到该 skill。
- 更新 `docs/soul-app-developer.md`，说明 authoring guide 与 agent-native skill 的关系，
  并明确不把 `apps/AGENTS.md` 作为当前 canonical rules surface。

## 验证

- `rg -n "待定|占位|apps/AGENTS.md" ...`
- `test ! -e apps/AGENTS.md`
- `git diff --check`
- code-review-graph skipped because this change only touches docs, root agent instructions, and skill markdown.
```

- [ ] **Step 5: Mark PLAN-300 complete**

In `docs/plan/PLAN-300.md`, change:

```markdown
- **status**: in_progress
```

to:

```markdown
- **status**: completed
```

Append this section to the end of `docs/plan/PLAN-300.md`:

```markdown
## Implementation Record

- Added `aiworker-soul-app-dev` as the agent-native Soul App development skill.
- Routed Soul App edits from root `AGENTS.md` to the new skill.
- Linked `docs/soul-app-developer.md` to the skill-first workflow and kept
  nested `apps/AGENTS.md` out of the canonical rules path.

## Verification

- `rg -n "待定|占位|apps/AGENTS.md" ...`
- `test ! -e apps/AGENTS.md`
- `git diff --check`
- code-review-graph skipped because this change only touches docs, root agent instructions, and skill markdown.
```

- [ ] **Step 6: Mark indexes complete**

In `docs/task/index.md`, change:

```markdown
- [-] [**FEAT-071 Soul App development skill and rules**](FEAT-071.md) `P0`
```

to:

```markdown
- [x] [**FEAT-071 Soul App development skill and rules**](FEAT-071.md) `P0`
```

In `docs/plan/index.md`, change:

```markdown
- [-] [**PLAN-300 Soul App development skill and rules**](PLAN-300.md) `2026-05-13`
```

to:

```markdown
- [x] [**PLAN-300 Soul App development skill and rules**](PLAN-300.md) `2026-05-13`
```

- [ ] **Step 7: Add changelog entry**

Insert this section immediately after `# AIWorker Changelog` in `docs/changelog.md`:

```markdown
## 2026-05-13 19:00 [completed] FEAT-071 / PLAN-300 — Soul App development skill and rules

Added an agent-native Soul App development route so contributors can work on
Soul Apps without drifting from Host / Soul App dual autonomy.

- Added `.agents/skills/aiworker-soul-app-dev/SKILL.md` with required context,
  boundary rules, product-language checks, standalone/Host mounted expectations
  and verification gates.
- Routed `apps/aiworker-*`, Soul App scaffold/validation and authoring-doc edits
  from root `AGENTS.md` to the new skill.
- Updated `docs/soul-app-developer.md` to distinguish the human-readable
  authoring guide from the agent-native execution route and to keep
  `apps/AGENTS.md` out of the canonical path until nested loading is proven.

Verification passed: placeholder scan, `test ! -e apps/AGENTS.md`, and
`git diff --check`. code-review-graph was skipped because this change only
touches docs, root agent instructions, and skill markdown.
```

- [ ] **Step 8: Final status check**

Run:

```bash
git status --short --untracked-files=all
git diff --stat
```

Expected: changed files are only `.agents/skills/aiworker-soul-app-dev/SKILL.md`,
`AGENTS.md`, `docs/soul-app-developer.md`, `docs/task/FEAT-071.md`,
`docs/plan/PLAN-300.md`, `docs/task/index.md`, `docs/plan/index.md`, and
`docs/changelog.md`, plus
`docs/superpowers/plans/2026-05-13-soul-app-dev-skill-rules.md`. Existing
`.superpowers/brainstorm/.../state/*` files may remain untracked and should not
be committed.

- [ ] **Step 9: Commit**

Run:

```bash
git add \
  .agents/skills/aiworker-soul-app-dev/SKILL.md \
  AGENTS.md \
  docs/soul-app-developer.md \
  docs/task/FEAT-071.md \
  docs/plan/PLAN-300.md \
  docs/task/index.md \
  docs/plan/index.md \
  docs/changelog.md \
  docs/superpowers/plans/2026-05-13-soul-app-dev-skill-rules.md
git commit -m "docs: 添加 Soul App 开发 skill 与 rules"
```

Expected: commit succeeds and does not include `.superpowers/` state files.
