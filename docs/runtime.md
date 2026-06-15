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

AIWorker does not run a Worker daemon. It may start or verify a Paseo daemon on a target machine with a chosen `PASEO_HOME` and daemon endpoint.

Default production isolation:

```text
one employee -> one OS user/rootless container/VM -> one PASEO_HOME -> one Paseo daemon -> many Soul workspaces
```

Multiple daemon instances on one device are allowed only with separate homes and endpoints.

## Workspace model

AIWorker creates normal directories that Paseo can use as workspaces. Soul projection is file copying, not an AIWorker runtime service.

A workspace can contain multiple Paseo sessions. AIWorker does not persist or inspect those sessions.

## aissh MVP integration

AIWorker invokes `aissh` only as a thin provisioning transport. It does not own the remote runtime after the workspace files are projected.

AIWorker Web may present the same provisioning inputs, plan previews, redacted receipts, and handoff metadata as the CLI. It must not observe or store Paseo runtime state after handoff.

Adopted from the `aiworker-next` aissh integration audit:

- `aissh-cli` is declared as an optional CLI dependency of `@zonease/aiworker-cli`; runtime resolution is `--aissh-bin` / `AISSH_BIN` first, then bundled `node_modules/aissh-cli/bin/aissh.js` through the current Node/Bun process, then `PATH` fallback.
- aissh credentials are env-only: `AISSH_TOKEN` is required for real execution and `AISSH_SERVER` is optional when the aissh control plane needs it. AIWorker must not read, copy, or emit `.aissh.yaml` secrets.
- aissh is executed from a neutral temporary directory so a local `./.aissh.yaml` cannot silently override env credentials.
- remote file projection uses shell quoting and base64 file writes; receipts and command output are redacted.

Not adopted: OpenClaw/Paseo gateway lifecycle management, port allocation, health loops, plugin install orchestration, self-healing, or reconciliation. Those are runtime responsibilities of Paseo/community tooling, not AIWorker.
