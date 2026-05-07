# TODO-040 Progressive CLI help and worker startup env shortcuts

- **status**: completed
- **priority**: P2
- **owner**: local
- **createdAt**: 2026-05-08 01:06
- **claimedAt**: 2026-05-08 01:06
- **completedAt**: 2026-05-08 01:32
- **plan**: PLAN-165
- **sourceObjective**: Make `aiworker --help` less intimidating for first-time
  users and add shortcuts for worker-local gateway enrollment env.
- **relatesTo**: TODO-039, REFACTOR-023, docs/cli.md, README.md,
  README.zh-CN.md

## Context

The root help currently exposes the complete implementation command tree,
including duplicate root/`worker` entries and advanced maintenance commands.
This makes first contact look heavier than the intended Project Brain + Worker
quickstart path.

Gateway enrollment already supports `AIWORKER_GATEWAY_URL` and
`AIWORKER_DISPLAY_NAME`, and `bootstrapDotenv()` can persist these startup env
keys when they are exported. The missing product surface is a direct command
that writes them to the current worker-local `.env` without asking users to
manually edit shell snippets.

## Scope

- Replace root `aiworker --help` with a progressive-disclosure first screen.
- Keep full command discovery available through command group help.
- Add worker-local startup env shortcuts for `AIWORKER_GATEWAY_URL` and
  `AIWORKER_DISPLAY_NAME`.
- Update focused CLI tests and current CLI docs/README snippets.

## Out of Scope

- No gateway runtime protocol changes.
- No executor overlay or engine config changes.
- No broad command rename or compatibility alias layer.
- No change to worker config JSON semantics.

## Acceptance Criteria

1. `aiworker --help` presents a short first-run path and does not expand every
   worker/fleet/gateway command.
2. Full command discovery remains available via group help.
3. A user can run direct commands to persist gateway URL and display name into
   the current worker-local `.env`.
4. Shortcuts fail with clear guidance when no initialized worker-local `.env`
   exists.
5. Tests cover root help shape, command registration/argv folding, env shortcut
   writes, and no-bootstrap help behavior.

## Notes

- 2026-05-08 01:06: Investigation found `cac` with custom
  `apps/cli/src/help.ts` root renderer. Worker startup env persistence already
  exists in `apps/cli/src/lib/dotenv-bootstrap.ts`, but only through explicit
  process env merge.

## Validation

- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts src/commands/worker/env.test.ts src/lib/bootstrap.test.ts` — pass (43 tests).
- `bun run typecheck` — pass.
- `bun run lint` — pass.
- `bun run --filter '@zonease/aiworker-cli' build:bundle` — pass.
- `git diff --check` — pass.
