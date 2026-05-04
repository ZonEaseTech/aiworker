# FEAT-054 Soul modules and Scope Brain kernel

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-04 13:52
- **claimedAt**: 2026-05-04 14:05
- **completedAt**: 2026-05-04 19:00
- **plans**: PLAN-097, PLAN-098, PLAN-099, PLAN-100, PLAN-101, PLAN-102, PLAN-103

## 描述

把 Project Brain 从当前的 filesystem memories / skills / persona surface，演进为
worker-bound business scope 的通用 Brain Kernel + 独立 Soul Modules。

这里的目标不是做 developer 专用项目管理，也不是把 HR、finance、support 等
Soul 揉进同一个 preset registry。Brain Kernel 只负责 scope identity、artifact
registry、evidence、policy、audit、retention、admission 和 context compilation；
每个 Soul 独立维护自己的领域对象、workflow、proposal、brief compiler 和风险策略。

## ActiveForm

以 `FEAT-053` 的 business-scope 边界为前提，建立可持续迭代的 Scope Brain 架构：
先把 Soul 从 CLI init preset 升级成可被 CLI / core / API / web 共同消费的领域模块，
再补 scope manifest、artifact registry、admission MVP 和 task-specific brain brief。

## 依赖

- **blocked by**: FEAT-050, FEAT-053
- **blocks**: non-developer Soul workflows, durable Brain admission, task-specific Brain brief, future Worker Admin Brain review
- **relates to**: FEAT-039, FEAT-046, FEAT-051, TODO-008

## 验收标准

1. Soul 不再只是 CLI preset 聚合；每个内置 Soul 有独立模块归属，并能声明自己的 scope kind、artifact type、proposal type、policy 和 brief 行为。
2. `<project>/.aiworker/` 下存在或可生成 scope manifest，明确该 worker scope 的业务类型、主 Soul、artifact roots、privacy、retention 和 approval policy。
3. Brain Kernel 能登记 artifact 引用、hash、敏感级别、生命周期和 evidence，而不假设 artifact 是代码文件。
4. Brain proposal / admission MVP 落在 worker 数据面，generated durable brain change 进入 canonical filesystem 前保留 evidence、risk、confidence、rollback 和 approval 记录。
5. `brain brief` 能按 task + scope + soul 编译 task-specific context，并同时覆盖 developer 与 HR 示例，避免重新偏回 software project 语义。
6. Worker/Fleet surface 只聚合 brain health / pending admission / drift 摘要，不把 canonical brain 内容复制到 fleet.db。

## 阶段计划

1. `PLAN-097`：Soul module contract and registry ownership。
2. `PLAN-098`：Scope manifest and business-scope bootstrap。
3. `PLAN-099`：Artifact registry kernel。
4. `PLAN-100`：Soul-specific schema packs and validation samples。
5. `PLAN-101`：Brain admission MVP for scope assets。
6. `PLAN-102`：Brain brief compiler and projection boundary。
7. `PLAN-103`：Worker/Fleet Brain surface closeout。

## 笔记

- 2026-05-04 13:52：确认最新 PMA 槽位后创建本 Epic。`FEAT-053` / `PLAN-096` 已被 Project scope business-scope boundary 占用，因此本主线从 `FEAT-054` / `PLAN-097` 开始。
- 本 Epic 的前置准备是 `PLAN-097` + `PLAN-098`，避免后续 artifact / admission / brief compiler 继续依赖 CLI preset 形态。
- 本 Epic 的后置收口是 `PLAN-102` + `PLAN-103`，确保 Brain 最终能被 executor 消费，并被 Worker/Fleet surface 可见但不越界复制。
- 2026-05-04 19:00：Epic 收口完成，AC1..6 全部满足：
  1. Soul 已是 cross-package module（PLAN-097）：`packages/shared/src/soul/{module,registry,modules/<id>.ts}` 暴露 contract + 9 个内置 Soul + `BUILTIN_SOUL_MODULES` / `createBuiltinSoulRegistry`；CLI preset 是 projection 层；schemaPack 在 PLAN-100 填充。
  2. `<project>/.aiworker/scope.json`（PLAN-098）：zod schema + parser + builder 在 shared，fs-layout `ensureProjectAiworker` 在 init 写最小 skeleton；doctor / brain status 展示状态。
  3. Brain Kernel `brain_artifacts` 表 + `BrainArtifactRegistry`（PLAN-099）：登记 ref / hash / sensitivity / retention / status / evidenceRefs / metadata；不假设 artifact 是代码文件；developer + HR 双 fixture。
  4. Brain admission MVP（PLAN-101）：`brain_admission_proposals` + `brain_admission_decisions` 落 worker.db；`generated durable brain change → filesystem` 必须经 evidence + risk + confidence + rollback + approval 才能 apply；`apply` MVP 只对 `memory-add` 自动 materialize。
  5. `brain brief --task ...`（PLAN-102）：CLI 与 core compiler 都按 task / scope / Soul / artifactRefs / risk / executor / tokenBudget 编译；developer + HR 双 fixture；preview-only 不替换 orchestrator。
  6. Worker/Fleet surface（PLAN-103）：`WorkerInfo.brainSummary` 聚合 + Worker REST `/api/worker/brain/{summary,admission*,artifacts*}` + Worker Admin `/brain` 视图；fleet UI 仅持 pointer + audit + brain 深链，未在 fleet.db 加任何 brain / admission / artifact 行。
- 7 commits（cd5c589, b3e1c48, b56287b, 864e5f2, 862612b, 51b69af, [本提交]）跨 PLAN-097..103；shared 120 / fs-layout 20 / gateway-proto 19 / storage 19 / gateway 148 / core 554 / web 59 / api 83 / cli 159 = 1181 tests 全绿，typecheck 全 workspace 通过，lint 通过，build 通过，`git diff --check` 干净。
