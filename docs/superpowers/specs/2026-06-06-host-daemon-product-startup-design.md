# Host Daemon Product Startup Design

## Product Judgment

Host is a product install target, not only a source-checkout dev server. If an
administrator installs AIWorker Host through npm or bun, the expected first run
must be one command:

```bash
aiworker-host start
```

That command should background a Host daemon, print the Host URL, and make
`status`, `logs`, `stop`, `restart`, and `clean` work without asking the admin to
understand process supervisors first.

## User Scenario

The target user is an administrator setting up the organization-side control
plane for Soul distribution. They may later use aissh, systemd, Docker, or Caddy,
but the MVP first-run path must not require that knowledge. The successful
experience is: install package, run one command, open Host, assign a Soul to an
employee.

## Startup Contract

Host and Worker align on the public service lifecycle contract:

- `start`: product entry, starts the service in background and prints URLs.
- `daemon start`: scriptable background daemon start.
- `daemon foreground`: same service in the current process, for systemd, Docker,
  PM2, aissh foreground execution, and debugging.
- `status`: reports pid, running state, API URL, Web URL, and services.
- `logs`: reads daemon logs with token redaction.
- `stop`: stops the daemon and removes pid/metadata.
- `restart`: stops and starts through the same readiness path.
- `clean`: stops and removes lifecycle state.

Host and Worker do not align on runtime ownership. Worker daemon owns Worker
runtime, Workbench, projection, engine bridge, and native engine processes. Host
daemon owns only Host API, Host Web, assignment/control metadata, check-in,
access adapter state, auth/session boundary, and logs. Host still must not own
session, invocation, projection, engine process, domain state, or secrets.

## Command Shape

```text
aiworker-host start [--dev] [--host] [--port] [--web-port] [--web-static-dir]
aiworker-host daemon start [same options]
aiworker-host daemon foreground [same options]
aiworker-host daemon restart [same options]
aiworker-host daemon status
aiworker-host daemon stop
aiworker-host daemon logs [--service api|web|host-daemon]
aiworker-host daemon clean

aiworker-host status|stop|restart|logs|clean
  aliases to the daemon lifecycle commands

aiworker-host serve
  low-level foreground API/static server used by the daemon implementation and
  kept as a compatibility/debugging surface
```

## Dev And Production Modes

Production/default mode starts a Host daemon that serves Host API and static Host
Web from one foreground service process. If `--web-static-dir` is omitted, the
CLI tries the packaged Host Web assets first and then the source checkout
`apps/host-web/dist` path. If no built Web is available, it fails with an
actionable message.

Development mode keeps Vite as a development child, but it still enters through
the Host daemon lifecycle commands:

```bash
bun run dev:host
# wraps:
aiworker-host start --dev
```

The development daemon records API pid/logs and Web tmux state in the same Host
manifest so `status`, `logs`, `stop`, and `clean` stay product-shaped.

## Non-Goals

- Do not make Host daemon launch or observe Worker engines.
- Do not move Worker sessions, invocations, projection, or workspace state into
  Host.
- Do not make `serve` the recommended product entry.
- Do not require systemd/Docker for the npm/bun first-run path.
- Do not make Host Web a mounted Worker UI.

## Acceptance Criteria

- A package-installed administrator can run `aiworker-host start` and get a
  background Host daemon plus a URL.
- `aiworker-host daemon foreground` runs the same Host service in the foreground.
- `aiworker-host status/logs/stop/restart/clean` manage that same daemon state.
- Source development still works through `bun run dev:host`, but the public
  entry is Host CLI lifecycle, not ad hoc shell commands.
- Contract tests distinguish lifecycle-experience parity from runtime-ownership
  parity.
