# PLAN-033 Admin surface fail-closed posture

- **status**: completed
- **createdAt**: 2026-04-28 20:33
- **approvedAt**: 2026-04-29 04:00
- **relatedTask**: TODO-004

## Context

Current admin serving has two surfaces:

1. Fleet admin is served by `packages/gateway/src/server.ts` at `/admin/*`.
   Gateway already runs `assertGatewayBindIsSafe()` before `Bun.serve()` and
   refuses non-loopback binds without `INTERNAL_SHARED_SECRET`. That protects
   direct remote gateway binds, but it intentionally cannot detect a public
   reverse proxy that forwards traffic from local loopback.
2. Worker admin is served by `apps/api/src/modes/worker.ts` at `/admin/*`.
   It is mounted before `/api/worker/*` bearer auth and is explicitly treated
   as a public static surface. Worker API calls remain bearer-gated. The CLI
   `aiworker serve` currently calls `Bun.serve({ port, fetch })` without an
   explicit hostname; local Bun 1.3.13 reports that this defaults to
   `localhost`, so public exposure usually comes from a reverse proxy or future
   explicit host support.

The web bundles do not contain persisted secrets by themselves. Fleet admin
connects to gateway `/ws`; worker admin sends `Authorization: Bearer ...` to
`/api/worker/*` only after a token is provided via URL fragment/sessionStorage.
The operational risk is therefore not static file disclosure alone. The higher
risk is an operator assuming that public `/admin/` is safe while the same public
ingress also exposes gateway `/ws` or worker management paths without the
required external auth layer.

Existing docs already state that public `/admin/*` must be behind basic-auth,
Cloudflare Access, IP allowlist, or equivalent external auth. Documentation-only
posture remains fragile because the failure mode is silent public serving.

## Proposal

Recommendation: do not implement a broad first-party app-level admin auth model
for this task. Implement a narrow fail-closed posture for public admin serving,
and keep external auth as the supported public deployment boundary.

Proposed implementation after approval:

1. Add a small shared admin exposure guard, for example
   `assertAdminServingIsSafe({ surface, host, serveWeb, externalAuthAcknowledged })`.
   The guard should be called only when an admin bundle is actually being
   served. Loopback binds pass. Non-loopback binds require an explicit operator
   acknowledgement such as `AIWORKER_ADMIN_EXTERNAL_AUTH=1`; otherwise startup
   fails with remediation text: bind loopback, disable admin with
   `--no-serve-web`, or put `/admin/*` behind external auth and set the
   acknowledgement.
2. Extend gateway startup without weakening existing BUG-019 behavior. Gateway
   still requires `INTERNAL_SHARED_SECRET` for non-loopback binds; serving the
   fleet admin on a non-loopback bind additionally requires the admin external
   auth acknowledgement or `--no-serve-web`.
3. Make worker HTTP binding explicit before adding worker fail-closed checks:
   add `AIWORKER_WORKER_HOST` and `aiworker serve --host`, defaulting to
   `127.0.0.1` or the current Bun default if compatibility requires it. When
   worker admin is served on a non-loopback host, require
   `AIWORKER_ADMIN_EXTERNAL_AUTH=1` or `--no-serve-web`.
4. Update deployment docs and README with a public-admin matrix:
   loopback/local is allowed, public reverse proxy must return 401/403 before
   hitting the app, and public direct bind either needs explicit external-auth
   acknowledgement or admin serving disabled.
5. Add deployment smoke checks that verify public `/admin/` is either protected
   by the external layer (`401`/`403`) or intentionally disabled (`404`) before
   a public deployment is considered ready.

This keeps the product boundary simple: AIWorker does not become an identity
provider yet, but it stops silently serving admin UI on explicit public binds.

## Risks

- Startup checks cannot prove that a loopback reverse proxy is externally
  protected. The acknowledgement can still be set incorrectly, so public smoke
  checks remain required.
- Adding a worker host option can expose latent deployment assumptions in
  Docker/systemd examples. The default must preserve current local behavior.
- A guard that checks only `/admin/*` must not be presented as protecting
  gateway `/ws` or worker `/api/worker/*`. Docs and error messages must keep
  that distinction explicit.
- Existing public deployments may need to set `AIWORKER_ADMIN_EXTERNAL_AUTH=1`
  or pass `--no-serve-web` after upgrade.

## Scope

Expected implementation scope after approval:

