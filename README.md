# AIWorker

**English** · [简体中文](./README.zh-CN.md)

Self-hosted, lightweight **Project Brain + Worker/Fleet aggregation runtime**.

- **Worker** owns the Project Brain (filesystem is the source of truth), worker.db, and conversations. External executors (Codex / Claude Code / Hermes / OpenClaw / Cursor, etc.) are invoked through a thin adapter only.
- **Gateway is an optional control plane**: a single worker runs without one. With multiple workers, the gateway aggregates presence, routing, and audit — it never holds brain or conversation data.

```text
                Operator / Admin
                      |  aiworker fleet ...
                      |  WS  basicauth + token
                      v
   +------------------------------------------------+
   |  AIWorker Gateway   (optional control plane)   |
   |  fleet.db : pointers + audit only              |
   |  no brain  no chat data  no secrets            |
   +------+-------------+-------------+-------------+
          v             v             v   WS relay
      Worker A      Worker B  ...  Worker N
          |
          |   a single worker also runs without a gateway
          v
   +------------------------------------------------+
   |  Per-worker data plane                         |
   |                                                |
   |  worker.db       identity / config / chat      |
   |                  AES-256-GCM                   |
   |                                                |
   |  Project Brain   filesystem authoritative      |
   |                  AGENT / SOUL / USER           |
   |                  memories / brain skills       |
   |                  policy / admission state      |
   |                                                |
   |  Thin Adapter    health / run / stream         |
   |                  cancel / resume               |
   |       |                                        |
   |       v   invoke                               |
   |  External Engine                               |
   |       Codex / Claude Code / Hermes             |
   |       OpenClaw / Cursor / ACP / MCP / HTTP     |
   |       |                                        |
   |       v   loads ambient                        |
   |  user/host MCP / skills / plugins              |
   |  auth / native sessions                        |
   |  (not owned by AIWorker)                       |
   +------------------------------------------------+
```

A single worker can run standalone — the gateway is needed only when you want to aggregate multiple workers. The control plane and the data plane are physically isolated: fleet.db never stores brain / conversations / secrets, and worker.db is never reverse-fetched by the gateway. Full architecture and dual-view mermaid diagrams: [`docs/architecture.md`](docs/architecture.md). Whether this build meets the Project Brain governance node target: [`docs/governance-node-status.md`](docs/governance-node-status.md).

---

## Install

```sh
bun install -g @zonease/aiworker-cli
# or `bunx @zonease/aiworker-cli --help` (when Bun is already installed)
# or `npx` / `npm install -g` (Bun is still required at runtime)
```

The CLI is Bun-native. The first run mints a master key and writes it to `~/.aiworker/.env` (chmod 0600). **The master key must be backed up offline at the org level** — if it is lost, worker.db / fleet.db cannot be decrypted and every worker must re-enroll.

Full install and per-platform binaries: [`docs/deployment.md`](docs/deployment.md).

---

## Start a worker (single host, no gateway)

The most common path: turn the current business directory into a worker scope, start a local server + admin UI, and chat through the CLI. **No fleet credentials required.**

```sh
cd ~/code/my-project
aiworker up --soul developer            # one shot: init + executor select + doctor + serve
```

`aiworker up` lays down the Project Brain layout under `<cwd>/.aiworker/` (worker.db, master key, persona, brain skills), runs the preflight checks, and starts the worker HTTP/admin server (default `:9217`). Pick a Soul from `developer` / `hr-recruiting` / `finance-ops` / `qa-reviewer` / `general-assistant` — Souls shape persona / risk preferences / default brief sections; governance kernel behavior is the same across all Souls.

Step-by-step alternative:

```sh
aiworker init --soul developer                            # only lay out files
aiworker executor select --engine claude-code --apply     # pick executor (see "Configure the LLM" below)
aiworker executor doctor --engine claude-code             # check engine CLI + project overlay
aiworker doctor                                            # overall diagnostics (PASS / WARN / INFO)
aiworker brain status                                      # inspect brain assets
aiworker serve --port 9217 --host 127.0.0.1               # start the server
aiworker run --message 'hello' --chat-id demo             # one-shot CLI turn (no server)
```

After it is running:

- Admin UI: `http://127.0.0.1:9217/admin/` (loopback by default; public hosts must front it with external auth — see below)
- Bearer token: `<scope>/.aiworker/local/bootstrap-token.txt`. REST calls must include `Authorization: Bearer <token>`.
- Brain and conversations stay local. The only outbound traffic is whatever the external executor itself talks to (its own LLM provider).

