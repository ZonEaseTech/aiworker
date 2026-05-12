# PLAN-275 Domain-specific Soul workbench architecture

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 10:26
- **approvedAt**: 2026-05-12 10:34
- **completedAt**: 2026-05-12 12:23
- **relatedTask**: REFACTOR-068

## Current State

AIWorker 当前已经拥有正确的基础合同：

- `host -> local daemon -> Soul worker -> workspace -> session -> turn ->
  artifact -> review -> lesson`；
- Worker 是 Soul-bound runtime；
- external engine 从 session 层接管；
- artifact/review/lesson 是业务闭环，而不是 engine run 的技术展示；
- Web 已经有 worker-first IA、Soul rail、worker identity、workspace/session routes、
  shared layout 和设计系统升级。

但当前 Web 体验仍偏通用。不同 Soul 主要通过模板、文案和 artifact kind 区分，缺少
Open Design 式“领域工作台”差异。继续沿用一套通用 layout，会让 HR、PM、QA、DevOps
都变成同一个 chat/session 产品的轻微变体。

## Decision

引入 `Soul workbench` 作为产品和代码架构概念：

```text
Soul worker
  -> workbench descriptor
  -> workspace type
  -> domain-specific view composition
  -> capability/action mapping
  -> artifact patch/review/lesson flow
```

Workbench descriptor 描述专业差异；底层 worker/session/artifact/review/storage 合同不变。
未声明或未启用专业 workbench 的 Soul 使用现有通用 fallback。

## Proposal

### 1. 定义 Workbench Descriptor

在 shared 层建立可序列化 descriptor，字段至少包括：

- `soulId` / `workbenchId` / `version`；
- `workspaceTypes`：如 HR 的 role-search、candidate、hiring-pool；
- `primaryObjects`：领域对象，如 candidate、role、interview、release、incident；
- `views`：每个 workspace type 的主视图区域；
- `actions`：可由 Agent task tray 触发的领域动作；
- `artifactKinds`：该 workbench 的业务产物；
- `reviewRubrics`：artifact review checklist；
- `fallback`：descriptor 不完整或功能未启用时的通用 studio 回退策略。

### 2. 调整 Worker 入口

Worker route 不再固定渲染一个通用 studio，而是：

1. resolve worker identity；
2. resolve Soul；
3. resolve workbench descriptor；
4. 如果 workbench enabled，渲染对应 specialized workbench；
5. 否则渲染当前 generic worker studio。

这个选择逻辑必须只依赖 worker/Soul/capability metadata，不依赖 URL hack 或临时
hardcoded route。

### 3. 抽象 Shared Workbench Components

提取专业工作台可复用结构：

- domain rail / object rail；
- object dossier；
- evidence matrix；
- agent task tray；
- artifact patch preview；
- review and memory candidate panel；
- fallback empty/loading/error states。

这些组件提供布局和交互骨架，领域内容由 descriptor 与 Soul-specific adapter 注入。

### 4. 保持底层合同稳定

专业工作台不能创建新的并行 runtime。所有动作仍落到：

- existing worker/workspace/session/turn APIs；
- engine invocation audit；
- file/artifact index；
- review creation；
- lesson proposal / promotion。

领域差异只改变用户操作面、prompt/context 组合、artifact shape 和 review checklist。

### 5. 建立渐进启用策略

首个启用对象是 HR。PM、QA、DevOps 保留当前通用 worker studio，并作为 fallback
regression baseline。未来每个 Soul 独立申请专业 workbench，不把本次 HR 改造扩散为
全量重写。

## Scope

In scope:

- Workbench descriptor contract and registry.
- Worker route descriptor resolution and generic fallback.
- Shared domain-workbench component primitives.
- Minimal tests for descriptor resolution and fallback routing.
- Documentation updates for Soul-specific workbench architecture.

Out of scope:

- Full HR cockpit implementation; tracked separately in PLAN-276.
- PM/QA/DevOps specialized layouts.
- ATS/HRIS or other real connector integration.
- Changing storage schema before HR proves required fields.
- Reintroducing fleet/gateway/default admin surfaces.

## Risks

- **Over-abstracting too early**：descriptor 如果设计成万能 schema，会拖慢 HR 落地。
  Mitigation: 只抽取 HR 首个 cockpit 明确需要、其他 Soul fallback 也能复用的字段。
- **Breaking generic Soul path**：入口改动可能影响 PM/QA/DevOps。
  Mitigation: fallback behavior 作为验收标准和测试基线。
- **Domain workflow engine creep**：workbench descriptor 可能被误用成硬编码流程引擎。
  Mitigation: descriptor 只描述 UI composition、actions、artifact/review contracts；
  actual reasoning 仍由 external engine 和 prompt/context 完成。
- **Artifact contract drift**：专业 UI 可能绕过 artifact/review/lesson 闭环。
  Mitigation: 所有 Agent task tray 输出必须落为 artifact patch/proposal，并通过现有
  review/lesson route。

## Verification Plan

- Focused shared tests for descriptor parsing/registry/fallback.
- Focused Web tests for worker route selecting specialized vs generic workbench.
- Existing Worker Studio tests for PM/QA/DevOps fallback behavior.
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-shared' test`
- `git diff --check`
- Browser smoke covering one specialized HR route and one generic fallback Soul route.
- code-review-graph review after code changes.

## Approval Gate

Approved by operator on 2026-05-12 through the direct development handoff request:
complete the Soul-specific workbench architecture and HR first implementation,
with Playwright/browser validation focused on layout quality, interaction
consistency, and fluency rather than element presence only.

## Progress

- 2026-05-12 10:26: Drafted after HR Soul workbench design discussion. No code
  changes yet.
- 2026-05-12 10:34: Approved and claimed for implementation.
- 2026-05-12 12:23: Completed shared workbench descriptor, HR route selection,
  and generic fallback preservation. Verification passed with shared/web focused
  tests, web lint/build/typecheck, full repo typecheck, Playwright UX review, and
  code-review-graph review (risk 0.50; WorkerStudio heuristic gaps covered by
  focused WorkerStudio tests).
