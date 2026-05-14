# PLAN-197 Project init worker pack materialization

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 17:24
- **approvedAt**: 2026-05-09 17:24
- **completedAt**: 2026-05-09 18:10
- **relatedTask**: REFACTOR-031

## Current State

`aiworker init` currently seeds:

- `.aiworker/SOUL.md`
- `.aiworker/policy.json`
- `.aiworker/brain-capabilities.json`
- `.aiworker/executor-capabilities.json`
- `.aiworker/native-skill-projections.json`
- `.aiworker/scope.json`
- native executor project skills for AIWorker governance guidance

S3A added `WorkerPack` registry and `aiworker pack list/show`, but init does not yet create
the OD-style business assets that should anchor the local worker workbench.

The existing seed path constraints are split:

- native skill files may write to managed `.agents/skills/aiworker-*` and `.claude/skills/aiworker-*`;
- fallback brain skill files may write under `.aiworker/skills`;
- there is no generic `.aiworker`-local pack seed field.

## Proposal

1. Extend fs-layout project seed
   - Add `workerPackFiles?: Record<string, string>` to `ProjectAiworkerSeed`.
   - Resolve those paths under `.aiworker/` only.
   - Reject absolute paths, `..`, and paths outside:
     - `worker-packs/<id>/SKILL.md`
     - `domain-systems/<id>/DOMAIN.md`

2. Extend CLI init pack selection
   - Add `InitOptions.pack`.
   - Add `--pack <id>` to root init command.
   - Resolve explicit pack by id; unknown id returns exit 2 with supported ids.
   - If no explicit pack is provided, map `--soul <id>` to a same-id worker pack when one exists.
   - Existing re-init without a Soul remains idempotent and does not prompt for a pack.

3. Seed content and policy
   - Materialize selected pack `skillMd` and `domainMd`.
   - Add `workerPack` metadata to `policy.json`:
     - `id`
     - `label`
     - `source`: `flag` or `soul-default`

4. Operator UX
   - Preflight shows selected worker pack.
   - Preflight create/preserve lists pack asset paths.
   - Next steps point to `.aiworker/worker-packs/<id>/SKILL.md`,
     `.aiworker/domain-systems/<id>/DOMAIN.md`, and `aiworker pack show <id>`.

5. Tests
   - Add fs-layout guard coverage for valid pack files and path escape rejection.
   - Add CLI integration coverage for default pack, explicit pack override, and unknown pack.
   - Update existing init expectations only where the new output is part of the accepted S3B surface.

## Risks

- **Soul / pack confusion**: output must say Soul is brain/persona while worker pack is workbench asset.
- **Path escape risk**: pack seed paths are new write inputs; guard them in fs-layout, not only CLI.
- **Scope creep**: do not build Web picker or parser in this slice.
- **Matrix cost**: full init matrix already loops over all Soul presets; keep pack assertions focused to avoid slow tests.

## Verification

- `bun run --filter '@zonease/aiworker-fs-layout' test -- src/index.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test -- src/commands/worker/init.integration.test.ts src/aiworker.test.ts`
- changed package typecheck
- `git diff --check`
- code-review-graph change review

## Progress

- 2026-05-09 17:24：完成 S3B 调查；确认使用 `.aiworker/worker-packs` 与
  `.aiworker/domain-systems`，并把 explicit `--pack` 与 soul-default 映射纳入 init。
- 2026-05-09 18:10：完成 fs-layout 受限 pack seed、CLI `init --pack`、默认
  same-id pack 物化、preflight / next steps / help 更新，以及 focused tests、
  typecheck、diff check、CRG 审查。
