# PLAN-318 Dev home isolation

- **status**: completed
- **createdAt**: 2026-05-14
- **approvedAt**: 2026-05-14
- **completedAt**: 2026-05-14
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

- `bun run --filter '@zonease/aiworker-fs-layout' test`: passed, exit 0.
  `9 pass`, `0 fail`, `25 expect() calls`.
- `bun run --filter '@zonease/aiworker-core' test`: passed, exit 0.
  `28 pass`, `0 fail`, `143 expect() calls`.
- `bun run --filter '@zonease/aiworker-cli' test`: passed, exit 0.
  `21 pass`, `0 fail`, `124 expect() calls`.
- `bun run --filter '@zonease/aiworker-web' build`: passed, exit 0.
  Vite built Worker Web and `worker studio CSS check passed`.
- `bun run --filter '@zonease/aiworker-cli' build:bundle`: passed, exit 0.
  HR, QA and CLI bundles were emitted; `aiworker-bun.js` built successfully.
- Source CLI default proof:
  `tmp_home=/var/folders/78/cf_jm9m11273d_dn82yldnpr0000gn/T/tmp.2kW3udQpn3`;
  `HOME="$tmp_home" env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts init`
  exited 0 and returned `home:
  /var/folders/78/cf_jm9m11273d_dn82yldnpr0000gn/T/tmp.2kW3udQpn3/.aiworker-dev`
  with `dbPath:
  /var/folders/78/cf_jm9m11273d_dn82yldnpr0000gn/T/tmp.2kW3udQpn3/.aiworker-dev/aiworker.db`.
- Dist CLI default proof:
  `tmp_home=/var/folders/78/cf_jm9m11273d_dn82yldnpr0000gn/T/tmp.19Cg9ffW2m`;
  `HOME="$tmp_home" env -u AIWORKER_HOME -u WORKER_DB_PATH apps/cli/dist/aiworker.js init`
  exited 0 and returned `home:
  /var/folders/78/cf_jm9m11273d_dn82yldnpr0000gn/T/tmp.19Cg9ffW2m/.aiworker`
  with `dbPath:
  /var/folders/78/cf_jm9m11273d_dn82yldnpr0000gn/T/tmp.19Cg9ffW2m/.aiworker/aiworker.db`.
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`: passed,
  exit 0. Reported `PASS: dist CLI starts Host Web/API and bootstraps
  official Soul Apps`; daemon listened on `http://127.0.0.1:60203`; `/health`,
  `/`, Worker Web asset and `/api/local/apps` returned 200.
- `rg -n '/tmp/aiworker-dev' package.json scripts README.md docs/cli.md docs/deployment.md`:
  no matches; exit 1, expected and acceptable.
- `git diff --check`: passed, exit 0.
- `bun run crg:update`: passed, exit 0. Reported `Incremental: 0 files
  updated, 0 nodes, 0 edges (postprocess=full)`.
- `bun run crg:review`: passed, exit 0. Reported `No changes detected.`;
  no risk score was emitted because the pre-closeout worktree had no diff for
  code-review-graph to review.
