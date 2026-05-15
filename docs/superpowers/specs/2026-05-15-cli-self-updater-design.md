# CLI self-updater design

## Decision

AIWorker will add a top-level self-updater for the CLI and Host distribution.

`aiworker update` and `aiworker upgrade` are equivalent aliases. Both commands
execute the same upgrade flow. A read-only check is available through an
explicit flag such as `aiworker update --check`.

This feature upgrades the AIWorker distribution: CLI package, package-local Host
Web assets, worker DB migrations, and bundled official Soul App release
resources. It does not upgrade Soul worker domain data, business artifacts,
profiles, reviews, lessons, or per-worker compatibility state.

Future `aiworker worker <worker_id> update` and
`aiworker worker <worker_id> upgrade` commands are reserved for worker-scoped
compatibility and Soul App lifecycle work. They are not implemented by this
design.

## Product Semantics

The top-level update path is intentionally simple:

```text
aiworker update/upgrade
  -> detect current install source
  -> resolve latest stable release
  -> build upgrade plan
  -> confirm write and restart actions
  -> execute package or tarball upgrade
  -> run Host convergence for current AIWORKER_HOME
  -> restart managed background daemon when safe
  -> print upgrade report
```

Default automatic behavior is limited to discovery and reminders. Daemon
startup, `doctor`, or a similar Host readiness check may check for a newer
version at most once per day and report it. AIWorker must not replace the CLI or
restart a daemon unless the operator explicitly runs `aiworker update` or
`aiworker upgrade`.

## Command Surface

Top-level commands:

- `aiworker update`
- `aiworker upgrade`
- `aiworker update --check`
- `aiworker update --dry-run`
- `aiworker update --yes`
- `aiworker update --target <version>`
- `aiworker update --channel stable|preview`
- `aiworker update --pre`

`upgrade` accepts the same flags as `update`.

The default channel is `stable`. Stable resolves from npm `latest` and the
latest non-prerelease GitHub Release. Preview/prerelease versions are opt-in via
`--channel preview` or `--pre`.

`--check` is read-only and reports whether an update is available. `--dry-run`
builds and prints the planned write actions without performing them. `--yes`
skips the interactive confirmation for automation.

## Install Source Detection

The updater first identifies how the current CLI is running. It combines
multiple evidence points instead of trusting one path string:

- `process.argv[1]` and its real path;
- the package-local `dist/package.json` version and name;
- npm global prefix or bin links;
- Bun global install paths;
- `npx` / `bunx` ephemeral cache paths;
- source checkout paths under `apps/cli/src`;
- standalone GitHub release bundle markers.

Supported behavior by source:

| Source | Automatic execution | Behavior |
| --- | --- | --- |
| npm global | yes | Run `npm install -g @zonease/aiworker-cli@<target>`. |
| Bun global | yes | Run `bun install -g @zonease/aiworker-cli@<target>`. |
| GitHub tarball/binary | yes, with checksum | Download release asset, verify SHA256, replace atomically. |
| source checkout | no | Print source update commands and keep local files untouched. |
| `npx` / `bunx` ephemeral | no | Print a rerun command with the target version. |
| unknown | no | Print the upgrade plan and refuse automatic replacement. |

Detection failure must be conservative. If the updater cannot prove the current
installation source, it must not modify binaries or package manager state.

## Release Resolution

The release resolver has two backends:

- npm registry lookup for `@zonease/aiworker-cli`;
- GitHub Release lookup for `ZonEaseTech/aiworker`.

For package-manager installs, npm is the authority. For tarball/binary installs,
GitHub Release is the authority. The resolver compares the current version from
the running CLI package with the target version and reports `already_current`
when no upgrade is available.

The first implementation must support online checks. Offline behavior returns
a structured error that distinguishes network failure from "no update
available".

## Integrity And Replacement

npm and Bun global installs rely on package-manager integrity and lock their
write scope to the package manager command.

GitHub tarball or standalone binary upgrades require SHA256 verification. A
release asset without a matching checksum asset is not eligible for automatic
replacement. The updater reports the missing checksum and gives a manual
download path instead of falling back to unchecked replacement.

Binary replacement must be staged:

```text
download -> verify checksum -> extract/stage -> run version probe -> atomic swap -> post-upgrade probe
```

If staging or probing fails, the current installation remains untouched. If the
swap succeeds but the post-upgrade probe fails, the updater reports the failure
with the previous path and staged backup location.

## Host Convergence

After a successful CLI/package upgrade, the updater performs safe convergence
for the current `AIWORKER_HOME`:

