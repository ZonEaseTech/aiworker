# PLAN-286 Soul App standalone runtime and SDK

- **status**: pending
- **owner**: local
- **createdAt**: 2026-05-12 21:00
- **relatedTask**: FEAT-062

## Current State

AIWorker 的通用 runtime 已经可以支撑 local daemon、worker/workspace/session、
engine handoff、artifact index 和 review/memory。但这些能力当前主要由 Host app 使用。
如果 `aiworker-hr` 要成为独立项目，它需要一个 SDK 和 standalone runtime，而不是复制
Host 内部实现。

## Decision

建立 Soul App SDK，并提供 standalone runtime shell。Soul App 的领域逻辑依赖 SDK 和
协议，不依赖 Host app 的私有模块。Standalone 模式复用 AIWorker core runtime；
Host mounted 模式复用同一个 manifest 和 protocol handlers。

## Proposal

### 1. SDK Package

SDK 提供：

- manifest builder and validator；
- protocol handler interfaces；
- scoped runtime client；
- UI contribution adapter；
- artifact schema helpers；
- review/memory helper types；
- connector access request helpers；
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

## Scope

In scope:

- SDK package and exported types.
- Standalone runtime bootstrap helper.
- Demo Soul App fixture.
- Tests proving the same app works standalone and mounted.
- Docs for app authors.

Out of scope:

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
