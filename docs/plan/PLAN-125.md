# PLAN-125 Consolidate AIWorker validation skills

- **status**: completed
- **createdAt**: 2026-05-06 04:25
- **approvedAt**: 2026-05-06 04:25
- **completedAt**: 2026-05-06 04:45
- **relatedTask**: TODO-030

## Context

Current AIWorker validation was split across four skills:

- `aiworker-test-fleet` for remote fleet and fleet-attached worker checks;
- `aiworker-test-worker` for local worker checks;
- `aiworker-release-debug` for published CLI Project Brain campaigns;
- `aiworker-coder-claude-engine` for a remote Coder workspace path.

The user objective is to make the validation workflow independently usable for
three standard paths: remote fleet testing, local source-version worker testing,
and local published CLI testing. The Coder Claude Code workflow is retained as
a specialty mode, not as a separate long-form top-level skill.

## Proposal

1. Add a new canonical validation skill with explicit modes:
   `fleet-remote`, `worker-source-local`, `cli-release-local`, and
   `coder-claude-code`.
2. Keep safety, isolation, evidence, PMA filing, cleanup, and final-reporting
   rules in the canonical skill so future prompts do not need to load several
   overlapping runbooks.
3. Remove redundant older `aiworker-*` validation entries after the canonical
   skill is in place.
4. Keep `aiworker-release-debug` references and templates as historical
   deep-campaign helpers, loaded only when needed.
5. Update skill UI metadata and validate frontmatter.

## Risks

- Existing prompts may still invoke old skill names. This is accepted to keep
  the active skill list clean; users should invoke `aiworker-validate`.
- Historical release-debug recipes are still useful for deep campaigns; they
  remain in place instead of being deleted.

## Scope

- `.agents/skills/aiworker-validate/**`
- `.claude/skills/aiworker-validate`
- PMA tracking docs and changelog.

## Alternatives

- Keep thin aliases. Rejected because they continue to pollute the skill list.
- Only edit descriptions. Rejected because old entries would still carry
  overlapping trigger surfaces.

## Validation

- Claude Code style frontmatter validation for `disable-model-invocation`,
  `argument-hint`, and `arguments`.
- `git diff --check`.
- Manual completion audit against the three required modes.

## Annotations

- 2026-05-06 04:25: Implemented as approved by the active objective.
- 2026-05-06 04:35: Follow-up refactor after official Claude Code skill
  review: kept `.agents/skills` as the source plus `.claude/skills` symlink,
  split the canonical runbook into mode references, and marked side-effectful
  skills as manual invocation.
- 2026-05-06 04:45: Renamed the canonical entry to `aiworker-validate`, kept
  `aiworker-test` as a compatibility alias, and demoted
  `aiworker-coder-claude-engine` to a thin alias backed by
  `references/coder-claude-code.md`.
- 2026-05-06 04:55: Removed redundant compatibility skills and their symlinks.
  Historical release-debug resources were moved under `aiworker-validate`.
