# PLAN-313 Host and Soul App developer route onboarding

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 13:17
- **relatedTask**: FEAT-081

## Decision

Implement the dual-route onboarding model from
`docs/superpowers/specs/2026-05-14-host-soul-developer-onboarding-routing-design.md`.

Host work gets its own agent-native skill. Soul App work keeps the existing
Soul App skill and gains an explicit handoff when a request actually belongs to
Host platform responsibilities.

## Investigation

- `AGENTS.md` currently names the architecture contract and Soul App skill, but
  Host work is only represented by the repository map and generic PMA stack
  skills.
- `README.md` explains Host and Soul App roles, but does not give a direct "I
  want to change X" routing table.
- `docs/architecture.md` has a clear responsibility matrix, but does not map
  ownership to repo paths and agent skills.
- `docs/soul-app-developer.md` gives a good Soul App route and should remain
  Soul-focused.
- `.agents/skills/aiworker-soul-app-dev/SKILL.md` is intentionally narrow after
  recent cleanup and should not become a Host catch-all.

## Implementation Slices

1. PMA and Superpowers tracking.
2. Add `.agents/skills/aiworker-host-dev/SKILL.md`.
3. Update `.agents/skills/aiworker-soul-app-dev/SKILL.md` with Host handoff.
4. Update `AGENTS.md`, `README.md`, `docs/architecture.md`, and
   `docs/soul-app-developer.md` route wording.
5. Validate frontmatter, active references, diff hygiene, and commit.

## Verification Plan

- Frontmatter parse for both Host and Soul App skills.
- `rg` active entrypoints for `aiworker-host-dev`,
  `aiworker-soul-app-dev`, Host/Soul route references, and
  `aiworker-validate`.
- `git diff --check`
- No code-review-graph because this is docs/instruction-only.

## Result

Completed.

The repository now has two active agent-native development routes:

- Host work starts from `docs/architecture.md` and
  `.agents/skills/aiworker-host-dev/SKILL.md`.
- Soul App work starts from `docs/soul-app-developer.md` and
  `.agents/skills/aiworker-soul-app-dev/SKILL.md`.

The shared boundary remains anchored in `docs/architecture.md`, with entrypoint
docs routing protocol, broker, grant, shell and domain changes to the owning
side before implementation.

Verification:

- Parsed Host and Soul App skill YAML frontmatter.
- Searched active entrypoints for both skill references.
- Confirmed `aiworker-validate` was not reintroduced as an active route.
- Ran `git diff --check`.
- Skipped code-review-graph because only docs and agent instructions changed.
