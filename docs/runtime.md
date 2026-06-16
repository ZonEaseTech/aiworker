# AIWorker Runtime

AIWorker no longer has an employee-side runtime. Paseo is the runtime.

## Runtime responsibility split

AIWorker CLI/Web/control responsibilities:

- run AIWorker CLI/Web/API control-plane actions;
- call `aissh exec`/file transfer for provisioning;
- render/copy Soul release files into a target workspace directory;
- record assignment, status, receipt, and handoff metadata;
- redact secrets from outputs.

Paseo runtime responsibilities:

- daemon lifecycle and client connectivity;
- workspace UI and state;
- sessions, terminal, browser, diff, logs;
- provider process launch and supervision;
- permission prompts and agent modes;
- provider CLI authentication context.

## Daemon model

AIWorker does not run a Worker daemon. It may start or verify a Paseo daemon on a target machine under the actual `aissh` execution identity. That identity's canonical remote `HOME` is the path authority.

Default production isolation:

```text
one employee -> one OS user/rootless container/VM -> one HOME -> one PASEO_HOME -> one Paseo daemon -> many Soul workspaces
```

Multiple daemon instances on one device are allowed only with separate execution identities or explicitly separated HOME-bound daemon state. AIWorker must not point an `aissh` login at another user's `PASEO_HOME`, workspace directory, or provider credential home.

## Workspace model

AIWorker creates normal directories that Paseo can use as workspaces. The default workspace root is derived on the target as `$HOME/aiworker-workspaces/<workspace>`. Soul projection is file copying, not an AIWorker runtime service.

A workspace can contain multiple Paseo sessions. AIWorker does not persist or inspect those sessions.

## aissh MVP integration

AIWorker invokes `aissh` only as a thin provisioning transport. It does not own the remote runtime after the workspace files are projected.

AIWorker Web may present the same provisioning inputs, plan previews, redacted receipts, and handoff metadata as the CLI. `aiworker apply --control-plane-dir <dir>` writes the local management-plane snapshot plus append-only receipt/audit/projection JSONL records that Web may read. Those records omit the generated provisioning script body, raw provider JSON/model payloads, stdout/stderr transcripts, pairing URLs, and QR payloads. Web must not observe or store Paseo runtime state after handoff.

Provisioning scripts must discover and validate the remote execution identity before touching Paseo:

```text
whoami / id -u / pwd -P / PATH
canonical HOME = cd "$HOME" && pwd -P
PASEO_HOME = "$HOME/.paseo"
workspace = "$HOME/aiworker-workspaces/<safe-name>"
```

Before any `paseo daemon` or `paseo provider` command, scripts unset inherited `PASEO_HOST` so readiness checks cannot be redirected to another daemon. Provider readiness is checked under the same identity with the `paseo-provider-json-v1` contract: `paseo provider ls --json` is a warning-only diagnostic. If the selected provider is missing, disabled, or unreadable, AIWorker continues workspace projection and records remediation guidance. AIWorker does not call `paseo provider models` as a provisioning gate and must not store raw provider JSON, model lists, provider stderr, transcripts, pairing URLs, or QR codes.

The default provisioning script does not execute `paseo daemon pair`, because that command prints real pairing material. Handoff is instruction-only: after provisioning, the operator/employee may run `aiworker pair --target <aissh-ref> --soul <dist/soul.descriptor.json>` or run `paseo daemon pair --home "$PASEO_HOME"` from the prepared workspace and open the printed link in Paseo. `aiworker pair` is intentionally transient: successful pairing output may show the raw Paseo pairing response to the current caller, but AIWorker does not persist it to the control-plane snapshot, receipts, audit events, logs, or projection manifests. AIWorker Web may expose this as a one-click post-approval action only by calling the same CLI path and rendering the immediate response in the current page; it must not copy the pairing URL or QR into Web storage, approval records, receipts, or audit records.

Adopted from the `aiworker-next` aissh integration audit:

- `aissh-cli` is declared as an optional CLI dependency of `@zonease/aiworker-cli`; runtime resolution is `--aissh-bin` / `AISSH_BIN` first, then bundled `node_modules/aissh-cli/bin/aissh.js` through the current Node/Bun process, then `PATH` fallback.
- aissh credentials are env-only: `AISSH_TOKEN` is required for real execution and `AISSH_SERVER` is optional when the aissh control plane needs it. AIWorker must not read, copy, or emit `.aissh.yaml` secrets.
- aissh is executed from a neutral temporary directory so a local `./.aissh.yaml` cannot silently override env credentials.
- remote file projection uses shell quoting and base64 file writes; receipts and command output are redacted.

Not adopted: OpenClaw/Paseo gateway lifecycle management, port allocation, health loops, plugin install orchestration, self-healing, or reconciliation. Those are runtime responsibilities of Paseo/community tooling, not AIWorker.
