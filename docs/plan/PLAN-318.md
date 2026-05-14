# PLAN-318 Dev home isolation

- **status**: implementing
- **createdAt**: 2026-05-14
- **approvedAt**: 2026-05-14
- **owner**: codex
- **relatedTask**: FEAT-083

## Context

AIWorker is a local-first Host/Soul App runtime. The Host-local daemon stores
platform metadata, installed apps, workers, workspaces, pid files and logs under
`AIWORKER_HOME`.

Published preview users should keep the operator default `~/.aiworker`.
Source-checkout development should use a durable but separate profile at
`~/.aiworker-dev`.

## Proposal

1. Add a `defaultHomeDir` option to `packages/fs-layout` so callers can choose a
   default directory name while preserving explicit override priority.
2. Add CLI-local source/dist detection:
   - package-local `official-apps/` or `web/worker/` means packaged mode and
     default `.aiworker`;
   - otherwise the source-checkout CLI default is `.aiworker-dev`.
3. Apply resolved local paths before DB migration or API bootstrap reads Core
   env defaults.
4. Change root dev scripts to `$HOME/.aiworker-dev`.
5. Document source and packaged defaults.

## Scope

In scope:

- Host-local path resolution for CLI and source scripts.
- Focused fs-layout/Core/CLI tests.
- Source docs and PMA bookkeeping.

Out of scope:

- Data migration.
- Deleting any existing runtime home.
- Project-local `.aiworker` auto-detection.
- UI profile management.

## Verification

- `bun run --filter '@zonease/aiworker-fs-layout' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Progress

- 2026-05-14: Implementation started from
  `docs/superpowers/specs/2026-05-14-dev-home-isolation-design.md`.

## Verification Results

Implementation records exact command output in this section before closeout.
