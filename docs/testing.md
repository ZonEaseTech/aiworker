# AIWorker Testing

This document defines the canonical verification contract.

## Testing Model

Contract tests are the primary guardrail for this destructive refactor. Old E2E
volume is not architecture proof.

The baseline favors focused static, unit, package, CLI, and browser proof over
large historical flows.

## Required Test Areas

Architecture tests:

```text
tests/architecture/
  forbidden-host-domain-schema.test.ts
  freeform-mounted-workbench-contract.test.ts
  freeform-soul-contract.test.ts
  package-ownership.test.ts
  refactor-contract.test.ts
```

Protocol tests:

```text
packages/soul-protocol/src/
  descriptor-v1.test.ts
  index.test.ts
  lib/ids.test.ts
  mounted-routing-contract.test.ts
```

SDK tests:

```text
packages/soul-app-sdk/src/
  descriptor-build.test.ts
```

Host runtime tests:

```text
packages/host-runtime/src/
  config/worker.test.ts
  host/identity-provider.test.ts
  host/runtime.test.ts
  index.test.ts
  soul-app/registry.test.ts
  worker/engine-env.test.ts
  worker/executor.test.ts
  worker/local-engine-resolver.test.ts
  worker/runtime.test.ts
```

Engine projection tests:

```text
packages/engine-projection/src/
  index.test.ts
  projection-contract.test.ts
  workspace-projection.test.ts
```

Engine bridge tests:

```text
packages/engine-bridge/src/
  bridge-contract.test.ts
  index.test.ts
```

Host daemon tests:

```text
packages/host-daemon/src/
  modes/worker.local.test.ts
  shared/middleware/error-handler.test.ts
```

Boundary guard tests:

```text
scripts/check-soul-app-boundaries.test.ts
```

CLI and browser tests:

```text
apps/cli/src/freeform-golden-path.test.ts
apps/cli/src/aiworker.test.ts
tests/browser/freeform-cli-golden-path.spec.ts
tests/browser/freeform-mounted-workbench.spec.ts
```

CLI release smoke contract tests:

```text
apps/cli/scripts/smoke-dist-release.test.ts
apps/cli/scripts/smoke-release-artifacts.test.ts
apps/cli/scripts/smoke-npm-package.test.ts
apps/cli/scripts/smoke-standalone-release.test.ts
apps/cli/scripts/smoke-standalone-runtime.test.ts
```

CLI release packaging contract tests:

```text
apps/cli/scripts/build-publish-manifest.test.ts
apps/cli/scripts/package-release-bundles.test.ts
```

OpenAPI and redaction contract tests:

```text
packages/host-daemon/src/modes/worker.local.test.ts
packages/storage-sqlite/src/worker/index.test.ts
packages/engine-bridge/src/bridge-contract.test.ts
packages/engine-projection/src/workspace-projection.test.ts
```

## Current Bootstrap Gate

The first guardrail is:

```text
bun run test:contracts
```

It verifies that canonical docs exist, root workspaces include `souls/*`,
`AGENTS.md` is a short bootstrap, session lifecycle is separate from invocation
state, protocol/authoring remain descriptor-only and native-MCP based, and broad
replacement buckets such as `core-v2` and `shared-v2` do not appear.

## Canonical Coverage Ledger

Coverage status values:

- `docs+tests`: preferred for high-risk architecture boundaries.
- `docs-only`: acceptable for explanatory or low-risk guidance.
- `tests-only`: acceptable for mechanical constraints where docs would be noisy.
- `tmp-only`: evidence only. tmp-only is not acceptable for closed hard decisions.
  Use it only when the ledger explains that the idea was exploratory or rejected.

| Decision area | Canonical home | Guardrail | Status |
| --- | --- | --- | --- |
| Host shell / locator / mount / bridge | `docs/architecture.md`, `AGENTS.md` | `bun run docs:check`, `bun run test:contracts` | docs+tests |
| Descriptor-only Host/Soul boundary | `docs/protocol.md`, `docs/soul-authoring.md` | `packages/soul-protocol` tests, architecture tests | docs+tests |
| Production mounted workbench routing | `docs/protocol.md`, `docs/runtime.md` | browser Freeform proof, mounted routing contract tests | docs+tests |
| Session lifecycle and invocation state split | `docs/runtime.md` | architecture tests and engine bridge tests | docs+tests |
| Protocol implementation contract | `docs/protocol.md` | docs check and architecture tests | docs+tests |
| Runtime and bridge contract | `docs/runtime.md` | engine bridge and projection tests | docs+tests |
| OpenAPI and redaction boundary | `docs/runtime.md`, `AGENTS.md` | host-daemon OpenAPI tests, storage redaction tests, engine bridge redaction tests, projection receipt tests | docs+tests |
| Soul authoring contract | `docs/soul-authoring.md` | SDK and Freeform contract tests | docs+tests |
| Host metadata and forbidden domain schema | `docs/architecture.md`, `docs/runtime.md` | `forbidden-host-domain-schema.test.ts` | docs+tests |
| Freeform v1 acceptance Soul | `docs/architecture.md`, `docs/soul-authoring.md` | CLI and browser Freeform gates | docs+tests |

## Current Release Gates

Current release confidence is built from these gates:

```text
bun run docs:check
bun run test:contracts
bun run test:protocol
bun run test:cli
bun run test:browser:freeform
bun run typecheck
bun run lint
bun run build
bun run smoke:dist-release
bun run smoke:standalone-release
bun run smoke:standalone-runtime
bun run smoke:npm-package
bun run test
bun run check
```

`bun run release:check` is the aggregator for this current release gate list.
It must stay in sync with the commands above.

## Release Exit Criteria

`bun run release:check` must exactly aggregate the Current Release Gates.

Tag release handoff must run post-compile artifact proof after `release:check`
and before npm publish or GitHub release attachment. The post-compile artifact
proof is:

```text
bun apps/cli/scripts/package-release-bundles.ts
bun apps/cli/scripts/smoke-release-artifacts.ts
```

The artifact smoke must verify checksums, required resources, descriptor references, executable mode, and current-platform `aiworker --version` startup.

## Browser Proof Scope

The v1 browser proof is Freeform-only:

```text
Host Web opens worker/workspace/session locator
-> resolves Freeform workbench
-> mounts via micro-app router-mode=search
-> SDK common workbench renders
-> verifies the first invocation and starts a session-level follow-up from browser context
-> shows bridge event refs to the mounted surface
-> cancels a queued invocation without changing session lifecycle
-> reattaches and reconciles engine bridge events
-> refreshes projection receipts from mounted context
-> applies worker config overlay and observes worker-overlay projection receipts
-> archives the session and rejects follow-up
-> archives workspace and worker lifecycle, blocking new work on archived worker
```

Do not modify the new architecture to satisfy old E2E assumptions. Delete or
rewrite tests that require Host to import Soul source, expect old daemon product
backend behavior, or encode `router-mode="pure"` as production behavior.
