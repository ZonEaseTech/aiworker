# Dev home isolation design

## Decision

AIWorker source-checkout development defaults to `~/.aiworker-dev`.
Packaged, dist and npm-installed CLI defaults remain `~/.aiworker`.

`AIWORKER_HOME` and `WORKER_DB_PATH` remain explicit overrides and keep the
highest priority. This change isolates development state from operator preview
state without reintroducing project-scope `.aiworker/` auto-detection.

## Problem

The local daemon owns Host metadata, app registry state, worker/workspace files,
pid files and logs below `AIWORKER_HOME`. Published preview users should be able
to treat `~/.aiworker` as their local AIWorker home. Developers, however, often
run source-checkout commands directly while testing daemon, CLI and official
Soul App behavior.

When source-checkout commands and installed preview commands both default to
`~/.aiworker`, they compete for the same `aiworker.db`, app registry, selected
worker, workspaces, pid file and daemon log. That makes development tests noisy
and can accidentally mutate a real preview user's local state.

## Current baseline

- `packages/fs-layout` currently resolves only explicit `AIWORKER_HOME` or the
  user default `~/.aiworker`.
- `apps/cli/src/aiworker.ts` has its own fallback to `~/.aiworker`.
- Root dev scripts already isolate some flows, but they use `/tmp/aiworker-dev`.
- `docs/deployment.md` and `docs/cli.md` document packaged CLI behavior as
  `~/.aiworker`.
- Release smoke tests already use temporary `AIWORKER_HOME` values and should
  continue doing so.

## Scope

In scope:

- source-checkout CLI defaults;
- root development scripts such as `bun run dev`, `dev:host`, `dev:apps`,
  `dev:status` and `dev:clean`;
- docs that explain source development versus packaged CLI behavior;
- focused tests that prove source defaults, packaged defaults and explicit
  overrides.

Out of scope:

- no migration from `/tmp/aiworker-dev`;
- no migration from `~/.aiworker`;
- no project-root `.aiworker/` detection;
- no multi-profile UI or channel manager;
- no change to Host/Soul App ownership or data semantics.

## Architecture

The filesystem model remains Host-local:

```text
explicit AIWORKER_HOME or WORKER_DB_PATH
  -> always wins

source checkout / repo dev scripts
  -> default home: ~/.aiworker-dev

dist / npm / installed CLI
  -> default home: ~/.aiworker
```

The default only changes when no explicit home is configured. The distinction is
a CLI runtime packaging concern, not a Soul App or workspace concern.

`~/.aiworker-dev` is a durable development profile, not scratch state. It should
survive restarts and let developers inspect installed apps, workers, workspaces
and session behavior across local runs. Temporary release and smoke tests should
still use generated temp directories.

## Components

### CLI local path resolver

The CLI should centralize local path resolution so daemon commands, app commands
and work-object commands derive the same home, DB path, workers root, pid file
and log file.

The resolver should select a default home name:

- source checkout entrypoint: `.aiworker-dev`;
- dist or package entrypoint: `.aiworker`.

It must set or pass the resolved home before daemon/API boot so `getWorkerEnv()`
and hosted API defaults derive the same DB and workers root.

### fs-layout package

`packages/fs-layout` should remain the shared low-level path helper. It may
accept an explicit default-home option from CLI code, but it should not inspect
cwd for project markers and should not infer Soul App domain meaning.

### Development scripts

Root scripts should default to `$HOME/.aiworker-dev` instead of
`/tmp/aiworker-dev`.

`dev:clean` should continue to stop matching dev listeners and daemon pid state.
It should not delete `~/.aiworker-dev` unless a future explicit reset command is
added.

### Documentation

Docs should describe the split plainly:

- source-checkout development default: `~/.aiworker-dev`;
- packaged/npm operator default: `~/.aiworker`;
- `AIWORKER_HOME` override: supported for both;
- release smoke: use temp home.

## Data flow

Source-checkout development:

```text
bun apps/cli/src/aiworker.ts daemon foreground
  -> resolve default home ~/.aiworker-dev
  -> derive ~/.aiworker-dev/aiworker.db
  -> derive ~/.aiworker-dev/workers
  -> start local daemon and Host Web/API
```

Packaged preview:

```text
bunx @zonease/aiworker-cli daemon foreground
  -> resolve default home ~/.aiworker
  -> derive ~/.aiworker/aiworker.db
  -> derive ~/.aiworker/workers
  -> start local daemon and Host Web/API
```

Explicit override:

```text
AIWORKER_HOME=/tmp/aiworker-smoke aiworker daemon foreground
  -> use /tmp/aiworker-smoke for both source and packaged CLI
```

## Error handling

- If `AIWORKER_HOME` is set, no warning is needed; explicit operator choice
  wins.
- If `WORKER_DB_PATH` is set, it overrides the derived DB path while the home
  still owns pid, log and workers-root defaults.
- If source or packaged detection is uncertain, the CLI should fail toward an
  explicit resolver decision rather than silently mixing source and packaged
  defaults in one process.
- No automatic data migration should run. Existing data in `/tmp/aiworker-dev`
  or `~/.aiworker` remains untouched.

## Testing

Focused verification should cover:

- source CLI with no `AIWORKER_HOME` reports home `~/.aiworker-dev`;
- packaged/dist CLI with no `AIWORKER_HOME` reports home `~/.aiworker`;
- explicit `AIWORKER_HOME` wins in both modes;
- `WORKER_DB_PATH` wins over the derived DB path;
- root dev scripts print and use `~/.aiworker-dev`;
- daemon foreground sets a consistent home before API env defaults are read;
- release smoke continues to use temporary homes and does not depend on the dev
  default.

Suggested commands after implementation:

```bash
bun run --filter '@zonease/aiworker-fs-layout' test
bun run --filter '@zonease/aiworker-core' test
bun run --filter '@zonease/aiworker-cli' test
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
```

## Acceptance

The design is accepted when a developer can run source-checkout AIWorker without
explicit env vars and see dev state under `~/.aiworker-dev`, while an external
preview user running the published CLI still gets `~/.aiworker`.

The split must be visible in CLI JSON output or script output, documented in the
source-checkout and packaged CLI guides, and covered by focused tests. Existing
operator data under `~/.aiworker` must not be migrated, deleted or modified by
the source default change unless the developer explicitly points
`AIWORKER_HOME` there.