Full CLI reference: [`docs/cli.md`](docs/cli.md).

---

## Start a fleet (multiple workers + gateway)

The gateway aggregates multiple workers into a fleet: one operator CLI controls all of them, while each worker keeps owning its own brain, conversations, and secrets.

### 1) Start the gateway

```sh
# Dev / single host: foreground
aiworker gateway start --host 127.0.0.1 --port 9218

# Server long-run: systemd
aiworker gateway install systemd --user
systemctl --user start aiworker-gateway
```

When binding to a non-loopback host you must set:

```sh
export INTERNAL_SHARED_SECRET='<≥16 chars>'   # bearer for remote operators
# Front /ws and /admin/* with Caddy / Cloudflare Access / Logto / etc. (fail-closed)
```

Public deployment + Caddy basicauth template: [`docs/deployment-public-https.md`](docs/deployment-public-https.md).

### 2) Enroll a worker (OTP recommended)

The most common path — the worker side carries no fleet credentials, the operator approves an 8-character OTP:

```sh
# Worker side:
aiworker init --soul developer
printf '%s\n' \
  "AIWORKER_GATEWAY_URL=wss://your-gateway.example/" \
  "AIWORKER_DISPLAY_NAME=my-laptop" \
  >> .aiworker/local/.env
aiworker serve
# stdout prints an OTP, e.g.  YDCR-ZD8M
```

```sh
# Operator side:
aiworker fleet enroll list                  # see pending OTPs
aiworker fleet enroll approve YDCR-ZD8M     # approve
aiworker fleet list                         # the worker is now visible
```

The other three enrollment paths (self-enroll for unattended batch setups / manual pair for high-security single-worker / docker auto-launch): [`docs/gateway.md`](docs/gateway.md).

### 3) Operator gateway config

The operator side needs `~/.aiworker/aiworker.json` on first use:

```sh
mkdir -p ~/.aiworker && chmod 700 ~/.aiworker
cat > ~/.aiworker/aiworker.json <<EOF
{
  "gatewayUrl": "wss://operator:<basicauth-pwd>@your-gateway.example/ws",
  "deviceId": "op-$(uuidgen)",
  "deviceToken": "<INTERNAL_SHARED_SECRET>"
}
EOF
chmod 600 ~/.aiworker/aiworker.json
```

> Same-host loopback skips basicauth and the token: just use `ws://127.0.0.1:9218/ws`.

### 4) Common operator commands

```sh
# State
aiworker fleet list
aiworker fleet remove <workerId>

# Chat (streaming NDJSON)
aiworker fleet chat <workerId> 'hello'
aiworker fleet chat <workerId> 'continue' --conversation-id <prev-id>

# Worker config (optimistic-locked)
aiworker fleet config get <workerId>                          # returns version + config
aiworker fleet config set <workerId> "$NEW_CFG" --if-match <version>

# Token rotation / logs / cron / per-tool approvals
aiworker fleet token rotate <workerId>
aiworker fleet logs <workerId> --follow --tail 200
aiworker fleet schedule list <workerId>
aiworker fleet schedule add <workerId> --expression '0 9 * * *' --prompt 'morning brief' --channel web --chat-id daily
aiworker fleet approvals list
aiworker fleet approvals grant <workerId> <taskId> <toolCallId>          # allow
aiworker fleet approvals grant <workerId> <taskId> <toolCallId> --deny
```

---

## Configure the LLM executor

A new worker defaults to `executor: { engine: 'http', variant: 'default' }` and must be switched to a real LLM before it can do anything.

```sh
# Local:
aiworker executor select --engine claude-code --variant default --timeout-ms 240000 --apply
aiworker executor doctor --engine claude-code

# Remote, for a worker in the fleet:
aiworker fleet config get <workerId>          # grab version + current config
aiworker fleet config set <workerId> "$NEW" --if-match <version>
```

Supported engines: `http` (OpenAI / DeepSeek / SiliconFlow / any chat-completions-compatible API), `claude-code`, `codex`, `acp` (gemini / qwen), `cursor`, `mcp`.

Per-engine install / auth recipes (including `claude login`, `codex auth`, secret vault writes, ACP CLI installs): [`docs/executor-engines.md`](docs/executor-engines.md).

`--timeout-ms` on `executor select` sets the executor adapter's per-turn hard
timeout. `aiworker run --timeout-ms` only controls how long the CLI waits for
the worker turn to finish.

---

