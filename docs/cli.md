# AIWorker CLI

AIWorker CLI 是 Host local daemon lifecycle、operator locator 和 Soul App
authoring 的本地入口。它不承载远程控制面，也不使用 `brief/run` 产品路径。

## Primary Flow

安装或打包后：

```bash
aiworker daemon start --host 127.0.0.1 --port 9217
aiworker open --port 9217
```

常用 lifecycle：

```bash
aiworker daemon status
aiworker daemon logs
aiworker daemon restart
aiworker daemon stop
```

源码 checkout 开发：

```bash
bun run dev
```

源码态默认把 Host-local state 放在 `~/.aiworker-dev`，避免与已安装 preview
CLI 的 `~/.aiworker` 竞争同一个 `aiworker.db`、pid/log 和 workspace tree。
`aiworker dev` 仅保留为 source-checkout compatibility alias；repo 开发优先使用
`bun run dev`，前台 daemon 调试使用 `aiworker daemon foreground`。

npm `0.x preview` 入口：

```bash
bunx @zonease/aiworker-cli daemon start --host 127.0.0.1 --port 9217
npx @zonease/aiworker-cli daemon start --host 127.0.0.1 --port 9217
```

安装或打包后的 CLI 默认使用 `~/.aiworker`。如果需要隔离环境，显式设置
`AIWORKER_HOME=<path>`；如果只想替换 DB 文件，设置 `WORKER_DB_PATH=<path>`。

Preview 包应能从 package-local 资源启动 Host Web/API、迁移 worker DB，并 bootstrap 官方
HR/QA Soul App；Host auth、1.0 发布承诺和独立 SDK/runtime npm 发布不属于这个 gate。

## Command Index

Default `aiworker --help` and `aiworker commands` show the compact operator
surface:

```text
aiworker daemon start|stop|restart|status|logs
aiworker open
aiworker doctor
aiworker update
aiworker app list|show|install|enable|bootstrap
aiworker worker create|list|select
aiworker workspace create|list
aiworker session start|list|show
aiworker turn send
```

Use `aiworker --help --all` or `aiworker commands --all` for authoring,
diagnostics, inspection and compatibility commands.

## Host Daemon

- `daemon start` runs it in the background and writes pid/log files under
  `AIWORKER_HOME`.
- `daemon stop` stops the managed local daemon and clears its pid file.
- `daemon restart` stops a running daemon, waits for the old process to exit,
  and starts a fresh daemon.
- `daemon status|logs` inspect the managed process.
- `daemon foreground|check` remain callable diagnostics/compatibility commands
  but are not part of the default operator surface.
- `dev` is a source-checkout compatibility alias for `daemon foreground`; repo
  development should use `bun run dev`.
- `doctor` checks host-local readiness without turning AIWorker into a remote
  control plane.

## Updates

`aiworker update` and `aiworker upgrade` are aliases for the AIWorker
distribution updater. They upgrade the CLI package, package-local Host Web
assets, worker DB migrations and bundled official Soul App release resources.

`aiworker update` executes safe update actions by default. Use
`aiworker update --check` for a read-only check and `aiworker update --dry-run`
to print the planned write actions without performing them. The default channel
is stable. Preview or prerelease targets require `--channel preview` or `--pre`.

If a managed daemon for the same `AIWORKER_HOME` is running, `aiworker update`
automatically restarts it after the package/bundle update and Host convergence.
If no daemon is running, update does not start one. If the pid points to a
source checkout, `dev` process, mismatched home or unknown command, update
reports the reason and leaves the process untouched.

Global npm and Bun installs can be upgraded through their package managers.
Source checkout, `npx`, `bunx` and unknown sources print a plan and do not
self-modify. GitHub release bundles require SHA256 checksum assets before
automatic replacement.

`aiworker upgrade` remains a compatibility alias for `aiworker update`, but it
is not part of the default compact operator command index.

Future `aiworker worker <worker_id> update|upgrade` is reserved for
worker-scoped compatibility and is not the same command as top-level CLI
self-update.

## Soul Apps

- `app bootstrap official` installs/enables the official HR/QA Soul Apps through
  the normal app lifecycle.
- `app install <manifest>` registers a local Soul App manifest.
- `app enable <id>` changes lifecycle state.
- `app disable|doctor|permissions <id>` remain advanced lifecycle/security
  commands.
- `app create <id> --dir <path>` scaffolds a Soul App with micro-app
  route/widget surfaces, app-owned mounted API paths and `ui.workspaceContext`
  for Host-owned workspace process context.
- `app validate <path>` checks manifest, assets and import boundaries.
- `app smoke <path>` runs standalone and Host-mounted smoke checks, including
  mounted-service health for apps that declare a local service command.

Host catalog entries are app-projected. Use app ids such as `aiworker-hr`, not
legacy built-in ids such as `hr`.

## Work Objects

- `worker create --soul <app-id>` creates a local Soul worker.
- `worker select <id>` stores the default worker for later commands.
- `workspace create --worker <id>` creates a business workspace under a worker.
- `session start --workspace <id> --skill <template-id> --input <text>` creates
  a session and first turn.
- `turn send --session <id> --input <text>` continues an existing session.
- `template list` and `files list|show` remain compatibility inspection commands
  for app-declared templates and workspace files. They are available through
  `aiworker commands --all`, not the default operator surface.
- Generic `artifacts *`, `profile promote`, `review *` and `lessons *` commands
  have been removed from the CLI. New operator workflows should go through Soul
  App mounted UI, app-owned actions or app-owned workspace files; destructive
  local migrations may drop the retired Host rows.
- HR profile updates, QA release decisions and similar domain confirmations
  belong to the owning Soul App. Host CLI should locate worker/workspace/session
  context and open the app surface instead of promoting generic Host records.

## Settings And Engines

- `settings list` prints Host daemon settings.
- `engine select <engine>` stores a best-effort default engine hint.

External engines own their auth, model routing, tool loop, sandbox and native
sessions. See `docs/executor-engines.md` for install/login guidance.

## Verification

CLI changes usually need:

```bash
bun run --filter '@zonease/aiworker-cli' test
bun run --filter '@zonease/aiworker-cli' typecheck
bun run --filter '@zonease/aiworker-cli' build:bundle
```

Cross-package Host/Soul protocol changes should also run the focused Core/API/Web
checks that own the touched files.

For npm preview release readiness:

```bash
bun run --filter '@zonease/aiworker-web' build
bun run --filter '@zonease/aiworker-cli' build:bundle
cd apps/cli/dist && npm pack --dry-run --json
bun run --filter '@zonease/aiworker-cli' smoke:dist-release
```
