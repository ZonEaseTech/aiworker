# AIWorker Runtime

AIWorker no longer has an employee-side runtime. Paseo is the runtime.

## Runtime responsibility split

AIWorker CLI/Web/control responsibilities:

- run AIWorker CLI/Web/API control-plane actions;
- call `aissh exec`/file transfer for provisioning;
- render/copy Soul release files into a target Project workdir;
- record assignment, status, receipt, and handoff metadata;
- redact secrets from outputs.

Paseo runtime responsibilities:

- daemon lifecycle and client connectivity;
- workspace UI and state;
- sessions, terminal, browser, diff, logs;
- provider process launch and supervision;
- permission prompts and agent modes;
- provider CLI authentication context.

## Home model

AIWorker home 在任何机器上都是 `~/.aiworker`（`AIWORKER_HOME` 覆盖），按角色分目录。中心机角色把 management-plane SoT 默认落在 `~/.aiworker/control-plane`（`snapshot.json` + append-only `receipts.jsonl` / `audit-events.jsonl` / `projection-manifests.jsonl`）。目标机角色对每个员工派生 owner-scoped 子树 `~/.aiworker/<userSlug>/{.paseo,run,projects/<project>}`。AIWorker 派生的 `PASEO_HOME` 永远落在 `$HOME/.aiworker/<userSlug>/.paseo` 之下，绝不产出裸 `$HOME/.paseo`：这是无条件不变量，由 contract test 钉死，确保 AIWorker 不踩目标机上别人自己安装的 Paseo。`userSlug` 受 `RESERVED_USER_SLUGS` 守卫，不得撞上 home 结构保留名。

## Daemon model

AIWorker does not run a Worker daemon. It may start or verify a Paseo daemon on a target machine under the actual `aissh` execution identity. That identity's canonical remote `HOME` is the path authority.

Default production topology:

```text
one target aissh HOME -> many AIWorker owner scopes
one assigned user -> $HOME/.aiworker/<userSlug>/.paseo -> one Paseo daemon loopback endpoint -> many Soul-backed Project workdirs
```

Multiple daemon instances on one device are represented by separate owner-scoped `PASEO_HOME` directories and stable loopback TCP endpoints derived from `userSlug`. AIWorker must not point an assignment at another assigned user's owner scope. Separate OS users, containers, or VMs are still valid and stronger when provider CLI credential isolation must be guaranteed.

AIWorker treats `PaseoEnvironment.ownerEmail` as the logical owner/admin of the target execution identity. `WorkspaceAssignment.assignedEmail` owns the derived `$HOME/.aiworker/<userSlug>` scope. New `plan`, `apply`, and `pair` flows require either `--target-owner <email>` or `--dedicated-target-user`; `--target-owner` does not have to match `--user` when the owner-scoped topology is used. A `root` or shared-looking login can be used for Alice by deriving Alice's owner scope under that HOME. AIWorker does not guarantee provider CLI credential isolation in this shared-HOME mode and must surface that risk to administrators.

## Project workdir model

AIWorker creates normal directories that Paseo can use as Project workdirs. The default Project root is derived on the target as `$HOME/.aiworker/<userSlug>/projects/<project>`. Soul projection is file copying, not an AIWorker runtime service.

Paseo owns project/workspace registration and session lifecycle by opening or running against that directory (`paseo --host <owner-loopback-host> <dir>` / `paseo run --host <owner-loopback-host> --cwd <dir>`). `paseo worktree` is only for optional git worktree isolation when a Project is already a git checkout; AIWorker does not create a worktree as the default Soul projection target.

A Paseo project/workspace can contain multiple Paseo sessions. AIWorker does not persist or inspect those sessions.

## aissh MVP integration

AIWorker invokes `aissh` only as a thin provisioning transport. It does not own the remote runtime after the Project workdir files are projected.

AIWorker Web may present the same provisioning inputs, plan previews, redacted receipts, and handoff metadata as the CLI. `aiworker apply --control-plane-dir <dir>` writes the local management-plane snapshot plus append-only receipt/audit/projection JSONL records that Web may read. Those records omit the generated provisioning script body, raw provider JSON/model payloads, stdout/stderr transcripts, pairing URLs, and QR payloads. Web must not observe or store Paseo runtime state after handoff. The release server binds to `127.0.0.1` by default; non-loopback listening requires explicit `AIWORKER_WEB_ALLOW_REMOTE=1` and must sit behind an authenticated admin boundary. State-changing Web API calls require the admin mutation header and same-origin request semantics, with an optional bearer admin token for hardened deployments.

The Web admin token/bootstrap path is intentionally local and narrow:

