# FEAT-009 Deployment automation (aissh-driven fleet deploy)

- **status**: completed
- **priority**: P1
- **owner**: claude-opus-4-7
- **createdAt**: 2026-04-21 07:30
- **claimedAt**: 2026-04-21 18:00
- **completedAt**: 2026-04-21 18:30
- **plan**: PLAN-005

## Description

Automate the deploy of the fleet runtime to `gateway.example.test` (aiwork server, id `<aissh-server-id-redacted>`, host `<test-server-ip-redacted>`) through the `aissh` CLI. Deferred from REFACTOR-002 / PLAN-003 per user instruction so the architecture work lands first.

Scope:

- `scripts/deploy.ts` — Bun script wrapping aissh:
  1. `aissh exec <server> "curl -fsSL https://get.docker.com | sh"` — install docker if missing (approval-gated)
  2. `aissh exec <server> "systemctl stop aiworker && systemctl disable aiworker"` + remove `/opt/aiworker` + `/etc/systemd/system/aiworker.service` — tear down legacy single-process runtime (approval-gated, irreversible)
  3. `bun run build` + docker image build locally (or pull from registry)
  4. `aissh file upload` image tarball + `docker-compose.yml` + Caddyfile
  5. `aissh exec <server> "docker load -i ... && docker compose up -d aiworker-dashboard"` — start dashboard
  6. `aissh exec <server> "curl -s localhost:3000/api/system/health"` — verify
  7. Update `/etc/caddy/Caddyfile` on host with the new fleet routing + reload Caddy
- Caddyfile template baked into repo (`ops/caddy/Caddyfile.tmpl`)
- docker-compose file baked into repo (`ops/compose/docker-compose.yml`)
- Rollback path: keep previous image tag; `docker compose` can swap back
- Documentation: `docs/deployment.md`

## ActiveForm

Planning aissh-driven fleet deployment (deferred)

## Dependencies

- **blocked by**: REFACTOR-002
- **blocks**: (none)

## Notes

User instruction on 2026-04-21: focus on the refactor first; deployment is not part of the REFACTOR-002 critical path. This task tracks the work so it is not lost.

Destructive steps (teardown of `/opt/aiworker`) are gated by `aissh approval` — the operator confirms before the script proceeds. Do not tear down the legacy runtime before the new dashboard image is verified to boot successfully in a staging run.

## Deploy records

| Date (UTC) | Image tag | Commit | Operator | Notes |
| --- | --- | --- | --- | --- |
| 2026-04-22 06:50 | `4587549-202604220650` | `4587549` | claude-opus-4-7 | First GHCR push (private). Dashboard container up, `/health` ok. Legacy aiworker.service still running on 3001. |
| 2026-04-22 07:05 | `1bb4b30-202604220705` | `1bb4b30` | claude-opus-4-7 | Added `hono/bun` serveStatic for `/app/web` + SPA fallback; simplified Caddyfile to `:80 → 3000`. Current live build. |
| 2026-04-22 07:10 | — | — | claude-opus-4-7 | Reload-caddy ran into `/var/log/caddy/aiw.access.log` owned by root (legacy artefact). Fixed with `chown caddy:caddy` + `systemctl restart caddy`. |
| 2026-04-22 07:11 | — | — | claude-opus-4-7 | Teardown legacy: `aiworker.service` stopped/disabled/removed, `/opt/aiworker` directory emptied via `find -mindepth 1 -delete && rmdir`. Host `/opt` now contains only `aiworker-deploy/` and `containerd/`. |
| 2026-04-22 07:12 | — | — | claude-opus-4-7 | End-to-end verified: `https://gateway.example.test/` → 200 HTML via Cloudflare; `/health`, `/api/workers`, `/docs`, `/openapi.json` all 200. |
| 2026-04-22 08:20 | `007d4be-202604220818` | `007d4be` | claude-opus-4-7 | Add SVG favicon (`/favicon.svg` 200, 236B) — kills the residual `/favicon.ico 404` in browser consoles. `/openapi.json paths: []` tracked separately as FEAT-010. |
| 2026-04-23 04:15 | `2c51e80-202604230411` | `2c51e80` | claude-opus-4-7 | PLAN-007 multi-engine executor refactor GA. 15 commits (9f2426c..2c51e80) covering FEAT-011..016: `AgentEvent` schema + zod / ClaudeCode + workspace / ACP Gemini+Qwen / three-tier `ExecutorProfile` / `ProcessManager` (slot + group + priority + stall) / Codex + Cursor. Tests: shared 7→12, api 158→413, web 17→26, lint 6→0. GHCR build 1m57s. Install recreated `aiworker-dashboard`, `/health` 200 ok (public https via Cloudflare). Legacy `{type:'http'...}` configs read-migrate to profile shape at boot; existing registered workers keep working without intervention. |
| 2026-04-23 05:07 | `aa10f69-202604230505` | `aa10f69` | claude-opus-4-7 | PLAN-008 FEAT-017 Register dialog UX polish — `Base URL` now lists three topology shapes inline, `Generate` button mints a client-side CSPRNG token (`wtk_` + 43 chars base64url) with `AIWORKER_FORCE_TOKEN=<token>` helper + copy-to-clipboard. Playwright smoke confirmed token format and helper card on production. GHCR build 1m19s. |
| 2026-04-23 05:44 | `d052486-202604230542` | `d052486` | claude-opus-4-7 | PLAN-008 FEAT-018 Engine availability discovery — worker-side `GET /api/worker/engines` probe (PATH + auth-file mtime, 10-min cache, `?refresh=1`), frontend picker badges (`ready` / `login required` / `not installed`) + per-ACP-agent status, `docs/executor-engines.md` install+auth guide per engine. Tests api 413→429, web 26→32, lint stays 0. GHCR build 1m31s. PLAN-008 closed. |
