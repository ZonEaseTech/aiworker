# PLAN-293 Mounted Surface Protocol and release gate hardening

- **status**: completed
- **createdAt**: 2026-05-13 12:00
- **approvedAt**: 2026-05-13 12:00
- **relatedTask**: FEAT-068

## Context

FEAT-066 and FEAT-067 moved Soul Apps into runnable `apps/*` workspaces and
hardened the mounted API service boundary. The remaining gap is product-level
mounted UI execution: Host can list route/panel/widget metadata, but it cannot
render app-owned surfaces without either importing app source or falling back to
an iframe-only answer.

The next step is a renderer-aware mounted surface protocol:

- `host-descriptor` for business panels rendered by Host-owned components.
- `sandboxed-frame` for isolated app-owned screens.
- `trusted-module` remains a protocol value but is not allowed in this slice.

Release hardening also needs to close known zero-trust gaps before branch
publication:

- manifest schema hashes must match the actual schema files;
- declared mounted `baseUrl` services must pass a Host healthcheck;
- mounted service requests should receive a Host-signed scoped context;
- Host Web must render real mounted surface output, not only metadata rows.

## Proposal

### 1. Manifest surface protocol

Extend `ui.routes`, `ui.panels`, `ui.workspaceWidgets`, `ui.artifactPreviews`
and `ui.reviewPanels` with an optional `surface` declaration:

```ts
{
  renderer: 'host-descriptor' | 'sandboxed-frame' | 'trusted-module'
  entry: '/surfaces/...'
  scope: 'app' | 'workspace' | 'session' | 'artifact' | 'review'
  requiredPermissions?: string[]
}
```

Keep the existing `entry` field as the app-owned source reference for packaged
assets. Host must continue discovering UI through the manifest without importing
`apps/<id>/src/*`.

### 2. Zero-trust release gates

Add hard checks for:

- `schemaSha256` equals the SHA-256 of the referenced schema file;
- mounted service `baseUrl` remains loopback-only and passes `healthPath`;
- Host injects `x-aiworker-mount-context` and
  `x-aiworker-mount-signature` on mounted API/surface requests;
- broker scope validation continues to fail closed for mismatched Host-owned
  worker/workspace/session ids.

### 3. Host surface rendering

Add a Host route that resolves a declared surface, proxies only that declared
entry to the mounted app service, and returns a controlled surface response.

Host Web should render:

- `host-descriptor` descriptors with Host components;
- `sandboxed-frame` surfaces with a sandboxed iframe proxy URL;
- disabled apps as paused, with no active mounted affordances.

### 4. HR and QA reference surfaces

Update HR and QA mounted services to expose one real descriptor surface and one
frame surface each. Descriptor actions should demonstrate broker usage without
letting app JS into the Host runtime.

## Scope

In scope:

- manifest schema/types/registry updates;
- CLI validate and smoke updates;
- API mounted health/context/surface proxy updates;
- Web mounted surface renderer;
- HR/QA manifest and service updates;
- tests and PMA/changelog records.

Out of scope:

- trusted remote module loading;
- marketplace distribution;
- third-party sandboxing beyond local loopback and iframe isolation;
- real external connector integrations.

## Verification

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts`
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

## Annotations

- 2026-05-13 12:00: Created from the user-approved goal-mode request to make
  mounted UI renderer-aware rather than iframe-only, while closing the
  remaining zero-trust release gates.
- 2026-05-13 12:16: Completed. Added renderer-aware `surface` declarations for
  mounted UI contributions, real schema hash validation, declared `baseUrl`
  healthchecks, Host-signed mounted context headers, descriptor and frame
  surface proxying, HR/QA descriptor/frame reference surfaces, and Worker Web
  rendering for descriptor plus sandboxed frame surfaces.

## Verification Results

- `bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app validate apps/aiworker-qa`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-hr`
- `bun apps/cli/src/aiworker.ts app smoke apps/aiworker-qa`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`

All commands exited 0. `bun run build` still reports the existing Web
chunk-size warning, but the build succeeds.
