# AIWorker

**English** · [简体中文](./README.zh-CN.md)

Self-hosted, lightweight **Project Brain + Worker/Fleet aggregation runtime**.

- **Worker** owns the Project Brain (filesystem is the source of truth), worker.db, and conversations. External executors (Codex / Claude Code / Hermes / OpenClaw / Cursor, etc.) are invoked through a thin adapter only.
- **Gateway is an optional control plane**: a single worker runs without one. With multiple workers, the gateway aggregates presence, routing, and audit — it never holds brain or conversation data.

## Why AIWorker exists

AIWorker is not trying to be a smarter coding assistant or a new executor
platform. If all you need is a better one-off chat or coding agent, use Codex,
Claude Code, Cursor, Hermes, OpenClaw, or another executor directly.

Use AIWorker when you already trust external executors, but need to run them as
durable, governed workers bound to a real business scope:

- **Project Brain as an owned asset**: each worker has a filesystem-first,
  reviewable, portable brain for scope identity, persona, policy, memories,
  rollups, and brain skills.
- **Governed self-iteration**: an executor can propose durable brain changes,
  but memory and brain-skill writes must pass admission, approval,
  secret-scan, provenance, and audit.
- **Bring your own executor**: AIWorker does not replace the executor's tool
  loop, MCP, plugins, sandbox, native sessions, auth, or model routing. It
  wraps them with scope context, persistence, observation, and governance.
- **Worker/Fleet operations**: one worker can run alone; many workers can be
  aggregated by a gateway for presence, routing, logs, approvals, cron, and
  audit without copying brain, conversations, or secrets into fleet.db.

In short: AIWorker turns existing AI agents into self-hosted, scope-bound,
auditable business workers. The competitive edge is not "better model output";
it is durable Project Brain plus governance and fleet operations around the
executors customers already use.

## Who needs AIWorker

AIWorker is a good fit when you want AI agents to behave less like disposable
chat windows and more like managed workers tied to real work.

- **Teams that already use AI executors** and want durable scope memory,
  policy, persona, and reviewable brain files around them.
- **Operators running agents for business scopes**, such as a code repository,
  hiring pipeline, finance period, support queue, compliance folder, or
  operational runbook.
- **Organizations that need governance before self-learning**, where memory or
  brain-skill changes can be proposed by an agent but must be reviewed,
  approved, and audited.
- **People running more than one worker**, where presence, routing, logs,
  approvals, schedules, and enrollment need one control plane without moving
  private brain or conversation data into that control plane.
- **Customers who need to keep their own data local**, while still using the
  executor, model, auth, and tool ecosystem they already trust.

If you only need a one-off coding session, a single chat, or a better model
answer, AIWorker is probably more infrastructure than you need.

## Topology

```text
Operator / Admin
  runs `aiworker fleet ...`
        |
        | WebSocket control traffic
        | basicauth + device token
        v
+--------------------------------------------------------------------------------+
| AIWorker Gateway (optional control plane)                                      |
|                                                                                |
| fleet.db stores: worker pointers, presence, enrollment state, audit events     |
| fleet.db does not store: Project Brain, conversations, worker secrets          |
+---------------------------+----------------------------+-----------------------+
                            |                            |
                            | WS relay / routing         | WS relay / routing
                            v                            v
                 +----------------------+      +----------------------+
                 | Worker A             |      | Worker B ... N       |
                 | owns its own data    |      | owns its own data    |
                 +----------------------+      +----------------------+

A single worker can also run without the gateway:

+--------------------------------------------------------------------------------+
| One worker data plane                                                          |
|                                                                                |
|  Project Brain (filesystem)        worker.db                                   |
|  - SOUL / USER / MEMORY            - identity and config                       |
|  - memories and governance         - conversations and messages                |
|  - managed native skill            - encrypted local state                     |
|    projection manifest                                                         |
|  - native skill files in                                                       |
|    .agents / .claude                                                           |
|  - policy and capabilities                                                     |
|  - admission proposals                                                         |
|                                                                                |
|  AIWorker thin adapter                                                         |
|  - adds scope context and governance                                           |
|  - observes run / stream / cancel / resume                                     |
|  - does not replace the executor tool loop                                     |
|                                                                                |
|  External executor                                                             |
|  - Codex / Claude Code / Hermes / OpenClaw / Cursor / ACP / MCP / HTTP         |
|  - keeps its own MCP, skills, plugins, auth, sandbox, and native sessions      |
+--------------------------------------------------------------------------------+
```

