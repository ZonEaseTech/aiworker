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
  freeform-soul-contract.test.ts
  inversion-guards.test.ts
  package-ownership.test.ts
  refactor-contract.test.ts
```

Protocol tests:

```text
packages/soul-descriptor/src/
  descriptor-v1.test.ts
  index.test.ts
  lib/ids.test.ts
```

SDK tests:

```text
packages/soul-sdk/src/
  descriptor-build.test.ts
```

Worker runtime tests:

```text
packages/worker-runtime/src/
  config/worker.test.ts
  index.test.ts
  orchestration/identity-provider.test.ts
  orchestration/orchestrator.test.ts
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

Worker daemon tests:

```text
packages/worker-daemon/src/
  modes/worker.local.test.ts
  modes/worker/control.test.ts
  shared/middleware/error-handler.test.ts
```

Worker autonomy control-plane tests:

```text
packages/worker-control-protocol/src/index.test.ts
packages/host-control/src/registry.test.ts
apps/host-cli/src/aiworker-host.test.ts
apps/host-web/src/app.test.tsx
```

Boundary guard tests:

```text
scripts/check-soul-app-boundaries.test.ts
```

CLI and browser tests:

```text
apps/worker-cli/src/freeform-golden-path.test.ts
apps/worker-cli/src/aiworker.test.ts
tests/browser/freeform-cli-golden-path.spec.ts
```

CLI release smoke contract tests:

```text
apps/worker-cli/scripts/smoke-dist-release.test.ts
apps/worker-cli/scripts/smoke-release-artifacts.test.ts
apps/worker-cli/scripts/smoke-npm-package.test.ts
apps/worker-cli/scripts/smoke-standalone-release.test.ts
apps/worker-cli/scripts/smoke-standalone-runtime.test.ts
```

CLI release packaging contract tests:

```text
apps/worker-cli/src/official-freeform-descriptor.test.ts
apps/worker-cli/scripts/build-publish-manifest.test.ts
apps/worker-cli/scripts/package-release-bundles.test.ts
```

OpenAPI and redaction contract tests:

```text
packages/worker-daemon/src/modes/worker.local.test.ts
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
| Worker autonomy / Host control plane | `docs/architecture.md`, `AGENTS.md` | `bun run docs:check`, `bun run test:contracts` | docs+tests |
| Descriptor-only Host/Soul boundary | `docs/protocol.md`, `docs/soul-authoring.md` | `packages/soul-descriptor` tests, architecture tests | docs+tests |
| Worker-owned workbench | `docs/architecture.md`, `docs/runtime.md` | browser Freeform proof, refactor-contract tests | docs+tests |
| Session lifecycle and invocation state split | `docs/runtime.md` | architecture tests and engine bridge tests | docs+tests |
| Protocol implementation contract | `docs/protocol.md` | docs check and architecture tests | docs+tests |
| Runtime and bridge contract | `docs/runtime.md` | engine bridge and projection tests | docs+tests |
| OpenAPI and redaction boundary | `docs/runtime.md`, `AGENTS.md` | worker-daemon OpenAPI tests, storage redaction tests, engine bridge redaction tests, projection receipt tests | docs+tests |
| Worker config envelope and Worker metadata security | `docs/protocol.md`, `docs/runtime.md`, `docs/architecture.md` | storage worker config envelope tests, worker-daemon worker config tests, CLI/Web worker config tests, docs check | docs+tests |
| Soul authoring contract | `docs/soul-authoring.md` | SDK and Freeform contract tests | docs+tests |
| Worker metadata and forbidden domain schema | `docs/architecture.md`, `docs/runtime.md` | `forbidden-host-domain-schema.test.ts` | docs+tests |
| Freeform v1 acceptance Soul | `docs/architecture.md`, `docs/soul-authoring.md` | CLI and browser Freeform gates | docs+tests |
| BYOK execution-mode deviation and secret boundary | `docs/runtime.md` | settings literal-secret rejection test, worker-daemon worker config tests, docs check | docs+tests |

## Worker Autonomy Inversion Guards

The worker-autonomy inversion is guarded by `tests/architecture/inversion-guards.test.ts`:

- C1 worker runs standalone with Host absent — G1 (Worker standalone golden path).
- C2 engine launch lives only in worker-* — G2.
- C3 host-control owns no runtime/domain/secret state — G4.
- C4 Soul = Template definition; Worker is its instance — covered by package/doc gates.
- C5 only Host->Worker surface is worker-control-protocol — G5.
- C6 secret redaction holds on both planes — G6.

Guards whose code lands in later inversion plans start as `test.todo` and are
promoted to real assertions when that plan lands.

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
bun apps/worker-cli/scripts/package-release-bundles.ts
bun apps/worker-cli/scripts/smoke-release-artifacts.ts
```

