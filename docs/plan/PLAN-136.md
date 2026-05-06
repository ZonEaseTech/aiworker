# PLAN-136 Restore public Caddy routing for fleet-hosted worker UI

- **status**: completed
- **createdAt**: 2026-05-06 13:23
- **approvedAt**: 2026-05-06 13:30
- **completedAt**: 2026-05-06 13:32
- **relatedTask**: BUG-079

## Context

`w_8jbcm249cxn4` is already paired and online. The failure is isolated to the
public ingress:

1. Gateway direct `/w/w_8jbcm249cxn4/` returns Worker UI HTML.
2. Gateway direct `/w/w_8jbcm249cxn4/api/worker/info` returns worker info.
3. Caddy `/w/w_8jbcm249cxn4/` returns 404.
4. Caddy access logs show public `/w/...` requests returning 404 from Caddy.
5. Remote Caddy has no `/w*` handler.

## Proposal

1. Update `ops/caddy/Caddyfile.tmpl` so the public ingress routes `/w*` to
   `127.0.0.1:9218` with `auth.snippet`.
2. Keep `/enroll-ws` unauthenticated as designed for OTP enrollment.
3. Preserve the production `/admin*` handler in the repository template so a
   future template deploy does not remove the existing Fleet UI route.
4. Patch the remote `/etc/caddy/Caddyfile`, validate it, reload Caddy, and
   verify `/w/...` behavior.

## Risks

1. `/w/*` expands the public management surface, so it must be covered by the
   same external-auth layer as `/admin*` and `/ws`.
2. A malformed Caddyfile could break public ingress; validation must run before
   reload and the previous file should be backed up.

## Scope

- `ops/caddy/Caddyfile.tmpl`
- remote `/etc/caddy/Caddyfile`
- PMA task/plan/changelog records

## Non-Goals

- No gateway, worker, or web runtime code changes.
- No fleet.db or worker.db writes.
- No secret or token inspection.

## Verification

- `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` on remote.
- `systemctl reload caddy` on remote.
- Loopback and public ingress curl checks for `/w/w_8jbcm249cxn4/`.
- Loopback bridge check for `/w/w_8jbcm249cxn4/api/worker/info`.

## Progress

- 2026-05-06 13:23: Root cause isolated to missing Caddy `/w*` handler.
- 2026-05-06 13:30: User approved the proposed fix.
- 2026-05-06 13:29: Remote Caddyfile backed up, `/w*` handler inserted,
  `caddy validate` passed, and Caddy reloaded active.
- 2026-05-06 13:30: Public `/w/...` and `/w/.../api/worker/info` now return
  `401` without credentials instead of Caddy fallback `404`; direct gateway
  `/w/...` still serves the Worker UI shell.
- 2026-05-06 13:31: Follow-up BUG-080 recorded for the independent OTP
  reconnect rejection found after the ingress route was fixed.
