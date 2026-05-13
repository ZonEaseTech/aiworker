# PLAN-286 Soul App standalone runtime and SDK

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 21:00
- **relatedTask**: FEAT-062

## Current State

AIWorker 的通用 runtime 已经可以支撑 local daemon、worker/workspace/session、
engine handoff、artifact index 和 review/memory。但这些能力当前主要由 Host app 使用。
如果 `aiworker-hr` 要成为独立项目，它需要一个 SDK 和 standalone runtime，而不是复制
Host 内部实现。

PLAN-284 / PLAN-285 已经落下静态 `soul-app/v1` manifest、protocol type surface、
Host registry persistence、install / enable / disable / healthcheck、catalog projection、
CLI/API/Web app lifecycle surface，以及 `/api/local/apps/:appId/*` scoped namespace
reservation。Host mounted 模式当前仍不执行外部 Soul App UI/API/runtime handler，
只消费静态 manifest 并把 enabled app 投影为 Soul/capability catalog。

当前可复用实现边界：

- `packages/shared/src/soul-app`：manifest schema、protocol type definitions、HR/QA
  reference manifest fixtures 和 Host projection helpers。
- `packages/core/src/worker/runtime.ts`：worker-scoped workspace/session/turn/artifact/
  review/lesson runtime，可作为 standalone runtime 的业务内核。
- `packages/core/src/soul-app/registry.ts`：Host-side app lifecycle registry，适合被
  mounted harness 复用，但不能成为外部 app 的 authoring SDK。
- `apps/api/src/modes/worker.ts`：local daemon HTTP surface 和 Worker Web static host。
  它现在默认暴露 Host 多 app/多 worker catalog；standalone 模式需要 app-scoped
  bootstrap/filter，而不是复制整套 API。
- `apps/cli/src/aiworker.ts`：已有 Host CLI 和 local runtime bootstrap，但外部
  `aiworker-hr serve` 应通过 SDK helper 组合，不应依赖 CLI 私有函数。

## Decision

建立 Soul App SDK，并提供 standalone runtime shell。Soul App 的领域逻辑依赖 SDK 和
协议，不依赖 Host app 的私有模块。Standalone 模式复用 AIWorker core runtime；
Host mounted 模式复用同一个 manifest 和 protocol handlers。

## Proposal

### 1. SDK Package

新增 `@zonease/aiworker-soul-app-sdk` package，作为外部 Soul App 的唯一稳定依赖面。
SDK 提供：

- typed manifest builder / validator，复用 shared schema 但隐藏 Host registry internals；
- `defineSoulApp(...)` / protocol handler interfaces，保证 manifest 与 handlers 绑定；
- scoped Host/standalone client，覆盖 app 内需要的 worker/workspace/session/artifact/
  review/lesson API；
- UI/API contribution descriptors and adapters，只描述 contribution，不接管 Host shell；
- artifact schema、review/memory 和 connector request helper types；
- test harness for standalone and mounted behavior。

### 2. Standalone Runtime

提供一个最小 standalone shell：

```text
aiworker-hr serve
  -> load aiworker-hr manifest
  -> boot embedded aiworker-core daemon/runtime
  -> mount only HR UI/API contributions
  -> expose HR-first local URL
```

Standalone shell 不显示多 Soul app catalog；它只展示当前 vertical app 的工作台、
settings 和 workspace/session/artifact/review 流程。

实现上不新建第二套 daemon。新增 app-scoped bootstrap helper：

```text
createStandaloneSoulAppRuntime(appDefinition, options)
  -> init dedicated app home / worker.db
  -> install + enable this app manifest
  -> create or load the app-bound worker
  -> expose one app-scoped local daemon API
  -> serve Worker Web with only this app/worker visible
```

Host lifecycle commands such as install/enable/disable/list-all-apps stay hidden in standalone
mode. External `aiworker-hr serve` can call this helper from its own package; AIWorker CLI
does not become the HR app binary.

### 3. Shared Logic Contract

Soul App 的领域代码必须在两种模式复用：

```text
domain logic
manifest
protocol handlers
UI contributions
artifact schemas
review policies
```

Standalone 与 mounted 只改变 host shell 与 bootstrapping，不改变领域逻辑。

### 4. Demo App

