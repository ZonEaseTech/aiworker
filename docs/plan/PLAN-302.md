# PLAN-302 Converge Host and Soul App architecture entrypoints

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-13 20:28
- **relatedTask**: DOC-011

## Current State

The accepted architecture direction is Host / Soul App dual autonomy:

- Host provides platform location, install/enable lifecycle, auth/security,
  shared settings, capability brokers, and shell/protocol integration.
- Soul Apps own vertical domain state, domain meaning, standalone deployment,
  domain UI/API, and the semantics behind artifacts, profiles, reviews, lessons
  and memories.
- Host should consume only the surfaces a Soul App exposes through protocol and
  grants.

Current active docs still conflict with that direction. `GOALS.md` keeps an old
product-north-star role, `docs/architecture.md` still mixes Host-owned
artifact/review/memory services with Soul App autonomy, and the Soul App skill
still lists `GOALS.md` as required context.

## Decision

Converge active entrypoints to:

```text
AGENTS.md -> execution rules
docs/architecture.md -> architecture contract
```

Delete `GOALS.md` outright. Move useful current product intent into
`docs/architecture.md`; do not keep a redirect stub because it would preserve a
third conceptual entrypoint.

## Scope

In scope:

- Rewrite root `AGENTS.md` as the concise execution guide.
- Rewrite `docs/architecture.md` as the current Host / Soul App / protocol
  contract.
- Delete `GOALS.md`.
- Update Soul App developer skill and authoring guide.
- Update README and governance status wording where they expose stale current
  guidance.
- Sync PMA task, plan and changelog.

Out of scope:

- Runtime behavior changes.
- API/schema/migration changes.
- UI layout changes.
- Historical record rewrites under older PMA or Superpowers artifacts.

## Verification Plan

- `rg -n "GOALS\\.md|GOALS" AGENTS.md README.md docs/architecture.md docs/soul-app-developer.md docs/governance-node-status.md .agents/skills/aiworker-soul-app-dev/SKILL.md`
- `rg -n "Host owns .*artifact|Host owns .*review|Host owns .*memory|artifact indexing, reviews|memory admission" AGENTS.md README.md docs/architecture.md docs/soul-app-developer.md .agents/skills/aiworker-soul-app-dev/SKILL.md`
- `git diff --check`
- code-review-graph is skipped because this plan changes only documentation,
  root agent instructions and skill markdown.

## Implementation Record

- Replaced the current architecture contract with a Host / Soul App / protocol
  boundary that treats Host as platform locator and capability shell, while Soul
  Apps own domain state and meaning.
- Deleted the old north-star document and removed it from active entrypoints.
- Rewrote root agent guidance around the new two-file entrypoint model.
- Updated the Soul App development skill and authoring guide so app-owned
  artifact/profile/review/lesson semantics are exposed only through protocol.
- Updated README and the governance status note to stop presenting old
  Host-owned artifact/review/memory language as current guidance.

## Verification

- `rg -n "GOALS\\.md|GOALS" AGENTS.md README.md docs/architecture.md docs/soul-app-developer.md docs/governance-node-status.md .agents/skills/aiworker-soul-app-dev/SKILL.md`
- `rg -n "Host owns .*artifact|Host owns .*review|Host owns .*memory|artifact indexing, reviews|memory admission" AGENTS.md README.md docs/architecture.md docs/soul-app-developer.md .agents/skills/aiworker-soul-app-dev/SKILL.md`
- `rg -n "durable org memory|review/admission|artifact indexing" AGENTS.md README.md docs/architecture.md docs/soul-app-developer.md .agents/skills/aiworker-soul-app-dev/SKILL.md docs/governance-node-status.md`
- `git diff --check`
- code-review-graph skipped because this plan changes only documentation, root
  agent instructions and skill markdown.
