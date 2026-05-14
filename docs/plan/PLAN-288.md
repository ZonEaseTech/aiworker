# PLAN-288 HR and QA external Soul App reference extraction

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 21:00
- **relatedTask**: FEAT-064

## Current State

HR 专业工作台已经在 Host 仓库内实现了 people/profile 操作面、artifact preview、
proposal composer 和 session/review 连接。QA 仍主要依赖通用 worker studio/fallback。
为了证明 Soul App 架构不是纸面协议，需要两个不同领域的 reference apps。

## Decision

以 HR 和 QA 作为首批 external Soul Apps：

```text
aiworker-hr
  -> people/profile workspace
  -> candidate/interview/onboarding/offboarding capabilities
  -> HR artifact schemas and review rubrics

aiworker-qa
  -> release/test-suite workspace
  -> test matrix / defect evidence / release gate capabilities
  -> QA artifact schemas and review rubrics
```

两者必须通过同一 SDK 和 manifest 与 Host 交互。

## Proposal

### 1. HR Reference App

迁移现有 HR 模块：

- manifest；
- people/profile workspace types；
- HR capabilities and artifact types；
- HR UI routes/panels/previews；
- HR review and memory policy；
- standalone shell entry；
- Host mounted entry。

迁移后 Host 只看到一个 mounted Soul App，不保留 HR 专属 route 分支。

### 2. QA Reference App

新建 QA reference app，最小完整对象：

- release workspace；
- test suite / test matrix；
- defect evidence；
- release gate artifact；
- risk review checklist；
- session action proposals。

QA 用来验证协议不只适合 HR people lifecycle。

### 3. Shared App Boundary

HR/QA app 都必须：

- 依赖 SDK/protocol；
- 使用 Host broker 访问 engine/connector/storage/review/memory；
- 提供 standalone and mounted tests；
- 保持 app-owned domain copy and UI logic；
- 不 import Host private modules。

### 4. Migration Strategy

先保留 Host 内的 generic fallback。HR external app 启用后取代内置 HR module；禁用后
可以显示 disabled app state 或 generic fallback，但不得静默使用旧 HR 分支。

## Scope

In scope:

- HR app extraction from existing web module structure.
- QA app reference implementation.
- Shared app packaging and fixtures.
- Standalone and mounted smoke coverage.
- Documentation for app boundaries and ownership.

Out of scope:

- External app marketplace.
- Real ATS/CI write integrations.
- PM/DevOps app extraction.
- Production release packaging until the protocol stabilizes.

## Risks

- **过早拆仓**：协议还未稳定时拆成多个 repo 会降低迭代速度。
  Mitigation: start as workspace packages with explicit app boundaries; only
  split repositories when packaging and governance are proven.
- **HR regression**：外部化可能破坏已完成 UI 体验。
  Mitigation: keep existing HR Playwright and focused tests as migration gates.
- **QA 太浅**：如果 QA 只是模板，不足以验证跨领域。
  Mitigation: QA must include release gate artifact and defect evidence surface.

## Verification Plan

- HR existing focused tests migrated and passing。
- QA model/UI tests。
- Standalone HR smoke。
- Standalone QA smoke。
- Host mounted HR/QA smoke。
- Generic fallback smoke with HR/QA disabled。
- Web/API/shared typecheck/lint/build according to touched packages。
- Browser UX review for HR and QA desktop/mobile surfaces。
- `git diff --check`。
- code-review-graph update/review after code changes。

## Progress

- 2026-05-12 21:00: Drafted as a full reference Soul App extraction plan. No
  implementation started.
- 2026-05-13 00:20: Claimed for goal-mode implementation after PLAN-287 broker
  completion. Scope is a monorepo reference extraction: package-level HR and QA
  app definitions using the SDK, standalone/mounted smoke tests, domain
  protocol handlers, and boundary docs. Full multi-repository split remains a
  later packaging decision.
- 2026-05-13 00:32: Completed HR/QA reference app packages with protocol
  handlers, package boundary docs, and standalone/mounted smoke coverage.

## Implementation Record

- Added `packages/aiworker-hr` with `hrReferenceSoulApp`, lifecycle/runtime/
  artifact/review/connector/ui handlers and HR package boundary documentation.
- Added `packages/aiworker-qa` with `qaReferenceSoulApp`, release-focused
  handlers and QA package boundary documentation.
- Added tests proving each app runs unchanged in SDK standalone mode and Host
  mounted test runtime mode.
- Extended SDK type exports so reference app authors can import protocol result,
  session context, capability and artifact validation types from the SDK.

## Verification

- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