## Deployment shapes

| Shape | When | Entry |
|---|---|---|
| Bare-process | dev / CI | `aiworker gateway start` / `aiworker serve` in the foreground |
| systemd (Linux preferred) | server long-run | `aiworker {gateway,worker} install systemd [--user\|--system]` |
| docker compose | no Bun on host / per-worker isolation | `ops/compose/docker-compose.yml` (GHCR images) |

See [`docs/deployment.md`](docs/deployment.md).

---

## Key environment variables

| Variable | Purpose |
|---|---|
| `AIWORKER_MASTER_KEY` | 64 hex; AES master key for worker / gateway databases; **must be backed up offline** |
| `INTERNAL_SHARED_SECRET` | Remote-operator bearer when the gateway is exposed publicly or off loopback (≥16 chars) |
| `AIWORKER_GATEWAY_URL` | Worker-side gateway URL (path + basicauth); for project workers prefer `.aiworker/local/.env` |
| `AIWORKER_DISPLAY_NAME` | Worker label in the fleet list (defaults to hostname); persisted per worker in `.aiworker/local/.env` |
| `AIWORKER_HOME` | Explicit worker state root; project scope auto-resolves to `<project>/.aiworker/local` |
| `AIWORKER_ADMIN_EXTERNAL_AUTH` | Set to `1` if `/admin/*` is fronted by Caddy / Cloudflare Access / Logto / etc. |

Full list: `apps/api/.env.example` + `ops/compose/.env.example`, or [`docs/architecture.md` § Environment](docs/architecture.md).

---

## More

- [`docs/architecture.md`](docs/architecture.md) — monorepo layout, data flow, security model, Brain Governance Kernel decision, full env table
- [`docs/governance-node-status.md`](docs/governance-node-status.md) — source-backed assessment of whether this build meets the Project Brain governance node target
- [`docs/gateway.md`](docs/gateway.md) — WS protocol (METHODS / EVENTS) and the four enrollment paths
- [`docs/deployment.md`](docs/deployment.md) — three deployment shapes runbook + troubleshooting + backup checklist
- [`docs/deployment-public-https.md`](docs/deployment-public-https.md) — public-internet Cloudflare + Caddy overlay (including the BUG-007 fail-closed fix)
- [`docs/executor-engines.md`](docs/executor-engines.md) — per-engine auth/install
- [`docs/cli.md`](docs/cli.md) — full CLI reference
- [`scripts/governance-kernel-harness.ts`](scripts/governance-kernel-harness.ts) — Brain Governance Kernel regression harness (compact / full × source-local / cli-release-local)
- [`docs/changelog.md`](docs/changelog.md) — release history and end-to-end test notes

---

## Development

```sh
git clone https://github.com/ZonEaseTech/aiworker
cd aiworker && bun install
bun run typecheck && bun run lint && bun run test
```

New features go through the `/pma` skill in three stages: investigate → proposal → implement. Backend uses `/pma-bun`, frontend uses `/pma-web`, code review uses `/pma-cr`. Docs: [`docs/plan/`](docs/plan/) / [`docs/task/`](docs/task/) / [`docs/changelog.md`](docs/changelog.md).

---

## Status

> Before going to production, read the conformance table and residual-boundary section in [`docs/governance-node-status.md`](docs/governance-node-status.md). Pre-1.0 the CLI / API / config does not guarantee backwards compatibility (an explicit AGENTS.md commitment).

CLI npm latest: **0.10.1**.

| Module | Status |
|---|---|
| Worker / Fleet control plane / 4 enrollment paths / 6 LLM engines / 5 channel webhooks / cron / per-tool approvals / hot reload | ✅ Production |
| Brain Governance Kernel (admission state machine + secret-scan defense + canonical memory boundary + truthful decision events + bypass detection) | ✅ GA |
| Governance Kernel regression harness (5×2 matrix on source + cli-release-local with 800+ checks) + long-running serve multi-turn REST regression | ✅ GA |
| Brain admission `memory-add` materializer | ✅ MVP (other kinds return `unsupported`; post-apply rollback not yet implemented) |
| Heavy LLM-backed Brain decider | 🔜 opt-in; defaults to `evaluator=heuristic` `mode=observe_only` |
| Cross-scope hard isolation (runtime-enforced) | 🔜 currently filesystem-conventional, not runtime-isolated |
| Web SPA pending UI / Multi-host HA | 🔜 Stage-2 |

---

## License

[MIT](LICENSE) © 2026 ZonEase Tech
