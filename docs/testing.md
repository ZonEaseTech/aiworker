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

Real local engine CLI acceptance:

```text
tests/engine-real/engine-management.acceptance.ts
```

This gate intentionally uses the authenticated local `codex` and `claude`
commands. It must not replace either engine with fake behavior. It validates
the Worker runtime's process-management contract against both real CLIs:
preflight/version, structured output parsing, Stop/cancel interrupt, hard
timeout escalation, runtime dispose cleanup, and restart reconciliation to
`lost`. The evidence JSON records the git head/dirty state, timeout settings,
sample count, per-case process handles, process-group cleanup checks, and
per-engine pass-rate summary. It is not part of the default `bun run test` or CI
release gates because it depends on local engine authentication and may spend
real model quota. Run the single-sample smoke explicitly with:

```text
bun run test:engine-real
```

For release-style local evidence, run repeated real samples:

```text
AIWORKER_ENGINE_REAL_SAMPLES=5 bun run test:engine-real
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
| Phase 2 Soul distribution MVP | `docs/architecture.md`, `docs/protocol.md`, `docs/runtime.md` | docs check, host-control assignment tests, future Phase 2 journey proof | docs+tests |
| Host Soul release registry (publish/list, registry-backed options) | `docs/architecture.md`, `docs/protocol.md` | `packages/storage-sqlite` `host/soul-releases.test.ts`, `apps/host-cli` `host-server.test.ts` (`/api/host/soul-releases` + options), `host-options.test.ts`, `aiworker-host.test.ts` (`soul publish`/`soul list`/seed), `apps/host-web` SoulsPanel test | docs+tests |
| Phase 2 governance propagation | `docs/protocol.md`, `docs/architecture.md` | deferred to next Phase 2 governance slice; no v1 Worker runtime hook, Worker broker route, or partial propagation path | docs-only |
| Phase 2.1 Worker Access Tunnel | `docs/architecture.md`, `docs/protocol.md`, `docs/runtime.md` | canonical wording + `inversion-guards` baseline; host/worker tunnel tests and browser proof added by later implementation tasks | docs+tests baseline |
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
| Public worker create catalog policy | `docs/architecture.md`, `docs/runtime.md` | `apps/worker-cli/src/aiworker.test.ts` public-create catalog test, `scripts/check-soul-app-boundaries.test.ts` reversal guard | docs+tests |
| BYOK execution-mode deviation and secret boundary | `docs/runtime.md` | settings literal-secret rejection test, worker-daemon worker config tests, `deriveByokExecutionMetadata` shape test (`packages/worker-daemon/src/modes/worker/settings.test.ts`), BYOK visible-text regression guard (`packages/worker-runtime/src/worker/executor.test.ts` — `runByokExecutor — 可见文本守卫`), docs check | docs+tests |
| BYOK CLI parity — CLI and daemon use shared builder | `docs/runtime.md` (CLI and daemon parity section) | `deriveByokExecutionMetadata` unit test; CLI BYOK metadata test in `apps/worker-cli/src/aiworker.test.ts` (T2.1-CLI) | docs+tests |
| Multi-turn memory scoped to local-cli; BYOK is single-turn in v1.0.1 | `docs/runtime.md` (single-turn limitation section) | multi-turn acceptance criteria in existing resume tests are tagged local-cli only; no cross-turn recall asserted on BYOK paths | docs+tests |

## Worker Autonomy Inversion Guards

The worker-autonomy inversion is guarded by `tests/architecture/inversion-guards.test.ts`:

- C1 worker runs standalone with Host absent — G1 (Worker standalone golden path).
- C2 engine launch lives only in worker-* — G2.
- C3 host-control owns no runtime/domain/secret state — G4.
- C4 Soul = Template definition; Worker is its instance — covered by package/doc gates.
- C5 only Host->Worker surface is worker-control-protocol — G5, G9, G10.
- C6 secret redaction holds on both planes — G6.
- Remote aissh target callback URLs reject loopback — G7.
- Phase 2.1 managed employee remote access does not make Worker runtime depend on Host — G8.
- Phase 2 provisioning uses target adapters instead of hard-coded aissh servers — G11.

Guards whose code lands in later inversion plans start as `test.todo` and are
promoted to real assertions when that plan lands.

## Current Release Gates

Release confidence is split into two independent gates so a Phase 2 (Host) flake
cannot block a worker release. The split isolates host test flakiness only: the
worker gate still runs repo-wide `typecheck`, `lint`, and `build`, so a
deterministic host compile/type/lint error still blocks the worker gate by
design — only host flaky tests move to the Phase 2 gate.

Worker v1 release confidence is built from these gates:

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
bun run test:worker
```

Phase 2 (Host) release confidence is built from these gates:

```text
bun run build:host
bun run test:browser:phase2
bun run smoke:host-dist-release
bun run test:host
```

