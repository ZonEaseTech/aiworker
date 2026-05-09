# AIWorker Architecture

> 状态：这是当前 local worker 架构。默认 CLI/Web/daemon surface 已收敛到
> work order -> run -> artifact -> review -> lesson；fleet/gateway 仍是后续可选层。

AIWorker 的目标主路径是一条本地 worker loop：

```text
workspace + worker pack
  -> local daemon
  -> work order
  -> external executor in the workspace cwd
  -> streamed run events
  -> files and artifacts
  -> review
  -> reusable lesson
```

这借鉴的是 Open Design 的产品拓扑，而不是它的图片/视频领域。Open Design 用 skills
和 design systems 产出视觉 artifact；AIWorker 用 worker skills 和 domain systems
产出 developer、HR、PM、QA、finance、legal 等业务 artifact。

## 架构原则

- Local worker first。daemon 和 web workbench 是默认产品面。
- Files first。业务 artifact 以 workspace 文件为准，SQLite 只存 metadata、关系和
  run state。
- Worker packs are composable。领域行为放在 `SKILL.md`、domain-system files、
  templates、examples 里，不放进 orchestrator 分支。
- External executors own execution。AIWorker 通过薄 adapter 调用和观察它们。
- Review and lesson promotion after run。复盘和经验晋升发生在 run 后，不是每个有用动作
  前的强制门。
- Fleet/gateway deferred。它们是后续可选层，不牵引当前 local worker API。

## 目标组件

### CLI

`apps/cli` 是 operator 入口。

目标职责：

- 初始化 local worker state；
- 列出和检查 worker packs；
- 管理 local daemon 的 start/stop/status/logs/open；
- 提交 work orders；
- 检查 runs、artifacts、reviews、lessons；
- 执行 readiness checks。

CLI 的 `init` 结束后必须告诉用户下一步做什么。first-time operator 不应该先学习 fleet、
gateway、enrollment 或 Brain governance 术语。

### Local Daemon

`apps/api` 收敛为 local worker daemon surface。

目标职责：

- 提供 CLI 和 web 共享的 HTTP/SSE API；
- 托管 worker web bundle；
- create/cancel/resume/inspect runs；
- 从 worker pack、domain system、workspace state、conversation history 和 work-order
  input 组合 prompt stack；
- 在正确的 workspace cwd 下调用外部 executor；
- 捕获成功 run 的最终输出 artifact；
- 索引 run 中写入或变更的 files/artifacts metadata；
- 将本地 metadata 写入 `worker.db`；
- 暴露 review 与 lesson-promotion API。

daemon 是本地 privileged process。它可以按本地配置读取 workspace 文件、写入 AIWorker
metadata，并启动 executor adapter。

### Web Workbench

`apps/web` 是主要 worker workbench。

目标首屏：

- 当前 workspace 与 worker pack；
- work-order composer；
- run timeline 与 live events；
- conversation/messages；
- files/artifacts panel；
- review state 与 lesson candidates；
- secondary admin/config areas。

Worker Web 不应默认呈现 Brain governance dashboard。Brain 细节仍可检查，但主问题应是：
“当前跑了什么、产出了什么、哪些内容应该复用？”

### Core Runtime

`packages/core` 提供 transport-agnostic worker services。

目标服务：

- `WorkerRunService`：create/list/show/cancel runs，并发布 events；
- `WorkerPackService`：discover、parse、validate、compose worker packs；
- `WorkspaceService`：解析 workspace root 与 AIWorker local state；
- `ArtifactService`：索引 files 与 generated deliverables；
- `ReviewService`：记录 run review、acceptance、follow-up、lesson candidate；
- `LessonService`：把 reviewed lessons 晋升为 durable local context；
- executor adapters：外部 runtimes 的薄集成点。

旧 orchestrator logic 应被拆解到这些服务里。Journal、Gate、Admission、Brain Engine
等概念只能在支持 post-run review 和 durable lesson promotion 时作为内部机制复用。

### Storage

`packages/storage-sqlite` 负责 `worker.db`。

目标表面：

- workspaces；
- worker packs 与 selected domain systems；
- conversations 与 messages；
- runs 与 run events；
- artifact index entries；
- reviews 与 lesson candidates；
- durable lessons，带 source/provenance metadata；
- daemon/executor config，secret 只能存 ref。

业务 artifact 留在 workspace filesystem。当前成功 run 会把最终 assistant 输出写入
workspace-relative `.aiworker/local/artifacts/runs/<runId>/response.md`，并在
`worker.db` 中登记 `assistant-output` metadata。数据库只保存指针、metadata、小型
review/lesson 对象，不成为隐藏的业务内容仓库。

### Worker Packs

Worker pack 是领域扩展机制。

建议布局：

