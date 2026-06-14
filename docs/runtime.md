# AIWorker Runtime

AIWorker no longer has an employee-side runtime. Paseo is the runtime.

## Runtime responsibility split

AIWorker CLI/control responsibilities:

- run AIWorker CLI/API actions;
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
