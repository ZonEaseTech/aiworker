# AIWorker CLI

AIWorker CLI 是 Host local daemon 和 Soul App authoring 的本地入口。它不再承载旧
gateway/fleet 管理面，也不再使用 `brief/run` 产品路径。

## Primary Flow

源码调试：

```bash
bun apps/cli/src/aiworker.ts dev --host 127.0.0.1 --port 9217
```

源码调试默认把 Host-local state 放在 `~/.aiworker-dev`，避免与已安装 preview
CLI 的 `~/.aiworker` 竞争同一个 `aiworker.db`、pid/log 和 workspace tree。

安装或打包后：

```bash
aiworker daemon foreground --host 127.0.0.1 --port 9217
```

npm `0.x preview` 入口：

```bash
bunx @zonease/aiworker-cli daemon foreground --host 127.0.0.1 --port 9217
npx @zonease/aiworker-cli daemon foreground --host 127.0.0.1 --port 9217
```

安装或打包后的 CLI 默认使用 `~/.aiworker`。如果需要隔离环境，显式设置
`AIWORKER_HOME=<path>`；如果只想替换 DB 文件，设置 `WORKER_DB_PATH=<path>`。

Preview 包应能从 package-local 资源启动 Host Web/API、迁移 worker DB，并 bootstrap 官方
HR/QA Soul App；Host auth、1.0 发布承诺和独立 SDK/runtime npm 发布不属于这个 gate。

打开 Web：

```bash
aiworker open --port 9217
```

## Command Index

```text
aiworker init
aiworker dev
aiworker doctor
aiworker update|upgrade
aiworker daemon start|foreground|status|stop|logs|check
aiworker app list|show|install|enable|disable|doctor|permissions|bootstrap|create|validate|smoke
aiworker soul list
aiworker worker create|list|show|select
aiworker template list
aiworker workspace create|list|show
aiworker session start|list|show
aiworker turn send
aiworker files list|show
aiworker artifacts list|show|open
aiworker review list|show
aiworker lessons list|propose|accept|reject
aiworker settings list
aiworker engine select
aiworker open
aiworker commands
```

## Host Daemon

- `dev` runs the local daemon and hosted Worker Web in foreground.
- `daemon foreground` runs the same daemon directly.
- `daemon start` runs it in the background and writes pid/log files under
  `AIWORKER_HOME`.
- `daemon status|logs|check|stop` inspect or stop the local process.
- `doctor` checks host-local readiness without turning AIWorker into a remote
  control plane.

## Updates

`aiworker update` and `aiworker upgrade` are aliases for the AIWorker
distribution updater. They upgrade the CLI package, package-local Host Web
assets, worker DB migrations and bundled official Soul App release resources.

Use `aiworker update --check` for a read-only check. The default channel is
stable. Preview or prerelease targets require `--channel preview` or `--pre`.

Global npm and Bun installs can be upgraded through their package managers.
Source checkout, `npx`, `bunx` and unknown sources print a plan and do not
self-modify. GitHub release bundles require SHA256 checksum assets before
automatic replacement.

Future `aiworker worker <worker_id> update|upgrade` is reserved for
worker-scoped compatibility and is not the same command as top-level CLI
self-update.

## Soul Apps

- `app bootstrap official` installs/enables the official HR/QA Soul Apps through
  the normal app lifecycle.
- `app install <manifest>` registers a local Soul App manifest.
- `app enable|disable <id>` changes lifecycle state.
- `app doctor|permissions <id>` inspect static health and declared grants.
- `app create <id> --dir <path>` scaffolds a Soul App.
- `app validate <path>` checks manifest, assets and import boundaries.
- `app smoke <path>` runs standalone and Host-mounted smoke checks.

Host catalog entries are app-projected. Use app ids such as `aiworker-hr`, not
legacy built-in ids such as `hr`.

## Work Objects

- `worker create --soul <app-id>` creates a local Soul worker.
- `worker select <id>` stores the default worker for later commands.
- `template list --soul <app-id>` lists capability templates projected by the
  enabled app.
- `workspace create --worker <id>` creates a business workspace under a worker.
- `session start --workspace <id> --skill <template-id> --input <text>` creates
  a session and first turn.
- `turn send --session <id> --input <text>` continues an existing session.
- `files list|show`, `artifacts list|show|open`, `review list|show` and
  `lessons list|propose|accept|reject` inspect the Host-indexed outputs that
  the app/runtime exposed.

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
