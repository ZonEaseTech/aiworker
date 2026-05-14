# PLAN-292 Soul App mounted hardening and authoring readiness

- **status**: completed
- **createdAt**: 2026-05-13 02:32
- **approvedAt**: 2026-05-13 02:32
- **relatedTask**: FEAT-067

## Context

The current branch has completed Host / Soul App dual autonomy through
FEAT-066:

- HR and QA reference Soul Apps live under `apps/aiworker-hr` and
  `apps/aiworker-qa`.
- Each app owns manifest, standalone entry, Host-mounted entry, assets, scripts
  and smoke coverage.
- Host can install, enable, catalog and proxy enabled mounted app APIs to local
  services.
- The app smoke path validates standalone worker/session/artifact/review and
  mounted Host projection.

Follow-up review found five pre-publication gaps:

- `@zonease/aiworker-soul-app-sdk` still imports Host runtime and SQLite worker
  DB types, which makes the public authoring SDK too broad.
- Manifest validation accepts arbitrary `localService.baseUrl` values.
- The Host proxy strips `authorization`, but still forwards other sensitive
  caller headers and has no Host-owned mount token or request timeout.
- Worker Web lists app lifecycle state, but does not surface mounted routes,
  panels or API route prefix as user-visible product affordances.
- The scaffold generates a minimal single-entry app instead of the full
  standalone and host-mounted app shape used by real reference apps.

## Proposal

### 1. Zero-trust review and test locks

Add focused tests before implementation for:

- remote mounted service URL rejection;
- mounted proxy header stripping, token injection and timeout behavior;
- service teardown on disable;
- SDK package dependency split;
- Worker Web mounted contribution rendering;
- generated scaffold layout and smoke metadata.

### 2. SDK/runtime split

Keep `packages/soul-app-sdk` as the app authoring contract:

- manifest creation and validation helpers;
- `defineSoulApp`;
- protocol and manifest types;
- scoped Host client.

Move local runtime harnesses to a new `packages/soul-app-runtime` package:

- `createStandaloneSoulAppRuntime`;
- `createMountedSoulAppTestRuntime`;
- `SoulAppRuntimeHarness`;
- Host local executor type re-exports needed by tests.

Reference app source keeps depending on SDK. Reference app tests and generated
smoke harnesses depend on runtime explicitly.

### 3. Mounted service hardening

Enforce local-only service URLs in manifest validation and Host runtime:

- allow `http://127.0.0.1`, `http://localhost`, `http://[::1]`, and equivalent
  loopback IPv4 addresses only;
- reject remote hostnames and non-HTTP schemes;
- generate an app-scoped mount token per mounted service;
- pass `AIWORKER_MOUNT_TOKEN` to launched services and
  `x-aiworker-mount-token` to proxied requests;
- strip caller credentials and forwarding headers before proxying;
- use a deterministic upstream timeout;
- stop launched service processes when the app is disabled.

### 4. Product-level mounted Web acceptance

Update Worker Web Soul Apps rail to show:

- mounted API route prefix;
- route contributions;
- panel/widget/review/artifact contribution counts;
- clear disabled state without treating disabled apps as mounted affordances.

The UI remains compact because this is an operational workbench rail, not a
marketing catalog.

### 5. Scaffold upgrade

Upgrade `aiworker app create` to produce the same app-level structure expected
from real Soul Apps:

```text
soul-app.manifest.json
package.json
tsconfig.json
README.md
src/index.ts
src/standalone.ts
src/host-mounted.ts
schemas/brief.schema.json
capabilities/brief/prompt.md
review/brief.md
packs/<app-id>/SOUL.md
```

Generated scripts should include `dev`, `build`, `serve`, `validate`, `smoke`,
`typecheck` and `test`.

## Scope

In scope:

- SDK/runtime package split.
- Host mounted service safety checks and lifecycle cleanup.
- Reference app import/dependency updates.
- Worker Web mounted contribution display and tests.
- CLI scaffold files, scripts and tests.
- PMA docs and verification records.

Out of scope:

- Branch publication or PR creation.
- Remote marketplace and distributed package install.
- Third-party sandboxing beyond local loopback service enforcement.
- Real connector integrations.

## Verification

- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' test`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
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

## Annotations

- 2026-05-13 02:32: Plan created from user-approved goal-mode follow-up scope.
- 2026-05-13 03:34: Completed. `packages/soul-app-sdk` is now authoring-only;
  `packages/soul-app-runtime` owns standalone and mounted runtime harnesses.
  Mounted services are loopback-only, receive Host-generated mount tokens, lose
  caller credential headers at proxy time, and are stopped when disabled.
  Worker Web exposes mounted API prefix, routes and slot counts in the Soul Apps
  rail. Scaffolded apps now include `src/standalone.ts` and
  `src/host-mounted.ts`, with generated smoke proving standalone and mounted
  service paths.

## Verification Results

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-soul-app-runtime' test`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa`
- Browser smoke on `http://127.0.0.1:9327/` with HR and QA installed/enabled:
  Soul Apps rail showed mounted API prefixes, routes and `4 mounted slots` for
  both apps.
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

All commands exited 0. `bun run build` still reports the existing Web chunk-size
warning, but the build succeeds. code-review-graph reports risk 0.60 and 34
heuristic test-gap hints; focused HR/QA token tests, API proxy tests, CLI
scaffold tests, SDK/runtime tests and browser smoke cover the changed critical
paths.