建立一个最小 demo app 验证 SDK：

- one workspace type；
- one capability；
- one artifact type；
- one route and one panel；
- one review rubric；
- one connector declaration。

The demo app should be defined once through the SDK and then exercised in both modes:

- standalone harness boots the app-scoped runtime and creates workspace/session/artifact/review；
- mounted harness installs the same manifest into Host registry and creates a worker/session
  through Host catalog projection；
- tests assert the manifest/domain handler definition is shared and no Host private module is
  imported by the demo app.

## Scope

In scope:

- SDK package and exported types.
- Standalone runtime bootstrap helper and app-scoped daemon filtering.
- Demo Soul App fixture.
- Tests proving the same app works standalone and mounted.
- Docs for app authors.

Out of scope:

- Executing untrusted external app UI/API code inside Host without isolation; PLAN-287 owns the
  broker/permission boundary.
- HR/QA production extraction, tracked by PLAN-288.
- Marketplace distribution.
- Remote deployment automation.
- Full connector implementations beyond brokered requests.

## Risks

- **SDK mirrors Host internals**：会导致 app 与 Host 紧耦合。
  Mitigation: SDK only exposes protocol-level context and clients.
- **Standalone forks product logic**：两个模式逐渐分裂。
  Mitigation: enforce shared app fixture tests for both modes.
- **Runtime duplication**：每个 Soul App 打包重复 daemon。
  Mitigation: provide embedded core runtime as shared dependency and allow Host
  mounted mode to skip standalone shell.
- **过早执行外部 app 代码**：会绕过 PLAN-287 的 isolation broker。
  Mitigation: FEAT-062 只提供 SDK、standalone bootstrap 和 harness；Host mounted
  production path remains manifest/projection-first until brokers land.

## Verification Plan

- SDK typecheck and unit tests。
- Demo app standalone integration smoke。
- Demo app Host mounted integration smoke。
- Browser smoke for standalone shell and Host mounted shell。
- CLI smoke for `serve` or equivalent standalone command。
- `git diff --check`。
- code-review-graph update/review after code changes。

## Progress

- 2026-05-12 21:00: Drafted as a full standalone SDK/runtime feature plan. No
  implementation started.
- 2026-05-12 23:10: Investigation refreshed after PLAN-284 / PLAN-285. Current code has
  static manifest/protocol and Host registry projection, but no authoring SDK package,
  no app-scoped standalone bootstrap, no scoped client, and no shared standalone/mounted
  harness. Proposal is ready for approval; no implementation started.
- 2026-05-12 23:20: Claimed for implementation after proposal approval.
- 2026-05-12 23:35: Completed SDK/runtime boundary implementation and verification.

## Implementation Record

- Added `packages/soul-app-sdk` as the external authoring package for Soul Apps.
  It exports `defineSoulApp(...)`, `createSoulAppManifest(...)`, shared manifest
  and protocol types, `createSoulAppClient(...)`, `createStandaloneSoulAppRuntime(...)`,
  and `createMountedSoulAppTestRuntime(...)`.
- Added SDK tests with a demo Soul App definition that runs unchanged in
  standalone and Host-mounted modes. The standalone path creates a worker,
  workspace, session, artifact and review through the app-scoped runtime; the
  mounted path installs/enables the same manifest through Host registry
  projection before creating the same runtime artifacts.
- Added a scoped client test that verifies SDK calls use public local daemon
  routes and inject only the app Soul id, not Host private modules.
- Added `packages/soul-app-sdk/README.md` for app authors, documenting the SDK
  surface and the boundary against Host internals.
- Updated `LocalWorkerRuntime` artifact metadata to carry `soulAppId` when the
  session metadata includes it, preserving app provenance for standalone and
  mounted outputs.
- Ran `bun install` so the new workspace package is linked and `bun.lock` is
  updated.

## Verification

- `bun run --filter '@zonease/aiworker-soul-app-sdk' test`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

`crg:review` completed with overall risk score 0.75 and test-gap hints around
Host API helper functions (`bootstrapWorkerApp`, template requirement helpers,
and metadata enrichment). Those paths remain covered by the local daemon API
tests added in PLAN-285; this PLAN-286 slice adds direct SDK tests for the new
standalone/mounted runtime helpers and scoped client.
