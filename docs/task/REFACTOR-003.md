# REFACTOR-003 CLI-first lightweight runtime (aiw / aim / gateway)

- **status**: in_progress
- **priority**: P1
- **owner**: coordinator
- **createdAt**: 2026-04-24 11:40
- **startedAt**: 2026-04-24 11:40

## Description

Reshape AIWorker from an HTTP-server-first fleet runtime into a **CLI-first lightweight runtime**, inspired by Hermes (CLI + gateway share one conversation loop) and OpenClaw (long-lived local gateway over WebSocket, device-paired clients).

Concrete end state:

- `aiw` — worker-side CLI. Single binary (Bun compile). Can run an interactive REPL without starting any HTTP server, can also `aiw serve` to expose the current worker HTTP surface.
- `aim` — manager-side CLI. Single binary. Talks to one or many `aiw` instances via the gateway; covers everything today's dashboard REST surface exposes (register / launch-local / proxy / audit).
- `gateway` — long-running process (daemon) that fronts CLI + Web UI + worker nodes. Borrows the OpenClaw operator/node split: CLIs connect as operators, worker runtimes connect as nodes. Default bind `127.0.0.1`; remote access via SSH tunnel / Tailscale. Web UI consumes the same protocol, no longer a first-class surface.
- Core runtime (orchestrator + brain + executor + channels + evolution) extracted into a transport-agnostic `packages/core`. HTTP / CLI / gateway are three thin adapters over the same core.

Acceptance criteria (to be finalised during Proposal approval):

- `aiw run` starts a REPL that completes a round-trip conversation against any configured executor with zero HTTP endpoints bound.
- `aiw serve` remains bit-for-bit compatible with the current `AIWORKER_MODE=worker` HTTP surface (routes, payloads, SSE, OpenAPI spec).
- `aim workers …` reproduces the full dashboard REST surface via the gateway protocol; the legacy `AIWORKER_MODE=dashboard` HTTP server can be deprecated behind a flag (not removed in the first pass).
- Architecture Constraints from `CLAUDE.md` remain intact: `fleet.db` / `worker.db` isolation, master-key-guarded vault, bearer-token auth with `timingSafeEqual`, hot-reload runtime, provider-contract extensibility, hop-by-hop header handling.
- Web UI (`apps/web`) consumes the gateway protocol; existing pages (workers list / detail / orchestrator / skills / config) keep working.
- Binaries are produced by CI (`bun build --compile`); distribution channel (GHCR image + raw binary artefact) designed in plan.

## ActiveForm

Refactoring AIWorker into CLI-first lightweight runtime with a gateway remote-control plane

## Dependencies

- **blocked by**: (none)
- **blocks**: future feature work that assumes the current dashboard-REST contract (must land after PLAN-011 phase 1 is merged, or be written against the new core)

## Notes

Related plan: PLAN-011 (investigation + phased migration). No BKD project yet — will be created after proposal approval when scope is final.

References surfaced during investigation:

- Hermes shares `AIAgent.run_conversation()` between `cli.py` and `gateway/run.py`; `~/.hermes/` is the filesystem source of truth for skills + memories.
- OpenClaw runs a single long-lived WebSocket gateway on `127.0.0.1:18789` with TypeBox-validated JSON frames, operator (CLI / mac app / web admin) vs node (mobile / headless) roles, device-pairing challenge-response, loopback auto-approval, remote access via SSH tunnel or Tailscale.
- OpenClaw RFC 42026 proposes splitting the monolithic gateway into `control-plane` + per-agent `runtime` processes with three deploy shapes (`embedded` / `local-split` / `distributed`) — aligns directly with the split we already have (dashboard vs worker), but over a leaner transport.