A single worker can run standalone — the gateway is needed only when you want to aggregate multiple workers. The control plane and the data plane are physically isolated: fleet.db never stores brain / conversations / secrets, and worker.db is never reverse-fetched by the gateway. Full architecture and dual-view diagrams: [`docs/architecture.md`](docs/architecture.md). Production-readiness notes and remaining boundaries: [`docs/governance-node-status.md`](docs/governance-node-status.md).

---

## Install

```sh
bun install -g @zonease/aiworker-cli
# or `bunx @zonease/aiworker-cli --help` (when Bun is already installed)
# or `npx` / `npm install -g` (Bun is still required at runtime)
```

The CLI is Bun-native. The first worker initialization mints a master key and writes it to the worker-local `.env` (project workers use `<project>/.aiworker/local/.env`; explicit/user homes use `<AIWORKER_HOME>/.env`). **The master key must be backed up offline at the org level** — if it is lost, worker.db / fleet.db cannot be decrypted and every worker must re-enroll.

Full install and per-platform binaries: [`docs/deployment.md`](docs/deployment.md).

---

## CLI discovery

`aiworker --help` is intentionally short and shows the first-run path. Use
`aiworker commands` for the complete command index, or scoped help for a role:

```sh
aiworker --help
aiworker commands
aiworker worker --help
aiworker fleet --help
aiworker gateway --help
```

---

## Start a worker (single host, no gateway)

The most common path: turn the current business directory into a worker scope, start a local server + admin UI, and chat through the CLI. **No fleet credentials required.**

```sh
cd ~/code/my-project
aiworker up --soul developer            # one shot: init + doctor + executor readiness + serve
```

`aiworker up` lays down the Project Brain layout under `<cwd>/.aiworker/` (worker.db, master key, persona, policy, memories, native skill projection manifest) and projects managed `aiworker-*` executor-native skills under `.agents/skills` and `.claude/skills`. It then runs preflight checks, reports executor readiness, and starts the worker HTTP/admin server (default `:9217`). It does not choose an executor for you; use `aiworker executor select --engine <id> --apply` for that. Pick a Soul from `developer` / `hr-recruiting` / `finance-ops` / `qa-reviewer` / `general-assistant` — Souls shape persona / risk preferences / default brief sections; governance kernel behavior is the same across all Souls.

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

New worker-local `.env` files reserve commented gateway enrollment examples.
`aiworker doctor` also reports gateway enrollment as standalone/configured and
prints the exact `aiworker env ...` commands when enrollment is optional but not
yet configured.

Full CLI reference: [`docs/cli.md`](docs/cli.md).

---

## Developer repo proof loop

For a repo-scoped developer worker, AIWorker adds a reviewable proof loop around
the executor:

1. The external executor still performs the work.
2. Brain Journal records task intent, selected context, executor events, tool
   signals, authority preflight, Gate verdict, and outcome.
3. Brain Gate separates hard invariants from Brain Engine review and heuristic
   quality signals.
4. Failed or incomplete work can be held or rerun with parent/child lineage.
5. Useful lessons become Brain Inbox candidates first; canonical memory writes
   still go through admission approval and apply.

Useful local commands:

```sh
aiworker run --message "review this change"
aiworker brain journal show <taskId>
aiworker brain inbox propose <taskId>
```

When running the worker HTTP API, operator-triggered reruns are available at:

