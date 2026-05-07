# PLAN-151 Soul-initialized Brain Skill Packs

- **status**: completed
- **createdAt**: 2026-05-07 09:33
- **approvedAt**: 2026-05-07 09:33
- **completedAt**: 2026-05-07 09:45
- **relatedTask**: REFACTOR-018

## Current State

1. Built-in Soul identity now uses file-first Soul Packs.
2. Project Brain skills already live under `.aiworker/skills/`.
3. The current scanner recursively parses `**/*.{md,yaml,yml}`, which would
   misclassify OD-style `references/*.md` sidecars as separate brain skills.
4. `aiworker init` creates the `skills/` directory but does not seed
   Soul-specific skill packs.

## Proposal

1. Add a `BrainSkillPack` loader in shared code:
   - parses `SKILL.md` frontmatter;
   - validates existing `SkillMetadata` plus a required `id`;
   - keeps the full Markdown body for materialization.
2. Add built-in source-owned packs:
   - kernel packs under `packages/shared/src/brain/skills/kernel/`;
   - Soul packs under `packages/shared/src/soul/packs/<soul>/skills/`.
3. Extend `SoulPack` to carry optional `brainSkillPacks`.
4. Extend project bootstrap seed to write skill files under
   `.aiworker/skills/<id>/SKILL.md` without overwriting.
5. Change filesystem skill scanning and doctor validation to only parse
   `**/SKILL.md`, deriving stable ids from the relative package directory.
6. Update architecture docs and focused tests.

## Risks

1. Bundle risk: Markdown text imports must remain compatible with CLI bundle.
2. Scanner behavior is intentionally breaking before 1.0.0; free-floating
   `skills/foo.md` will stop being treated as a brain skill.
3. Too many default skills would bloat prompt context. This slice seeds a small
   set and still only advertises names/descriptions in the system prompt.

## Scope

- `packages/shared/src/brain/`
- `packages/shared/src/soul/`
- `packages/fs-layout/src/index.ts`
- `packages/core/src/worker/brain/providers/filesystem/`
- `apps/cli/src/capabilities/validation.ts`
- `apps/cli/src/commands/worker/init.ts`
- focused tests and architecture docs

## Non-Scope

- No executor-native skill installation.
- No gateway/fleet bridge changes.
- No Web UI work.

## Validation

- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-fs-layout' test`
- `bun run --filter '@zonease/aiworker-core' test src/worker/brain/providers/filesystem`
- `bun run --filter '@zonease/aiworker-cli' test src/commands/worker/init.integration.test.ts src/capabilities/validation.test.ts`
- `bun run typecheck`
- `bun run lint`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `git diff --check`

## Progress

- 2026-05-07 09:33: Task claimed and implementation started.
- 2026-05-07 09:45: Completed. Added Brain Skill Pack loader, kernel skill
  packs, one default skill pack per built-in Soul, project bootstrap
  materialization, `SKILL.md`-only scanner/doctor validation, and focused
  regression tests.
