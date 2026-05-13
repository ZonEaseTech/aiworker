# PLAN-300 Soul App development skill and rules

- **status**: completed
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