```sh
curl -X POST \
  -H "Authorization: Bearer $(cat .aiworker/local/bootstrap-token.txt)" \
  http://127.0.0.1:9217/api/worker/orchestrator/tasks/<taskId>/rerun
```

Authority preflight is a truthfulness surface, not a sandbox claim. High-risk
ambient executor work is marked as observe-only unless the capability is
explicitly brokered by AIWorker.

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
aiworker env gateway-url wss://your-gateway.example/
aiworker env display-name my-laptop
aiworker serve
# stdout prints an OTP, e.g.  YDCR-ZD8M
```

`aiworker init` also leaves commented `AIWORKER_GATEWAY_URL` /
`AIWORKER_DISPLAY_NAME` examples in the worker-local `.env`; keep them
commented unless you intentionally configure gateway enrollment.

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
| `AIWORKER_GATEWAY_URL` | Optional worker-side gateway URL (path + basicauth); set with `aiworker env gateway-url <url>` |
| `AIWORKER_DISPLAY_NAME` | Optional worker label in the fleet list (defaults to hostname / worker id); set with `aiworker env display-name <name>` |
| `AIWORKER_HOME` | Explicit worker state root; project scope auto-resolves to `<project>/.aiworker/local` |
| `AIWORKER_ADMIN_EXTERNAL_AUTH` | Set to `1` if `/admin/*` is fronted by Caddy / Cloudflare Access / Logto / etc. |

Full list: `apps/api/.env.example` + `ops/compose/.env.example`, or [`docs/architecture.md` § Environment](docs/architecture.md).

---

## More

- [`docs/architecture.md`](docs/architecture.md) — system layout, data flow, security model, Brain governance boundary, full env table
- [`docs/governance-node-status.md`](docs/governance-node-status.md) — production-readiness checklist and remaining boundaries
- [`docs/gateway.md`](docs/gateway.md) — WS protocol (METHODS / EVENTS) and the four enrollment paths
- [`docs/deployment.md`](docs/deployment.md) — three deployment shapes runbook + troubleshooting + backup checklist
- [`docs/deployment-public-https.md`](docs/deployment-public-https.md) — public-internet Cloudflare + Caddy overlay (including the BUG-007 fail-closed fix)
- [`docs/executor-engines.md`](docs/executor-engines.md) — per-engine auth/install
- [`docs/cli.md`](docs/cli.md) — full CLI reference
- [`docs/changelog.md`](docs/changelog.md) — release history and end-to-end test notes

---

## Development

```sh
git clone https://github.com/ZonEaseTech/aiworker
cd aiworker && bun install
bun run typecheck && bun run lint && bun run test
```

For local development, run focused package checks while iterating and the full
gate before publishing or merging. Planning notes, implementation history, and
release records live in [`docs/plan/`](docs/plan/), [`docs/task/`](docs/task/),
and [`docs/changelog.md`](docs/changelog.md).

---

## Status

> Before going to production, read the readiness table and remaining-boundary
> section in [`docs/governance-node-status.md`](docs/governance-node-status.md).
> Before 1.0.0, CLI / API / config shapes may still change.

CLI npm latest: **0.10.4**.

| Module | Status |
|---|---|
| Worker and Fleet operations: control plane, enrollment, executor adapters, webhooks, schedules, per-tool approvals, hot reload | ✅ Production |
| Project Brain governance: reviewed memory changes, secret scanning, provenance events, canonical memory boundary, bypass checks | ✅ GA |
| Governance regression coverage: 800+ checks across source and packaged CLI, plus long-running worker REST regression | ✅ GA |
| Memory-write automation | ✅ MVP (`memory-add` is available; other proposal types are rejected until implemented) |
| Optional LLM-backed Brain reviewer | 🔜 opt-in; default is observe-only heuristic review |
| Cross-scope runtime isolation | 🔜 currently convention / filesystem only |
| Web SPA pending UI / Multi-host HA | 🔜 Stage-2 |

---

## License

[MIT](LICENSE) © 2026 ZonEase Tech