- `aiworker web` 无参时把 control-plane 解析为默认 home `~/.aiworker/control-plane`（`AIWORKER_HOME` 覆盖），lazy 创建并以它为 live snapshot 绑定运行。`--control-plane-dir` / `AIWORKER_CONTROL_PLANE_DIR` 显式覆盖该默认值；只有当默认 home 无法解析或创建时，Web 才退化为 fixture 预览兜底。`apply` 与元数据 create/edit 命令不享受该默认，仍要求显式 control-plane 目录。
- `AIWORKER_WEB_ADMIN_TOKEN` requires a matching bearer token for state-changing Web API calls, but it is not enterprise SSO/RBAC.
- `bun run setup:logto` creates/updates a Logto Traditional app and writes the runtime `LOGTO_CLIENT_*` tuple into ignored `.env`.
- Complete Logto runtime configuration makes browser navigation require a Logto admin session. Partial Logto configuration fails closed with `admin_auth_misconfigured`.
- API reads and mutations may use a valid Logto session or a valid `AIWORKER_WEB_ADMIN_TOKEN`; mutations still require the admin action header and same-origin request semantics.
- Logto routes are limited to `/login`, `/callback`, `/logout`, and `/api/auth/session`. They must not proxy Paseo workspace UI, runtime sessions, logs, provider prompts, or employee-side traffic.
- `/api/admin-data` may report whether a token is required and whether a control-plane directory is bound, but it must never return the token value.
- Browser token storage is only an operator bootstrap convenience for the private app; durable authority remains the server environment plus the external admin boundary.
- Web error responses use stable redacted remediation codes and must not echo raw aissh/Paseo stdout/stderr, generated scripts, provider JSON/model output, pairing URLs, QR payloads, transcripts, or literal secrets.

Provisioning scripts must discover and validate the remote execution identity before touching Paseo:

```text
whoami / id -u / pwd -P / PATH
canonical HOME = cd "$HOME" && pwd -P
PASEO_HOME = "$HOME/.aiworker/<userSlug>/.paseo"
PASEO_LISTEN = "127.0.0.1:<stable-user-port>"
project_workdir = "$HOME/.aiworker/<userSlug>/projects/<safe-name>"
```

Before any `paseo daemon` or `paseo provider` command, scripts unset inherited `PASEO_HOST` so readiness checks cannot be redirected to another daemon. Provider readiness is checked under the same identity and owner-scoped daemon endpoint with the `paseo-provider-json-v1` contract: `paseo provider ls --host "$AIWORKER_PASEO_HOST" --json` is a warning-only diagnostic. If the selected provider is missing, disabled, or unreadable, AIWorker continues Project workdir projection and records remediation guidance. AIWorker does not call `paseo provider models` as a provisioning gate and must not store raw provider JSON, model lists, provider stderr, transcripts, pairing URLs, or QR codes.

The default provisioning script does not execute `paseo daemon pair`, because that command prints real pairing material. Handoff is instruction-only: after provisioning, the operator/employee may run `aiworker pair --user <email> --target-owner <email> --target <aissh-ref> --soul <dist/soul.descriptor.json>` or run `paseo daemon pair --home "$PASEO_HOME"`, then open the prepared Project workdir with `paseo --host "$PASEO_LISTEN" <dir>` or start an agent with `paseo run --host "$PASEO_LISTEN" --cwd <dir>`. `aiworker pair` is intentionally transient: successful pairing output may show the raw Paseo pairing response to the current caller, but AIWorker does not persist it to the control-plane snapshot, receipts, audit events, logs, or projection manifests. Daemon pairing is not Project registration/open evidence; a headless Project smoke may claim only that `paseo run --host <owner-loopback-host> --cwd <dir>` succeeded. AIWorker Web may expose pair as a one-click post-approval action only by calling the same CLI path and rendering the immediate response in the current page; it must not copy the pairing URL or QR into Web storage, approval records, receipts, or audit records.

Adopted from the `aiworker-next` aissh integration audit:

- `aissh-cli` is declared as an optional CLI dependency of `@zonease/aiworker-cli`; runtime resolution is `--aissh-bin` / `AISSH_BIN` first, then bundled `node_modules/aissh-cli/bin/aissh.js` through the current Node/Bun process, then `PATH` fallback.
- aissh execution receives credentials through environment variables: `AISSH_TOKEN` is required at the aissh process boundary and `AISSH_SERVER` is optional when the aissh control plane needs it. The CLI may load a source-checkout `.aissh.yaml` token only to pass it through as `AISSH_TOKEN` from a neutral cwd; it must not print, persist, copy, or project that value. The Web live E2E harness itself does not parse `.aissh.yaml` and requires `AISSH_TOKEN` in the process environment.
- aissh is executed from a neutral temporary directory so a local `./.aissh.yaml` in the execution cwd cannot silently override explicit env credentials.
- remote file projection uses shell quoting and base64 file writes; receipts and command output are redacted.

Not adopted: OpenClaw/Paseo gateway lifecycle management, port allocation, health loops, plugin install orchestration, self-healing, or reconciliation. Those are runtime responsibilities of Paseo/community tooling, not AIWorker.