```text
.aiworker/
  packs/
    developer/
      SKILL.md
      SYSTEM.md
      templates/
      examples/
      review.md
    hr-recruiting/
      SKILL.md
      SYSTEM.md
      templates/
      examples/
      review.md
  lessons/
  runs/
  artifacts/
```

具体 layout 可以在实现中调整，但不变量是：领域知识以文件承载，加载 pack 不需要新增
orchestrator 分支。

## Run Model

重构应收敛到 CLI、HTTP、web 共享的一套 run protocol。

目标 API 形态：

```text
POST   /api/worker/runs
GET    /api/worker/runs
GET    /api/worker/runs/:id
GET    /api/worker/runs/:id/events
POST   /api/worker/runs/:id/cancel
GET    /api/worker/artifacts?runId=:id
GET    /api/worker/reviews/:id
POST   /api/worker/reviews/:id/rerun
POST   /api/worker/reviews/:id/lessons/promote
```

当前 run event stream 转发 runtime bus 事件；CLI 以 `orchestrator.finished` /
`orchestrator.error` 作为终态：

```text
channel.inbound
conversation.created
conversation.message
orchestrator.intent_decision
orchestrator.capability_decision
orchestrator.text
orchestrator.quality_gate
orchestrator.finished
orchestrator.error
```

Event model 应 append-only，并支持 daemon 存活期间 replay。需要历史可见的 durable events
写入 `worker.db`。

## Prompt Composition

Prompt composition 替代硬编码领域逻辑。

输入：

- worker identity 与 selected pack；
- domain system text；
- work-order template；
- operator message；
- selected workspace files 或 summaries；
- recent conversation context；
- relevant durable lessons；
- executor/runtime constraints。

输出：

- 发给外部 executor 的 composed work order；
- 描述 pack、system、template、lessons 使用情况的 structured metadata；
- 供 review 使用的 redacted provenance。

Composer 可以守 secret redaction、source tagging 等治理不变量，但不通过硬编码分支裁决领域
语义。

## Review And Lessons

Review 是 run 后的产品面。

Review state 可以记录：

- accepted artifact；
- needs follow-up；
- failed 或 inconclusive run；
- lesson candidate；
- promoted durable lesson；
- rejected lesson with reason。

Lesson promotion 必须有 provenance。lesson 要指回 run、artifact、message 或 operator
显式输入。这保留了旧 Brain admission 中有价值的部分，但不让它成为 first-time operator
第一眼看到的概念。

## Fleet And Gateway

`apps/gateway`、gateway protocol packages、fleet database schema、enrollment、
remote worker control 在 `REFACTOR-026` 中退出默认路径。

它们可以暂时留在仓库里，但新的 local worker surface 不依赖它们。未来 fleet 可以在本地
worker loop 被证明后，聚合已验证的 local worker state。

## 仓库映射

| Area | Target role |
| --- | --- |
| `apps/cli` | Local worker CLI and daemon lifecycle |
| `apps/api` | Local daemon HTTP/SSE API and web static host |
| `apps/web/src/worker` | Worker workbench |
| `apps/web/src/fleet` | Deferred/secondary fleet UI |
| `packages/core/src/worker` | Run、pack、workspace、artifact、review、lesson、executor services |
| `packages/storage-sqlite` | Local worker metadata schema and migrations |
| `packages/fs-layout` | Workspace and `.aiworker/` layout resolution |
| `packages/shared` | Shared schemas and event types |
| `apps/gateway` | Deferred fleet/gateway control plane |

## 迁移计划

`REFACTOR-026` 在 1.0 前允许破坏性收敛：

1. 重置产品文档与目标架构；
2. 引入统一 run service 和 API；
3. 重塑 worker metadata 与 artifact index；
4. 增加 worker pack parsing 和内置 packs；
5. 简化 CLI daemon lifecycle 与 root help；
6. 重建 Worker Web 首屏；
7. 将旧 Brain/Gate/Admission 概念移入 review 与 lesson promotion；
8. 删除或隐藏与新 local loop 冲突的旧默认 routes、docs、command paths。

不需要为了未发布的旧 CLI/API/config 形态保留 compatibility shim。优先清晰语义和可验证的
本地行为。

## 验证标准

每个 slice 都必须有聚焦验证。

最终最少证据：

- 变更服务的 focused unit/API tests；
- CLI 变更要有 help/bundle smoke；
- UI 变更要有 worker web build 和 browser smoke；
- 一个 source-local worker smoke：init、启动 daemon、创建 run、stream 终态事件、
  捕获 artifact、读取 review、晋升 lesson proposal；
- 大型过渡 slice 至少跑 `bun run check` 或说明更窄 gate 的理由。

文档-only slice 可以只跑 `git diff --check`，但最终回复必须说明 code-review-graph 因未修改
代码而跳过。