- Gateway: admin-serving guard call near `packages/gateway/src/server.ts`.
- Worker/CLI: host config parsing and `Bun.serve({ hostname })` wiring in
  `packages/core/src/config/worker.ts` and `apps/cli/src/commands/serve.ts`.
- Tests: focused unit/integration tests for gateway guard, worker host parsing,
  and CLI startup behavior.
- Docs: README plus deployment docs public-admin matrix and smoke commands.

No database migration is needed. No broad login/session/cookie model is included.

## Alternatives

1. App-level admin auth for `/admin/*` only.
   - Pros: hides static admin UI even if reverse proxy is misconfigured.
   - Cons: does not protect gateway `/ws`, does not replace worker bearer auth,
     creates double-auth UX with Caddy/Access, and can give a false sense of
     security if operators leave `/ws` exposed.
   - Recommendation: reject for now unless scoped as a small optional layer, not
     the primary security boundary.
2. Full first-party admin auth with sessions/cookies and WS integration.
   - Pros: coherent standalone public-admin product model.
   - Cons: broad feature: login, session storage, cookie security, CSRF,
     logout/rotation, proxy headers, browser WS auth, recovery, and tests.
   - Recommendation: defer until the product explicitly wants AIWorker-hosted
     public identity rather than reverse-proxy/SSO identity.
3. Documentation-only posture.
   - Pros: no code churn.
   - Cons: repeats the BUG-007 class of operational dependency; public exposure
     mistakes remain silent.
   - Recommendation: reject.

## Tests Needed

1. Gateway guard unit tests:
   - loopback + admin served + no acknowledgement passes.
   - non-loopback + admin served + no acknowledgement throws.
   - non-loopback + admin disabled passes.
   - non-loopback + admin served + acknowledgement passes.
2. Gateway startup integration test:
   - `startGateway({ host: '0.0.0.0', internalSharedSecret: '...' }, { webStaticDir })`
     fails without `AIWORKER_ADMIN_EXTERNAL_AUTH=1` and succeeds with it.
3. Worker config/CLI tests:
   - default host remains local-compatible.
   - `AIWORKER_WORKER_HOST=0.0.0.0` or `--host 0.0.0.0` with worker admin
     served fails without acknowledgement.
   - `--no-serve-web` bypasses the admin guard while `/api/worker/*` bearer auth
     remains unchanged.
4. Docs/smoke checks:
   - public gateway `/admin/` returns `401` or `403` through Caddy/Access before
     credentials.
   - a disabled admin bundle returns `404`.
   - worker public admin examples show `/admin/` protected separately from
     `/api/worker/*` bearer auth.

## Annotations

- 2026-04-28 20:33 Draft proposal recorded for review. No source changes were
  made.
- 2026-04-28 20:39 Retried from BKD follow-up source of truth and reused the
  existing `TODO-004` / `PLAN-033` files instead of creating duplicate PMA docs.
  Focused checks passed for gateway auth, gateway admin static serving, worker
  bearer auth, worker admin static serving, worker web bearer bootstrap, and
  Bun's current default host observation. No source implementation was made.
- 2026-04-28 20:44 Review pass recorded. No blocking findings were found in the
  proposal. Reviewer confirmed the proposal keeps broad first-party admin auth
  out of scope, distinguishes static `/admin/*` exposure from gateway `/ws` and
  worker bearer-gated `/api/worker/*`, and correctly recommends narrow startup
  fail-closed checks plus deployment smoke coverage. The plan remains a draft;
  implementation is still gated on explicit approval.
- 2026-04-29 04:00 User approved the narrow fail-closed path and explicitly
  deferred app-level admin auth for a future Logto integration.
- 2026-04-29 05:43 Completed implementation. Added a shared admin exposure
  guard, wired it into gateway and `aiworker serve`, added `--host`,
  `AIWORKER_WORKER_HOST`, and `AIWORKER_ADMIN_EXTERNAL_AUTH`, updated
  public-admin docs, and covered the guard with focused shared/gateway/worker
  config/CLI tests.

## Verification

- `bun test packages/shared/src/lib/admin-exposure.test.ts packages/gateway/test/auth.test.ts packages/gateway/test/config.test.ts packages/gateway/test/health.test.ts packages/core/src/config/worker.test.ts apps/cli/src/aiworker.test.ts`
- `bun run typecheck`
- `bun run lint`
- `bun run --filter '*' test`
- `bun run build`
- `git diff --check`
