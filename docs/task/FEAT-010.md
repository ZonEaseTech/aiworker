# FEAT-010 Publish registry routes into OpenAPI spec

- **status**: pending
- **priority**: P3
- **owner**: (unclaimed)
- **createdAt**: 2026-04-22 07:35
- **plan**: (none)

## Description

`/openapi.json` currently returns `paths: []` because `buildRegistryRoutes`
(`apps/api/src/dashboard/registry/routes.ts`) registers its 7 handlers with
`routes.get(...) / routes.post(...) / routes.patch(...) / routes.delete(...)`
rather than `routes.openapi(createRoute(...), handler)`. Those plain-method
calls bypass the Hono Zod OpenAPI registry, so the `/docs` Scalar page loads
but shows zero endpoints.

Scope of the fix:

1. Define response schemas for each endpoint (`workerSchema`, `workerListSchema`,
   `errorEnvelopeSchema`, `rotateResultSchema`, `launchResultSchema`).
2. Rewrite each handler with `createRoute({ method, path, request, responses })`
   and `routes.openapi(route, handler)` — keeping the existing body-parse
   behaviour (stick with the manual `safeParse` branch for now so the error
   envelope format stays identical; do **not** switch to `c.req.valid()` until
   the frontend can tolerate the zod-openapi default 400 body).
3. Leave `/:id/proxy/worker/*` on `.all(...)` with a `// OpenAPI intentionally
   omitted` comment — Zod OpenAPI doesn't express ALL + wildcard pass-through
   cleanly, and the contract is "transparent proxy" rather than a specified
   endpoint.
4. Confirm `/docs` lists the 7 routes; `/openapi.json` `paths` is non-empty.
5. Regenerate types if any downstream code depends on `openapi.json` output.

## ActiveForm

Registry routes omit OpenAPI registration; `/openapi.json` empty

## Dependencies

- **blocked by**: (none)
- **blocks**: (none) — purely documentation/DX work

## Notes

Found during the FEAT-009 post-deploy Playwright smoke on 2026-04-22. Not a
runtime bug: the UI talks to `/api/workers` directly with zod validators in
`apps/web/src`, so the empty spec only hurts `/docs` and any future SDK-gen
step. Classed P3 accordingly.

Estimated 30–60 minutes: ~350 LOC touched, mostly mechanical, but response
schemas need to stay in sync with current `c.json` shapes (especially the
`errorEnvelope` variants — register has 5 distinct error codes; rotate-token
has 4).
