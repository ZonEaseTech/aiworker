# TODO-030 Consolidate AIWorker validation skills into one entrypoint

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-06 04:25
- **completedAt**: 2026-05-06 04:45
- **plan**: PLAN-125

## Description

The AIWorker validation skills had drifted into several overlapping entrypoints:
remote fleet validation, local worker validation, published CLI release debug,
and Coder-specific published CLI validation. Consolidate the standard workflow
so future operators can independently choose the three standard modes plus the
Coder specialty mode:

- remote fleet validation;
- local source-tree worker validation;
- local published CLI black-box validation;
- remote Coder Claude Code validation.

## ActiveForm

Consolidating AIWorker validation skills.

## Dependencies

- **blocked by**: none
- **blocks**: future AIWorker validation campaigns

## Notes

- 2026-05-06 04:25: Started consolidation under `aiworker-test` with
  `fleet-remote`, `worker-source-local`, and `cli-release-local` modes.
- 2026-05-06 04:25: Initially converted `aiworker-test-fleet`,
  `aiworker-test-worker`, `aiworker-release-debug`, and
  `aiworker-coder-claude-engine` into compatibility entries.
- 2026-05-06 04:35: Reworked the canonical skill toward Claude Code skill
  conventions while keeping the existing symlink layout: manual invocation
  frontmatter for side-effectful workflows, lean `SKILL.md`, and one-level
  `references/` files for the three modes.
- 2026-05-06 04:45: Renamed the canonical skill to `aiworker-validate`, kept
  `aiworker-test` as a thin compatibility alias, added the `.claude/skills`
  symlink for the new name, and moved the Coder Claude Code workflow into
  `aiworker-validate/references/coder-claude-code.md`.
- 2026-05-06 04:55: Removed the redundant top-level compatibility skills and
  their `.claude/skills` symlinks. Historical release-debug references and
  templates now live under `aiworker-validate/`.
