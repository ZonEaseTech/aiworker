# AIWorker Soul App SDK

`@zonease/aiworker-soul-app-sdk` is the stable authoring surface for vertical
Soul Apps. A Soul App defines one `soul-app/v1` manifest plus protocol handlers,
then reuses the same definition in two modes:

- standalone: the app owns a small vertical shell and boots an embedded
  AIWorker core runtime for one app-bound worker;
- Host mounted: AIWorker Host reads the manifest, projects the Soul/capability
  catalog, and keeps engine, connector, artifact, review, and memory ownership.

## Minimal Shape

```ts
import { defineSoulApp } from '@zonease/aiworker-soul-app-sdk'

export const app = defineSoulApp({
  manifest,
  runtime: {
    async resolveCapability(context, input) {
      // Return one manifest capability. Do not call Host internals here.
    },
    async prepareSessionContext(context, input) {
      // Return prompt fragments, artifact types, and review rubric for a session.
    },
  },
})
```

## Runtime Boundary

Soul Apps may use SDK helpers and public local daemon routes. They must not
import `apps/api`, `apps/cli`, Host storage internals, engine adapters, connector
vaults, or global review/memory stores.

The SDK exposes:

- `defineSoulApp(...)` and `createSoulAppManifest(...)`;
- protocol handler and manifest types from `@zonease/aiworker-shared`;
- `createSoulAppClient(...)` for scoped public local API calls;
- `createStandaloneSoulAppRuntime(...)` for app-scoped standalone bootstraps;
- `createMountedSoulAppTestRuntime(...)` for proving the same definition works
  through Host manifest projection.

Host-side execution of external app UI/API handlers remains gated by the
isolation brokers tracked in PLAN-287.
