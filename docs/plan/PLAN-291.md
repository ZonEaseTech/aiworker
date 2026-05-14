# PLAN-291 Soul App app-level autonomy and Host mounted execution

- **status**: completed
- **createdAt**: 2026-05-13 01:30
- **approvedAt**: 2026-05-13 01:30
- **relatedTask**: FEAT-066

## Context

The current branch contains a completed FEAT-060..065 prototype series:

- `packages/shared/src/soul-app/*` defines `soul-app/v1` manifest and protocol
  types.
- `packages/core/src/soul-app/registry.ts` installs static manifests and
  projects app Souls/templates into the Host catalog.
- `packages/core/src/soul-app/broker.ts` provides app-scoped storage,
  connector evidence, review/memory proposal and engine-denial decisions.
- `packages/soul-app-sdk/src/index.ts` provides authoring helpers and local
  runtime harnesses.
- `packages/aiworker-hr` and `packages/aiworker-qa` contain reference app
  definitions and smoke tests.
- `apps/api/src/modes/worker.ts` exposes Host app registry and broker routes.
- `apps/cli/src/aiworker.ts` exposes app create/validate/smoke commands.

Zero-trust review found production gaps:

- Reference Soul Apps live under `packages/` rather than `apps/`.
- App-owned manifests do not exist at package roots.
- Manifest-declared entries are not present in the reference app directories.
- SDK runtime identity still uses `manifest.soul.id` for app-origin workers.
- Host mounted API namespace still returns `SOUL_APP_API_NOT_LOADED`.
- Broker context trusts query ids before Host-owned scope validation.

## Proposal

### 1. App workspace convergence

Move reference apps to:

```text
apps/aiworker-hr/
apps/aiworker-qa/
```

Each app owns:

```text
soul-app.manifest.json
package.json
src/index.ts
src/standalone.ts
src/host-mounted.ts
schemas/*.schema.json
capabilities/*/prompt.md
capabilities/*/review.md
review/*.md
packs/*/SOUL.md
```

Package scripts must include `dev`, `build`, `serve`, `validate`, `smoke`,
`typecheck` and `test`.

### 2. Runtime identity correction

Change app-origin runtime identity so Host and standalone paths agree:

```ts
worker.soulId = app.manifest.id
worker.metadataJson.domainSoulId = app.manifest.soul.id
worker.metadataJson.soulAppId = app.manifest.id
```

This makes `aiworker-hr` the runtime Soul id and keeps `hr` as a domain
descriptor, not the Host routing identity.

### 3. Boundary validation

Extend validation/lint boundaries:

- `apps/aiworker-*` cannot import sibling Soul App internals.
- `apps/aiworker-*` cannot import Host private apps or packages.
- Host code cannot import `apps/aiworker-*/src/*`.
- Soul App code should use `@zonease/aiworker-soul-app-sdk` and manifest files.

### 4. Host mounted service execution

Extend mounted mode from static namespace reservation to scoped service
interaction:

- Manifest declares local mounted service metadata.
- Host validates the manifest, enables the app, checks health, then proxies
  app API calls to the app service with scoped headers.
- Soul App service calls Host broker for shared resources.
- Host still owns connector secrets, engine scheduling, Host DB writes, audit
  and memory promotion.

### 5. Broker scope hardening

Before broker write paths mutate Host-owned storage/review/memory rows, validate
that supplied worker/workspace/session ids exist and belong together. Reject
mismatched scope with a deterministic denial response and audit row.

## Risks

- **Large surface area**: this crosses apps, SDK, API, CLI, Web and docs.
  Mitigation: implement in B then C order and run focused tests after each
  slice.
- **Workspace churn**: moving packages can break Bun workspace filters and lock
  metadata. Mitigation: update package names carefully and run root gates.
- **Mounted proxy security**: a naive proxy could forward privileged headers or
  allow path escape. Mitigation: allow only manifest-declared route prefix,
  inject scoped headers, strip caller auth headers where needed, and test
  disabled/missing app cases.
- **Broker false positives**: scope validation may reject app-local storage
  writes that have no workspace. Mitigation: validate only supplied Host scope
  ids and keep app-local storage without workspace allowed.

## Scope

In scope:

- App directory migration for HR and QA.
- App-owned manifests and asset files.
- Package scripts and focused app checks.
- SDK runtime identity fix.
- CLI validate/smoke updates.
- Import boundary lint/validation.
- Host mounted service proxy for local app services.
- Broker scope validation.
- Worker Web/docs status copy updates.
- PMA/changelog/verification records.

Out of scope:

- Remote marketplace.
- Untrusted third-party sandbox.
- Cloud control plane.
- Remote distribution format.
- Connector-specific real external integrations.

## Alternatives

- **Host-only app projection**: keep current package projection and make Host
  own all session/artifact work. Rejected because it does not provide true
  independent deployment.
- **Fully separate app processes only**: require every app to connect to an
  existing Host daemon. Rejected as the default because it weakens standalone
  local-first deployment.
- **Hybrid model**: standalone embeds public local runtime, mounted mode uses
  Host discovery and scoped broker. Selected because it preserves independent
  deployment and keeps shared resources under Host authority.

## Verification

- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Annotations

- 2026-05-13 01:30: User approved Codex to take over in goal mode and include
  both B and C in this goal. Implementation is approved.
- 2026-05-13 02:11: Completed. HR and QA are now app workspaces under `apps/`
  with app-owned manifests, service entrypoints, schemas, capability/review
  assets, package scripts and smoke coverage. SDK app-origin runtime identity
  now uses `manifest.id`; `manifest.soul.id` is retained as domain metadata.
  Host mounted app APIs can proxy to a declared or launched local app service.
  Broker write paths validate worker/workspace/session scope before mutation.
  Lint and CLI validation now block Host-private and sibling app imports.

## Verification Results

- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-hr' build`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-qa' build`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

All commands exited 0. `bun run build` still reports the existing Web chunk-size
warning, but the build succeeds. code-review-graph reports risk 0.65 and 148
test-gap hints, with the changed critical paths covered by focused API, CLI,
SDK, app and broker tests.
