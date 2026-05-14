# FEAT-081 Host and Soul App developer route onboarding

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 13:17
- **plan**: PLAN-313
- **relatesTo**: AGENTS.md, README.md, docs/architecture.md, docs/soul-app-developer.md, .agents/skills/aiworker-host-dev, .agents/skills/aiworker-soul-app-dev

## Context

New contributors can understand the Host/Soul App architecture from
`docs/architecture.md`, and Soul App contributors have an agent-native route
through `aiworker-soul-app-dev`. Host platform work is still routed indirectly
through the repository map and generic PMA stack skills.

This creates an onboarding asymmetry: "change a Soul App" is executable, while
"change Host behavior" requires too much local inference.

## Goals

- Add an agent-native Host development route.
- Make active entrypoints route Host and Soul App work clearly.
- Keep `docs/architecture.md` as the single architecture contract.
- Keep Soul App development guidance narrow and hand off Host-owned changes to
  the Host route.
- Avoid reviving retired `aiworker-validate` or old fleet/gateway validation
  flows.

## Non-Goals

- No runtime behavior changes.
- No product UI changes.
- No API, database, manifest, scaffold, or validation command changes.
- No new large onboarding portal.
- No rewrite of historical PMA or changelog records.

## Acceptance Criteria

- `AGENTS.md` and `README.md` answer where to start for Host work.
- `AGENTS.md`, `README.md`, and `docs/soul-app-developer.md` answer where to
  start for Soul App work.
- `.agents/skills/aiworker-host-dev/SKILL.md` exists with valid frontmatter and
  clear trigger conditions.
- `.agents/skills/aiworker-soul-app-dev/SKILL.md` explicitly hands Host-owned
  work to `aiworker-host-dev`.
- `docs/architecture.md` maps Host/Soul architecture ownership to repo paths
  and skills without becoming a second onboarding portal.
- `aiworker-validate` is not reintroduced.
- Instruction-only validation passes.

## Verification

- Parse `aiworker-host-dev` and `aiworker-soul-app-dev` frontmatter.
- Search active entrypoints for Host/Soul route references.
- Search active entrypoints to confirm `aiworker-validate` was not
  reintroduced.
- `git diff --check`
- Skip code-review-graph because only documentation and agent instruction files
  changed.

## Result

Completed.

- Added `.agents/skills/aiworker-host-dev/SKILL.md` as the agent-native route
  for Host daemon/API, Web shell, CLI lifecycle, runtime, broker, auth/security,
  shared protocol, storage metadata, fs layout and shared UI work.
- Updated `.agents/skills/aiworker-soul-app-dev/SKILL.md` so Host-owned changes
  are explicitly handed to the Host route instead of stretching Soul App scope.
- Updated `AGENTS.md`, `README.md`, `docs/architecture.md` and
  `docs/soul-app-developer.md` with active Host/Soul App development routing.
- Verified both skill frontmatter blocks parse, active entrypoints reference
  both route skills, `aiworker-validate` was not reintroduced as an active
  route, and `git diff --check` passed.
- Skipped code-review-graph because the change is documentation and agent
  instruction only; no production code changed.