- ensure the Host home exists;
- initialize and migrate `worker.db`;
- refresh package-local official HR/QA Soul App manifests and release resources
  through the normal install/enable lifecycle;
- preserve an operator's explicit disabled state for official apps;
- healthcheck refreshed official apps when static checks are available;
- print a report containing versions, migrations, app refresh results, daemon
  restart action, and next steps.

This convergence is Host metadata work. It does not interpret HR profiles, QA
release verdicts, business artifacts, reviews, lessons, or other app-owned
domain facts.

## Daemon Handling

If a daemon is running, the updater may restart it only when it can prove the
daemon was started by `aiworker daemon start` for the same `AIWORKER_HOME` and
is represented by the managed pid/log files.

Allowed automatic restart:

```text
managed pid file exists
  -> pid is alive
  -> pid command matches aiworker daemon foreground/start path
  -> AIWORKER_HOME matches current updater scope
  -> stop old daemon
  -> start daemon with previous host/port when known
```

All other daemon modes are reported but not restarted automatically:

- `daemon foreground`;
- source `dev`;
- tmux or manual shell sessions;
- unknown process command;
- mismatched `AIWORKER_HOME`.

The report must say exactly what was restarted or why a manual restart is
needed.

## Daily Update Notices

The default automatic check is a notice system, not a background updater.

AIWorker stores the last check timestamp and latest seen version under Host
metadata. It checks at most once per day per `AIWORKER_HOME` during safe
readiness paths such as `doctor` or daemon startup. The notice includes
the current version, target version, channel, and command to upgrade.

No automatic write, package install, binary replacement, migration, or daemon
restart happens from the daily notice path.

## Future Worker Update Namespace

The top-level design reserves, but does not implement:

```text
aiworker worker <worker_id> update
aiworker worker <worker_id> upgrade
```

That future namespace is worker-scoped and may cover:

- verifying the worker's bound Soul App manifest compatibility;
- refreshing app-projected capability templates for that worker;
- checking whether the worker needs an app-provided migration or review;
- reporting profile/review/lesson ledger compatibility state when exposed by
  the Soul App protocol.

It must not be an alias for top-level CLI self-update.

## Error Handling

Errors are reported as structured upgrade states:

- `already_current`;
- `source_not_supported`;
- `source_unknown`;
- `network_unavailable`;
- `target_not_found`;
- `checksum_missing`;
- `checksum_mismatch`;
- `package_manager_failed`;
- `staging_failed`;
- `replacement_failed`;
- `host_convergence_failed`;
- `daemon_restart_skipped`;
- `daemon_restart_failed`.

Failures before binary replacement leave the current CLI untouched. Failures
after package manager execution or binary replacement must clearly say which
steps completed and which remediation command to run next.

## Testing

Focused tests must cover:

- `update` and `upgrade` resolve to the same command handler;
- `--check` is read-only;
- npm global plan generation;
- Bun global plan generation;
- `npx` / `bunx` source detection refuses self-modification;
- source checkout detection refuses self-modification;
- GitHub tarball plan requires checksum assets;
- `--dry-run` performs no write action;
- daemon restart is limited to managed background daemons;
- Host convergence calls DB migration and official app refresh while preserving
  disabled official app state.

Implementation verification must include:

```bash
bun run --filter '@zonease/aiworker-cli' test
bun run --filter '@zonease/aiworker-cli' typecheck
bun run --filter '@zonease/aiworker-cli' build:bundle
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
git diff --check
```

If implementation touches shared Host/core/storage/API behavior, run the
matching focused package checks and the root `bun run check` gate.

If implementation touches production code, run code-review-graph before final
delivery:

```bash
bun run crg:update
bun run crg:review
```

## Non-Goals

- No background automatic binary replacement.
- No top-level update of Soul worker domain data.
- No worker-scoped update implementation in this slice.
- No third-party app marketplace update protocol.
- No Host Web update UI.
- No remote control plane.
- No unchecked GitHub binary replacement.
- No 1.0 GA release policy.

## Acceptance

The design is accepted when AIWorker has a clear implementation path where:

- `aiworker update` and `aiworker upgrade` are equivalent write-capable aliases;
- `aiworker update --check` is read-only;
- stable channel is the default;
- preview/prerelease is opt-in;
- npm and Bun global installs can be upgraded automatically;
- source checkout and ephemeral `npx` / `bunx` runs are not self-modified;
- GitHub tarball/binary upgrades require SHA256 checksums;
- successful upgrades converge Host metadata and official app manifests for the
  current `AIWORKER_HOME`;
- only managed background daemons are restarted automatically;
- future `worker update/upgrade` remains a separate worker-scoped namespace.