`bun run release:check` is the aggregator for the worker gate list, and
`bun run release:check:phase2` is the aggregator for the Phase 2 gate list. Each
must stay in sync with the commands above.

## Release Exit Criteria

`bun run release:check` must exactly aggregate the worker gate list and
`bun run release:check:phase2` must exactly aggregate the Phase 2 gate list.

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
-> archives workspace without exposing Worker archive from browser context
```

Do not modify the new architecture to satisfy old E2E assumptions. Delete or
rewrite tests that require Host to import Soul source, expect old daemon product
backend behavior, expect a Soul-provided mounted workbench, or encode
`router-mode="pure"` as production behavior.

## Phase 2 MVP Experience Proof Scope

The Phase 2 product proof is not a Host-embedded Workbench proof. It is a Soul
distribution and employee readiness proof:

```text
author publishes a Soul version
-> administrator assigns that Soul version to an employee or group
-> Host records connector authorization, permission set, and gateway/profile ref
-> employee Worker is provisioned or located with that assignment
-> employee opens the Worker-owned Workbench as a ready-to-use AI worker
-> Host can show assignment, rollout, readiness, and lifecycle status
-> Host cannot read or render session chat, invocation events, projection output,
   engine process state, workspace domain files, or literal secrets
```

The product acceptance criteria are:

- author: can iterate a Soul version without adding UI, app-owned API, or Host
  integration files to the Soul;
- administrator: can copy one published capability to many employees and see
  rollout/readiness state without touching employee runtime data;
- employee: sees a ready Worker and can start a workspace/session without Host,
  Soul descriptor, MCP, engine-target, or deployment jargon;
- governance: assignment records carry only Soul version identity, connector
  authorization, permissions, gateway/profile refs, and lifecycle/provisioning
  metadata;
- current-slice governance deferral: until the dedicated Phase 2 governance
  slice lands, connector authorization, permission allocation, gateway/profile
  sync, and rollout/rollback execution remain target-contract metadata only; the
  current Host assignment DB/API stores provisioning, readiness, access,
  lifecycle, and Soul release identity, not those governance payloads;
- Phase 2 provisioning: aissh success is not ready until Worker check-in and access ready.
- honest delivery status (切片 2 Phase 1): `deliverProvisioningTarget` returns `deliveryStatus: 'command_generated'` while the Host only generates a provision command — it must never hard-report `'delivered'` (false-green). `'executed'`/`'failed'` are produced only once real execution actually yields a check-in-capable Worker (Phase 2 first-provision bootstrap), not before.
- remote aissh target rejects loopback callback URLs.
- Worker access: `/workers/:workerId` is employee navigation through Worker Access Adapter, not Host-rendered UI.
- Auth: Logto proves identity; AIWorker assignment decides exact Worker access.
- anti-mount: no Phase 2 acceptance test may treat micro-app, mounted workbench,
  iframe, or Host-rendered Worker UI as product value.

The Phase 2 browser proof gate is:

```text
bun run test:browser:phase2
```

It verifies that `/host` is the administrator control plane with `AI Workers`
and `开通 AI Worker`, and that `/workers/:workerId` is not accepted as a
Host-mounted Worker UI. The proof must not find `micro-app` or `iframe` on
either `/host` or the Worker access path. Static preview/history fallback is not an end-to-end Worker Access Adapter proof.

`bun run test:browser:host-dev` proves Host Web creates a real assignment
through Host API, real check-in moves it to `checked_in`, and Web refresh/reload
shows `Worker 已报到`. It does not claim Worker Access `ready` or opening a
Worker URL.

## Phase DoD Forcing Functions

The product baseline
(`docs/superpowers/specs/2026-06-09-product-baseline-design.md`) locks one hard
exit gate per phase — the forcing function that turns "the code exists" into
"the phase is done". These are durable acceptance shapes; the point-in-time
release status that satisfies them (specific release-candidate tags, host
addresses, live-instance counts) is tracked in project memory, not here.

- v1 standalone substrate: zero-config `aiworker start` starts the daemon/runtime
  on a single service port without opening a browser; `aiworker open` owns
  browser/Workbench URL launch; and a green `bun run release:check` includes the
  standalone Freeform browser proof.
- Phase 2 distribution MVP: the first real employee is onboarded through the
  managed enterprise-access boundary — a real Host URL, not a localhost or
  dev-static shortcut — and completes a native-engine real round, with at least
  two concurrent real employees on a working loop.
- Phase 2.1 managed access: a real two-host interconnect runs live (Host
  enterprise URL plus Logto plus a Worker-initiated tunnel reaching the
  Worker-owned Workbench), and Host or tunnel outage does not break the local
  Worker runtime.

These forcing functions never weaken the standing invariants: the Worker never
depends on Host, Host never enters the runtime hot path, Host never reads
session, invocation, projection, engine, or secret data, and `worker-*` never
imports `host-*`.

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
  Freeform-bound Worker and start the daemon/runtime without opening a browser;
  `aiworker open` owns local Workbench URL launch) and make the Workbench empty
  states the first-run experience (create-first-workspace, start-first-session);
  remove `apps/worker-web/src/worker/studio/first-run-soul-app-home.tsx`;
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
  `worker-control-protocol`) as Phase 2 control-plane surfaces that stay off the
  v1 Worker runtime hot path;
- reshape the `descriptor-v1` parser tests and the `apps/worker-web` mounted-render
  guards to the worker-owned model;
- add worker-owns-workbench and two-plane zero-intrusion architecture guards.

## Deferred Post-v1 Items (tracked, not Phase-B teardown)

Phase-B teardown is complete and the v1 release gates are green (a fresh
`release:check` exits 0). The items below were surfaced by the 2026-06-03 stage-1
alignment audit and are distinct from teardown. Deferral is a scheduling decision
and does not by itself make an item aligned; the alignment verdict for each is
stated. All three were initially deferred, then resolved in the follow-up round
(2026-06-03); they are kept here as a record of what was found and fixed.

1. **MCP redaction-coverage asymmetry — RESOLVED (commit `2ffa70aa`).** The
   display-side redaction regex (`SECRET_VALUE_RE` in
   `packages/engine-bridge/src/index.ts`) recognized fewer secret shapes than the
   write-reject regex (`LITERAL_SECRET_RE` in
   `packages/storage-sqlite/src/worker/index.ts`): it keyed on prefixes (`Bearer`,
   `sk-`, `token=`) and secret-like key names, while write-reject also matches
   credential value formats (`ghp_`, `gho_`, `github_pat_`, `AKIA`, `AIza`, JWT,
   PEM). Author-owned native MCP files may carry literal secrets and are shown
   view-only through `GET /api/workers/:workerId/config/:configKey/content`, so a
   value-format credential under a non-secret key name or inside an `args` array
   (a common MCP server config shape) was displayed unredacted — a reachable
   "secret into UI" deviation from the runtime.md redaction contract and the
   protocol.md "mcp-overlay content is redacted on display" rule. It was masked by
   a G6 check that only asserts the regex is *present* (not its coverage) and a
   worker-daemon test that only exercised `sk-`. Fixed by extracting a shared
   `SECRET_FORMAT_ALTERNATION` constant in engine-bridge (reused by the
   worker-daemon diagnostic redactor) and broadening display redaction to match
   write-reject coverage; engine-bridge and worker-daemon MCP content-route tests
   now assert `ghp_`/`AKIA`/`AIza`/JWT/PEM redaction. Per-plane write-reject
   detectors stay separate by design (G6 pins them as defense-in-depth); what is
   unified is *coverage*, enforced by the new tests, not a single physical regex.

2. **Dual projection engines — RESOLVED.** The live runtime path is
   `projectEngineAssetsToWorkspace` in
   `packages/engine-projection/src/workspace-projection.ts`. The retired contract
   test `projection-contract.test.ts` exercised a second, runtime-dead
   `projectEngineAssets` implementation in `packages/engine-projection/src/index.ts`
   that no runtime path called — giving partial false confidence. A coverage diff
   showed `workspace-projection.test.ts` already subsumed the contract test's
   scenarios (overlay disable/replace, entry-file overlay, reserved
   projection-overlay, receipt cleanup and cleanup-escape, MCP-secret
   metadata-only), so the dead `projectEngineAssets`/`cleanupReceipt`/
   `computeProjectionFreshnessMarker` surface and `projection-contract.test.ts`
   were deleted; `index.ts` now only re-exports the live `workspace-projection`
   API plus `engineProjectionPackage`. The one assertion not already covered —
   freshness-marker determinism for identical inputs — was ported to
   `workspace-projection.test.ts`. There is now a single projection engine, tested
   on the live path.

3. **Always-empty `HostedSoulApp.api` / `permissions` projection fields — RESOLVED.**
   The descriptor→`HostedSoulApp` projection in
   `packages/soul-descriptor/src/soul-app/registry.ts` used to emit
   `api: { localService: null, routePrefix: null }` and `permissions: []`
   unconditionally (v1 descriptors carry no app-owned API and no mounted
   workbench), and the worker-web settings dialog rendered them — dead, always-empty
   UI. The `api`/`permissions` projection fields, the `hostedSoulAppApiSchema`/
   `HostedSoulAppApi` type, the `apiForDescriptor`/`permissionsForDescriptor`
   helpers, and the settings-dialog block that rendered them (plus the now-orphaned
   `soulPacks` i18n copy) were removed. The Phase-2 `SoulAppPermission` type and the
   `SoulAppScopedContext` control-protocol interfaces (consumed by the Phase 2 Host
   control plane) are intentionally retained.

The 2026-06-03 audit also fixed a cosmetic nit outside these three: the CLI
release smoke PASS messages used retired wording ("Soul Apps", "Host Web/API");
they now read "the official Soul" and "the Workbench web and broker API".