The artifact smoke must verify checksums, required resources, descriptor references, executable mode, and current-platform `aiworker --version` startup.

## Browser Proof Scope

The v1 browser proof is Freeform-only and standalone:

```text
Worker Workbench opens standalone with Host absent on worker/workspace/session locator
-> renders the session chat directly in the worker Workbench without any micro-app
-> verifies the first invocation and starts a session-level follow-up from browser context
-> shows bridge event refs in the session chat
-> cancels a queued invocation without changing session lifecycle
-> reattaches and reconciles engine bridge events
-> refreshes projection receipts from the Workbench
-> applies worker config overlay and observes worker-overlay projection receipts
-> archives the session and rejects follow-up
-> archives workspace and worker lifecycle, blocking new work on archived worker
```

Do not modify the new architecture to satisfy old E2E assumptions. Delete or
rewrite tests that require Host to import Soul source, expect old daemon product
backend behavior, expect a Soul-provided mounted workbench, or encode
`router-mode="pure"` as production behavior.

## Pending Implementation (Phase-B Teardown)

Phase A flipped the canonical docs and doc gates to the worker-owns-workbench,
Soul-as-template, standalone-only v1 model.

Phase-B teardown is COMPLETE (commits `110a9a8e`..`5589af96`): every teardown bullet
below is landed and its guard re-armed. The worker-owns-workbench and two-plane
zero-intrusion guards are satisfied by the per-slice guards (worker-studio
direct-chat render + no-micro-app, `check-soul-app-boundaries`, inversion C1–C6).
The follow-ups worker-config overlay content editing and the i18n locale "Soul Apps"
wording cleanup are now also LANDED (overlay F1–F4 `d38851e5`/`03c80632`/`05f8ffbe`/
`a1f4b6cd`, consolidated to a single `worker-overlay://` impl in `19d0351b`; i18n
wording in `a1f4b6cd`). The rewritten Freeform browser proof has now been run on a
browser box (green inside a full `release:check` exit 0). That first real run exposed
a missing piece of the worker-owned chat — the composer submission was never echoed as
a `user-message` turn (the engine bridge stream carries no user turn) — now fixed in
`ChatSurface`/`ChatTranscript`, which prepend the submitted text as a leading
`user-message` turn ahead of the engine-derived turns. No Phase-B follow-ups remain.
Landed teardown:

- remove the capability layer: descriptor `capabilities`, session `capabilityId`,
  `/api/capabilities`, CLI `--capability` / `capability list`, SDK `capability()`,
  and Freeform `product/capabilities`;
- remove the mounted micro-app: `/api/mount/workbench`, `mounted-surface`,
  `@micro-zoe/micro-app`, and the descriptor `workbench` section plus its parser;
- remove the app-owned API proxy: the `/api/apps/:appId` and `/api/apps/:appId/*`
  runtime proxy routes and their credential-stripping handler, plus the descriptor
  `api` section;
- delete packages `soul-workbench` and `soul-app-runtime`; fold the session chat
  into `apps/worker-web`, and de-reference `@zonease/aiworker-soul-workbench` from
  the `test:cli` and `test:browser:freeform` build steps in `package.json`;
- strip the Host chrome from `apps/worker-web` (New Soul worker, Soul Apps, worker
  list); render the workspace tree with nested sessions and the session chat
  directly in the worker Workbench;
- implement the `aiworker start` zero-config entry (ensure a single active
  Freeform-bound Worker, start the daemon, open the local Workbench URL) and make
  the Workbench empty states the first-run experience (create-first-workspace,
  start-first-session); remove `apps/worker-web/src/worker/studio/first-run-soul-app-home.tsx`;
- derive workspace roots under the Worker home (`<worker-home>/workspaces/<id>`);
  remove the client-chosen `rootPath` parameter and the open-rootPath impl from
  workspace creation (AIWorker is not a developer tool pointed at arbitrary repos);
- collapse descriptor identity `appId`/`soulId` to a single Soul `id`, and prune
  the retired descriptor sections from the parser;
- remove SDK helpers `capability()` and `commonWorkbench()` (keep `defineSoul()`,
  `skill()`, `nativeMcp()`, `workspaceAsset()`); replace residual "Soul App"
  wording with "Soul" across source and output;
- add worker-config overlay content editing for skills, MCP, and entry files;
- keep the Host plane (`host-cli`, `host-web`, `host-control`,
  `worker-control-protocol`) as dormant Phase 2 stubs;
- reshape the `descriptor-v1` parser tests and the `apps/worker-web` mounted-render
  guards to the worker-owned model;
- add worker-owns-workbench and two-plane zero-intrusion architecture guards.
