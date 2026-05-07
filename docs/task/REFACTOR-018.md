# REFACTOR-018 Soul-initialized Brain Skill Packs

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-07 09:33
- **claimedAt**: 2026-05-07 09:33
- **completedAt**: 2026-05-07 09:45
- **plan**: PLAN-151
- **sourceObjective**: Initialize each Soul with maintainable OD-style Brain
  Skill Packs under Project Brain, while keeping executor-native skills and
  AIWorker brain skills explicitly separated.
- **relatesTo**: REFACTOR-016, PLAN-149, docs/architecture.md,
  tmp/open-design-research/docs/skills-protocol.md

## Context

REFACTOR-016 moved built-in Soul identity authoring to Markdown Soul Packs. The
next gap is Soul-specific brain skills. Runtime already treats
`.aiworker/skills/` as the canonical Project Brain skill surface, but the
filesystem scanner currently recursively treats every Markdown file under
`skills/` as a skill. That conflicts with the open-design directory-pack model
where `SKILL.md` is the entrypoint and `references/` / `assets/` are sidecars.

## Scope

- Add a shared Brain Skill Pack loader for `SKILL.md` files with YAML
  frontmatter.
- Ship a small kernel skill set plus Soul-owned default skills.
- Materialize kernel + selected-Soul skills during `aiworker init`.
- Change runtime/doctor scanning to recognize directory-pack `SKILL.md`
  entrypoints instead of every Markdown sidecar.
- Keep brain skills separate from executor-native skills/plugins/MCP overlays.

## Out of Scope

- Project-local skill install/remove commands.
- Executor-native skill/plugin projection.
- Fleet/gateway changes.
- UI changes.

## Acceptance Criteria

1. Built-in Brain Skill Packs are authored as `SKILL.md` directory packages.
2. `aiworker init --soul <id>` seeds `.aiworker/skills/kernel.*` and
   `.aiworker/skills/<soul>.*` entries without overwriting existing files.
3. Runtime `brain skills` lists only `SKILL.md` entrypoints and ignores
   sidecar Markdown files.
4. Skill ids are stable project-relative ids, not absolute paths.
5. Focused shared/fs-layout/core/CLI tests pass.

## Notes

- 2026-05-07 09:33: Implementation approved after the skill placement design:
  source-owned packs live with kernel or Soul Pack source; materialized runtime
  copies live in Project Brain `.aiworker/skills/`.
- 2026-05-07 09:45: Completed. `aiworker init --soul <id>` now seeds kernel
  Brain Skill Packs plus the selected Soul's default pack into
  `.aiworker/skills/<id>/SKILL.md`; scanner/doctor only treat `SKILL.md`
  entrypoints as skills and ignore sidecar Markdown.

## Validation

- `bun run --filter '@zonease/aiworker-shared' test` PASS: 146 pass / 0 fail.
- `bun run --filter '@zonease/aiworker-fs-layout' test` PASS: 22 pass / 0 fail.
- `bun run --filter '@zonease/aiworker-core' test src/worker/brain/providers/filesystem` PASS: 2 pass / 0 fail.
- `bun run --filter '@zonease/aiworker-cli' test src/capabilities/validation.test.ts src/soul/presets.test.ts src/commands/worker/init.integration.test.ts` PASS: 24 pass / 0 fail.
- `bun run typecheck` PASS.
- `bun run lint` PASS.
- `bun run --filter '@zonease/aiworker-cli' build:bundle` PASS.
- `git diff --check` PASS.
