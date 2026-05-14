# REFACTOR-068 Domain-specific Soul workbench architecture

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-12 10:26
- **claimedAt**: 2026-05-12 10:34
- **completedAt**: 2026-05-12 12:23
- **plan**: PLAN-275
- **relatesTo**: GOALS.md, docs/architecture.md, apps/web, apps/api, packages/shared, packages/component

## 背景

Worker Web 当前已经收敛到 local-first vertical Soul workspace：operator 选择
Soul worker，进入 workspace/session，产出 artifact，再 review 并沉淀 lesson。
这个基础方向是对的，但 Web 布局仍然偏通用：不同 Soul 共享相近的 worker /
workspace / session shell，只是能力模板和文案不同。

这不足以支撑 AIWorker 的长期产品判断。Open Design 的强点不是通用 chat，而是它为
设计生成建立了专业工作台：skill、system、template、project、artifact、批量结果和
critique 都围绕出图组织。AIWorker 的每个 Soul 也必须拥有自己的专业工作台，否则
HR、PM、QA、DevOps 只是同一聊天工具的 prompt preset。

## 目标

声明并实现 Soul 的差异性：架构从通用布局迭代到专业领域工作台，同时保留
worker / workspace / session / turn / artifact / review / lesson 的底层合同。

具体目标：

1. 建立 `Soul workbench` 概念：每个 Soul 可以声明自己的 workspace types、主视图、
   object vocabulary、artifact set、agent actions 和 review surfaces。
2. Worker 入口能根据 Soul 选择对应专业工作台，而不是只渲染一套通用 studio。
3. 代码架构允许逐步启用专业工作台；未启用的 Soul 继续使用当前通用实现。
4. 专业工作台仍必须走同一 local daemon、worker identity、session handoff、artifact
   index、review/lesson promotion 合同，不能重新引入旧 fleet/gateway 或治理首屏。
5. Agent engine 以领域对象旁的 task tray / artifact patch 介入，而不是把 chat 作为
   唯一主交互。

## 非目标

- 不一次性重做所有 Soul 的专业 UI。
- 不把 Soul workbench 设计成硬编码领域 workflow engine。
- 不绕过现有 external engine boundary；AIWorker 仍只做 prompt composition、context
  handoff、event/artifact indexing 和 review/memory。
- 不改变其他 Soul 当前可用路径，除非该 Soul 被明确纳入后续改造计划。
- 不把专业工作台退化成 marketing dashboard 或设置页。

## 验收标准

- 有清晰的 shared contract 描述 Soul workbench descriptor，包括至少：
  workspace types、primary objects、view regions、capability/action mapping、
  artifact kinds、review checklist 和 fallback behavior。
- Worker Web 入口能根据 Soul/workbench descriptor 路由到专业工作台或通用 fallback。
- 通用 fallback 继续支持现有 HR、PM、QA、DevOps 的 worker/workspace/session 主路径。
- API/storage 层不需要为每个 Soul 写专属分支；差异应主要来自 descriptor、templates、
  artifact kinds 和 Web component composition。
- 新架构明确保留 review-before-memory、source/provenance、human decision ownership
  和 secret/privacy boundary。
- 有聚焦测试覆盖 descriptor resolution、fallback behavior、worker route selection 和
  artifact/review 合同不变。

## 调查结论

- 当前 `GOALS.md` 已明确 AIWorker 的默认产品闭环是 `Soul worker -> workspace ->
  session -> artifact -> review -> durable org memory`。
- 当前 `docs/architecture.md` 已明确 Worker 是 Soul-bound runtime，外部 engine 从
  session 层接管，engine invocation 不是产品对象。
- Worker Web 近期已经完成 worker-first IA、Soul rail、worker identity、session route、
  shared layout 和视觉系统升级；这些是专业工作台可复用的底层壳。
- 当前风险在于：如果不建立 Soul-level workbench 差异性，后续 HR/PM/QA/DevOps 的
  价值会被压扁成模板列表 + chat/session。

## 备注

本任务是架构和产品面改造前置计划。首个实际落地切入点见
REFACTOR-069 / PLAN-276：HR Role Search Cockpit。

## 完成记录

- Added a shared Soul workbench descriptor contract and registry.
- Wired Worker Web route selection so HR can render a specialized workbench while
  PM, QA, DevOps, and future Souls keep the generic worker studio fallback.
- Preserved the existing local daemon, worker/workspace/session/artifact/review/
  lesson contract; no storage/API schema fork was introduced.
- Added descriptor and WorkerStudio regression tests covering HR specialization
  and non-HR fallback behavior.
