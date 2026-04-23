# FEAT-017 Register worker UX improvements

- **status**: completed
- **priority**: P1
- **owner**: ben
- **createdAt**: 2026-04-23 05:00
- **startedAt**: 2026-04-23 05:00
- **completedAt**: 2026-04-23 05:15

## Description

Address operator confusion surfaced during the post-PLAN-007 UI smoke:

1. **Base URL** field has a vague `https://worker.example.com` placeholder and
   no inline guidance. Operators aren't sure whether to include a path, a
   port, a scheme, or a container hostname.
2. **Bootstrap API token** requires the operator to boot a worker container,
   scrape stdout for the minted token, then paste it in. Several valid flows
   (manual `docker run`, preconfigured compose) would be simpler if the
   dashboard could **propose** a token up front and let the operator inject it
   into the worker container as `AIWORKER_FORCE_TOKEN`.

Acceptance:

- Register dialog's `Base URL` input shows
  - improved placeholder (e.g. `http://aiworker-worker:3000`),
  - an inline helper line "The worker's HTTP root — include scheme + host/port, no path",
  - a `?` tooltip linking to a new `docs/deployment.md` subsection titled "Worker base URL formats" enumerating the three typical shapes (same-compose / cross-host HTTPS / cross-host direct port).
- Register dialog's `Bootstrap API token` input gains a **Generate** button
  to its right. Click:
  - synchronously generates a client-side `wtk_` + 44 char base62 string via
    `crypto.getRandomValues`, satisfies the existing `WORKER_API_TOKEN_PATTERN`
    regex exported from `@aiworker/shared/fleet/worker`,
  - writes it to the token field,
  - surfaces a collapsible helper block underneath with the exact env var
    pair the operator must set on the worker container:
    `AIWORKER_FORCE_TOKEN=<token>` plus a note that this is one-shot (only
    honoured on a freshly-bootstrapped worker with no `worker_identity` row).
- `packages/shared/src/fleet/worker.ts` exports a `generateWorkerApiToken()`
  utility so the frontend, docs, and any future CLI can mint tokens with one
  code path. Unit tests ensure produced tokens always satisfy
  `WORKER_API_TOKEN_PATTERN`.
- No change to the backend register contract (`POST /api/workers/register`)
  — the backend still treats the token as opaque; validation happens through
  a probe call to the worker's `/api/worker/info`.
- Frontend stays on shadcn/ui + Base UI; no new dependency.

## ActiveForm

Improving the Register dialog's Base URL guidance and adding a client-side token generator.

## Dependencies

- **blocked by**: (none — frontend + docs only)
- **blocks**: FEAT-018 indirectly benefits from clearer registration flow, but
  does not require this.

## Notes

- Related plan: `docs/plan/PLAN-008.md`.
- `AIWORKER_FORCE_TOKEN` behaviour (one-shot, refuses when `worker_identity`
  already exists) is established in PLAN-004 and not changed here.
- Server-side token generator stays untouched (still runs `mintApiToken()` on
  first worker boot unless `AIWORKER_FORCE_TOKEN` is present).
- Security note: a client-side RNG is sufficient here. The token is a shared
  secret the operator is expected to handle; it never leaves dashboard →
  browser → operator clipboard → operator's worker-host env. No upload of
  the minted token to the dashboard DB happens until the operator actually
  registers the worker and the manager verifies it against the worker itself.
