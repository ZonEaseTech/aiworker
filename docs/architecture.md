# AIWorker Architecture

> 状态：这是当前 greenfield vertical Soul 架构合同。默认本地基础设施是
> `1 host -> 1 local daemon -> N Soul workers`；远程 fleet/gateway 仍为后续可选聚合层，
> 不牵引本地产品首屏。

AIWorker 现在按一条垂直业务工作流组织：

```text
host
  -> local daemon
  -> Soul worker
  -> workspace/project
  -> session
  -> turn
  -> business files and artifacts
  -> human review
  -> durable org memory
```

Open Design 的参考价值在于它的项目意图：用清晰的 skill/system/template/project
结构，让用户快速开始并得到 artifact。AIWorker 不复制图片/视频领域和桌面壳，而是把
这套产品语言用于 HR、PM、QA、DevOps、finance、legal、ops 等 team/org Soul。

## 架构原则

- Vertical Soul first：默认入口先解释 Soul、domain system、capability template，
  不是 developer repo、admin dashboard 或 fleet。
- One daemon, many workers：一台 host 默认一个 local daemon；daemon 管理多个
  Soul-bound workers。worker 才是 Soul runtime，不是 host，也不是单个 project。
- External engine owned：外部 engine 负责 tool loop、approval UX、sandbox、
  profile、auth、native session、MCP/plugin/skill 生态；AIWorker 只做薄 adapter、
  prompt composition、事件归一化和证据记录。
- Session is the handoff：engine 从 workspace 下的 session 层开始接管；worker 和
  workspace 不代表 engine session，run 不进入产品心智。
- Business artifact visible：session 必须能持续产生、修改和索引可定位、可预览、可
  review 的业务产物。
- Domain evidence first：候选人、需求、缺陷、事故、发布、合同等 evidence 必须保留
  来源和边界。
- Review before memory：组织记忆只从人工 review/admission 后晋升，不从每次聊天自动
  泛化。
- Developer is supporting：developer Soul 可用于 review、release evidence、handoff、
  repo knowledge，不是默认产品中心。
- No compatibility surface：1.0 前不保留旧本地 worker API、CLI alias、DB 迁移读取或
  隐藏旧页面。

## Product Objects

| Object | Role |
| --- | --- |
| Host | 承载 AIWorker daemon 和外部 executor 的本机环境；不是产品对象 |
| Local daemon | host-local 控制面；负责 Web/API、DB、migration、engine inventory、settings、worker registry |
| Worker | 绑定一个 Soul 的业务 runtime；拥有 Soul identity、capabilities、memory namespace 和 review policy |
| Soul | 面向用户的垂直角色，如 HR、PM、QA、DevOps、finance、legal、ops；只通过 worker 实例化 |
| Soul pack | Soul 的文件化定义和运行时投影 |
| Domain system | worker 所属领域规范、rubric、policy、style、artifact expectation |
| Capability template | Soul worker 可执行的能力模板，如 candidate screen、PRD、release gate、incident review |
| Enabled capability | worker 从 Soul catalog 启用的 capability，可按 workspace type 推荐或限制 |
| Workspace / project | 某个 worker 下的一次业务作用域，例如候选人、需求、发布、事故、合同审查 |
| Session | workspace 内的持续工作线程，也是 engine native session 的绑定点和接管点 |
| Turn | session 内的一次用户输入、engine 回复、tool/event 更新或 artifact 修改 |
| Engine invocation | 内部审计对象；一次向 engine 发送消息、resume native session 或 provider request 的尝试 |
| Business artifact | 可定位的输出文件、报告、矩阵、brief、decision record、runbook |
| Review | 人对 artifact 的质量、风险和后续动作判断 |
| Durable org memory | 带 provenance 的可复用经验、rubric refinement、example 或 source-tagged fact |
| Host settings | daemon-level settings，例如 engine inventory、BYOK refs、connector inventory、MCP、UI preference |
| Worker settings | worker-level defaults，例如 default engine/profile、enabled capabilities、review/admission policy |

Web、README、GOALS 和 onboarding 应使用 Soul worker / capability template /
workspace / session / turn / artifact 语言；`work order`、`case` 和 `run` 不再是默认产品入口。

## Architecture Adherence

本文件记录的是 2026-05-10 讨论后确认的阶段架构合同。后续 PMA、代码实现、API、Web、
CLI 和文档默认严格遵循该合同。

只有当实现证据证明本合同已经无法落地，或真实产品体验明显不如预期时，才允许重新讨论
架构调整。调整前必须先提交新的 proposal，说明触发原因、证据、替代方案、影响面和迁移
成本；不能在实现中静默回退到 project-scope、case/run 产品对象、旧 worker runtime 或
文件自嗨模型。

## Open Design Concept Mapping

Open Design 的有效参考是信息架构，而不是对象层级的逐字复制。

| Open Design | AIWorker | Notes |
| --- | --- | --- |
| Local daemon | Local daemon | 都是本机特权进程和 Web/API host |
| Agent / Local CLI | Executor engine | AIWorker 只做薄 adapter，不拥有 engine 能力生态 |
| API / BYOK mode | BYOK execution mode | 都是绕过本地 CLI 的 provider path |
| Project | Workspace/project under one Soul worker | OD project 是主对象；AIWorker project 不是 worker |
| Skill | Capability template | AIWorker capability 必须归属 Soul worker |
| Design system | Domain system / rubric / policy | 只借“系统化约束”结构，不借视觉领域语义 |
| Conversation | Session | workspace 下的多轮上下文线程，也是 engine 接管点 |
| Chat turn | Turn | session 内的一次多轮交互或 artifact 更新 |
| Run / chat run | Engine invocation | 内部审计/失败恢复记录，不是用户主对象 |
| Artifact | Business artifact | AIWorker artifact 是业务输出，不是设计预览默认域 |
| File workspace | Workspace evidence/artifact files | 文件和 evidence 留在 workspace 或 connector 系统 |
| Templates | Workspace/template presets or capability seeds | 不能混同为 worker |
| Import Claude Design | No default mapping | AIWorker 默认不提供 import 入口 |
| Media providers | No default core mapping | 可借 Settings 交互，不成为核心产品面 |
| MCP server | Daemon MCP / connector surface | 集成面，不是 Soul/worker 本体 |

OD 没有 `worker` 层，因为它默认是单一 design generation 域。AIWorker 的 worker 层是
架构必需项：它隔离 Soul identity、domain system、capability catalog、review/admission
policy 和 durable memory namespace。

## Object Invariants

### Host

Host 是承载环境。它可以是 operator laptop、workstation、VM 或 server。Host 提供：

- 外部 executor CLI / runtime；
- user-level auth、profile、MCP、skill、plugin 和 native session；
- 本地文件系统、网络和 OS process model。

Host 不保存业务语义，也不等同于 worker。一个 host 默认启动一个 AIWorker local daemon。

### Local Daemon

Local daemon 是 host 上唯一的 AIWorker 本地控制面。它负责：

- 端口、token、本地 auth 和 Web 静态资源；
- `worker.db` 打开、migration 和数据访问；
- host-level Settings：Local CLI/BYOK、engine scan/test、connectors、MCP、language、
  appearance、autosave；
- worker registry：创建、列出、选择、启动、暂停和删除 Soul workers；
- 将 Web/CLI 请求路由到具体 worker；
- 记录 session events、engine invocation 审计、artifact index、review 和 memory
  proposal 的公共服务。

Daemon 不代表 HR、PM、QA 或 DevOps 中任意一个 Soul。

### Worker

Worker 是 Soul-bound runtime。一个 worker 只能绑定一个 Soul；一个 daemon 可以管理多个
worker。Worker 拥有：

- `workerId`、`soulId`、display name、status；
- Soul pack、domain system、capability catalog 和 enabled capabilities；
- worker-level default engine/profile/overlay hint；
- review/admission policy；
- durable memory namespace；
- worker-scoped workspaces/projects、sessions、artifacts、reviews 和内部 invocation
  audit。

选择 Soul 的产品动作，应落为“进入或创建该 Soul worker”。长期模型中，project 不再以
`selectedSoulId` 作为隔离字段。

### Workspace / Project

Workspace/project 是 worker 下的业务作用域，不等同于 software project。

Examples:

- HR worker：role、candidate、candidate pool、resume batch；
- PM worker：product line、requirement pool、roadmap slice；
- QA worker：release、test suite、defect queue；
- DevOps worker：service、environment、incident、runbook。

Workspace 默认继承 worker 的 enabled capabilities，但可以用 `workspaceType` 推荐、隐藏
或限制 capability。

### Session

Session 是 workspace 内的持续工作线程，也是 engine 从 AIWorker 接管的层级。它应尽量
对齐 Claude Code、Codex、Cursor 等外部 engine 的 native session / thread / conversation
概念。

Session 承载：

- operator input history；
- connector evidence selected for that thread；
- active capability 或 intent router 的 capability suggestion；
- external engine native session/thread binding；
- workspace cwd；
- artifact index；
- event stream；
- review and memory proposal links。

创建或继续 session 时，daemon 准备 cwd、context、capability projection 和 engine-native
binding；进入 session 后，多轮 turn 由 engine 逐步推进并产出或修改 artifact。AIWorker
观察、记录、索引和审查，不把 session 外层再包装成用户需要维护的 run。

### Turn

Turn 是 session 内的一次多轮交互单位。它可以包含：

- operator message；
- daemon 注入的上下文摘要或 selected evidence；
- engine assistant output；
- tool/event stream；
- artifact create/update/delete signal；
- review request 或 memory proposal request。

用户心智里是“在 session 里继续沟通”，不是“创建 run”。Turn metadata 必须能追溯
`workerId`、`workspaceId`、`sessionId`、active capability / workflow version 和 source
evidence。

### Engine Invocation

Engine invocation 是内部审计对象，不是产品对象。它记录一次技术调用尝试：

- `workerId`；
- `workspaceId` / `projectId`；
- `sessionId`；
- `turnId`；
- `capabilityTemplateId` 或 `workflowTemplateId` snapshot；
- executor / execution mode；
- prompt/context snapshot pointer；
- source evidence pointers；
- status、events、artifact pointers 和 error。

如果没有可用 engine，AIWorker 可以创建 worker/workspace/session，但不应伪造 successful
assistant turn。UI 应显示清晰的 engine configuration state，或在 session 中阻止发送给
engine。

### Capability Template

Capability 属于 Soul worker，而不是散落在 JSX 或 project metadata 中。

Rules:

- Soul 声明 capability catalog；
- worker 从 Soul catalog 拥有 enabled capabilities；
- workspace 默认继承 worker capabilities；
- session 可以显式选择 capability，也可以由 intent router 推荐；
- turn 和 engine invocation 必须绑定当时实际使用的 capability 或 workflow；
- artifact/review/memory proposal 必须可追溯到 capability version。

Multi-capability tasks should be modeled as explicit workflow templates, not as
an implicit all-in-one Soul prompt.

## Runtime Components

### CLI

`apps/cli` 是本地 Soul workspace 自动化入口。

目标命令面应围绕 daemon、worker、workspace、session、turn 和 artifact 收敛：

```text
aiworker init
aiworker dev
aiworker open
aiworker soul list
aiworker template list
aiworker worker create|list|show|select
aiworker workspace create|list|show
aiworker session create|list|show|message|events|cancel
aiworker invocation list|show
aiworker files list|show|write|delete|search
aiworker artifacts list|show|open
aiworker review list|show|create
aiworker lessons list|propose|accept|reject
aiworker settings list
aiworker executor select|doctor
aiworker daemon start|foreground|status|stop|logs|check
```

`aiworker dev` 是目标 source-checkout 调试入口：一个命令启动 daemon、Web dev server、
proxy 和日志聚合。`aiworker daemon foreground` 是 packaged/runtime daemon 入口，目标上
应能同源托管 Worker Web。两步 API + Web 启动只能是过渡期内部命令，不是产品路径。

### Local Daemon

`apps/api` 是 local daemon。

目标 HTTP surface 应围绕 local daemon registry + Soul workers：

```text
GET    /api/local/info
GET    /api/local/host/settings
PATCH  /api/local/host/settings
POST   /api/local/host/engines/rescan
POST   /api/local/host/engines/test
GET    /api/local/souls
GET    /api/local/souls/:id
GET    /api/local/workers
POST   /api/local/workers
GET    /api/local/workers/:workerId
PATCH  /api/local/workers/:workerId
GET    /api/local/workers/:workerId/templates
GET    /api/local/workers/:workerId/templates/:templateId
GET    /api/local/workers/:workerId/settings
PATCH  /api/local/workers/:workerId/settings
GET    /api/local/workers/:workerId/workspaces
POST   /api/local/workers/:workerId/workspaces
GET    /api/local/workers/:workerId/workspaces/:workspaceId
PATCH  /api/local/workers/:workerId/workspaces/:workspaceId
GET    /api/local/workers/:workerId/workspaces/:workspaceId/sessions
POST   /api/local/workers/:workerId/workspaces/:workspaceId/sessions
GET    /api/local/workers/:workerId/sessions/:sessionId
PATCH  /api/local/workers/:workerId/sessions/:sessionId
POST   /api/local/workers/:workerId/sessions/:sessionId/messages
POST   /api/local/workers/:workerId/sessions/:sessionId/cancel
GET    /api/local/workers/:workerId/sessions/:sessionId/events
GET    /api/local/workers/:workerId/sessions/:sessionId/artifacts
GET    /api/local/workers/:workerId/sessions/:sessionId/invocations
GET    /api/local/workers/:workerId/invocations/:invocationId
GET    /api/local/workers/:workerId/files
GET    /api/local/workers/:workerId/files/raw/*
PUT    /api/local/workers/:workerId/files/raw/*
DELETE /api/local/workers/:workerId/files/raw/*
GET    /api/local/workers/:workerId/artifacts
GET    /api/local/workers/:workerId/artifacts/:artifactId
GET    /api/local/workers/:workerId/reviews
POST   /api/local/workers/:workerId/reviews
GET    /api/local/workers/:workerId/lessons
POST   /api/local/workers/:workerId/lessons
PATCH  /api/local/workers/:workerId/lessons/:lessonId
GET    /api/local/events
```

daemon 负责：

- 解析 host-local daemon home、worker registry 与 `worker.db`；
- 加载内置 vertical Souls、capability templates 和后续 Soul pack/domain system；
- 提供 CLI/Web 共用 API；
- 用 worker/workspace/session/template 创建或恢复 engine-native session binding；
- 在 workspace/session cwd 下把 turn 消息交给外部 engine adapter；
- 写入 session event 和 engine invocation 审计；
- 将成功输出写成 workspace 文件；
- 登记 artifact metadata；
- 创建 review 和 memory proposal；
- 托管 Worker Web 静态资源。

### Core Runtime

`packages/core/src/worker` 是 local Soul session runtime。

核心类型和服务应围绕这些对象：

- worker
- soul
- domain system
- capability template
- workspace
- session
- turn
- project
- session event
- engine invocation
- file
- artifact
- review
- memory proposal
- host setting
- worker setting

Runtime 只处理 worker-scoped workspace/session intake、prompt composition、engine
session binding、turn dispatch、event stream、assistant-output 文件落盘、artifact
index、review、memory proposal 和内部 invocation 审计。旧的通道、定时、审批、演化、
远程 gateway client、可见 Brain 管理面不再属于默认本地 runtime。

### Storage

`packages/storage-sqlite` 应为 local daemon + Soul workers 创建 greenfield 表。目标模型：

```text
host_settings
workers
worker_settings
workspaces
sessions
projects
turns
session_events
engine_invocations
files
artifacts
reviews
lessons
```

当前 HR/PM/QA/DevOps Soul 与 capability templates 由 `packages/shared` 内置目录提供，
不是 SQLite 表；worker/workspace/session/turn/invocation/artifact/review/settings 是本地 DB 的
落地面。

Expected ownership:

- `workers.soul_id` 是 Soul 隔离边界；
- workspace/project rows carry `worker_id`；
- session rows carry `worker_id` and `workspace_id`;
- turn rows carry `worker_id`, `workspace_id`, `session_id`, and active
  `capability_template_id`;
- engine invocation rows carry `worker_id`, `workspace_id`, `session_id`,
  `turn_id`, executor, prompt snapshot pointer, status and error;
- artifact/review/lesson rows are traceable to worker through direct
  `worker_id` or the session/turn chain;
- host settings store engine inventory, BYOK refs, connector inventory, MCP,
  language, appearance and autosave;
- worker settings store enabled capabilities, default engine/profile overlay,
  review/admission defaults and Soul-specific preferences.

业务内容不被塞进数据库。HR 简历、PM 文档、QA 缺陷证据、DevOps runbook、artifact
文件应留在 workspace 或连接器系统中；SQLite 记录指针、状态、索引、provenance、
review verdict 和 memory admission 状态。

### File Contract

文件只允许服务四类消费者：

1. daemon 读取，用来生成 UI catalog、prompt、context 和投影；
2. engine 在 session cwd 内读取或写入；
3. AIWorker 用来审计、回放、索引和失败恢复；
4. 人类查看、导出或 review。

不服务这四类消费者之一的文件，不创建。Engine 不原生认识、daemon 也不显式注入的文件，
不能成为运行时合同。

目标落盘结构：

```text
~/.aiworker/
  aiworker.db
  vault/
  logs/
  cache/
  packs/
    souls/
      hr/
        soul.yaml
        domain.md
        capabilities/
          candidate-screen/
            SKILL.md
            references/
            assets/
        review.md
        examples/
  workers/
    <workerId>/
      workspaces/
        <workspaceId>/
          evidence/
          artifacts/
          .aiworker/
            sessions/
              <sessionId>/
                context/
                  active-context.md
                  capability/
                    SKILL.md
                    references/
                    assets/
                invocations/
                  0001/
                    prompt.md
                    events.ndjson
                    stderr.log
```

File ownership:

- `aiworker.db` 是 daemon 的 registry/settings/session state 主存；engine 不读取。
- `vault/` 存 secret refs 对应的加密材料；明文 secret 不进入 workspace 文件。
- `logs/` 和 `cache/` 服务 daemon/operator，可删除或重建。
- Soul pack 下的 `soul.yaml`、`domain.md`、capability `SKILL.md`、`references/`、
  `assets/`、`review.md` 服务 daemon；只有 active capability 的必要 side files 会在
  session 创建或切换 capability 时 staging 到 session cwd。
- Worker 本身不初始化 `WORKER.md` 或 `worker.json`。Worker identity、soulId、enabled
  capabilities、default engine 和 memory namespace 存 DB。
- Workspace/project 是 engine 可工作的 cwd 根；`evidence/` 放用户上传或 connector
  materialize 出来的材料，`artifacts/` 放 engine 产出的业务文件，`.aiworker/` 是
  daemon 私有控制目录。
- Workspace 不初始化 `WORKSPACE.md`。workspace name/type/status/source pointers 存 DB。
- Session 的 `active-context.md` 是 daemon 组合出的 Soul/domain/capability/workspace
  context 快照，主要服务审计；只有当 prompt 明确引用时，engine 才读取它。
- Session 的 `context/capability/` 是 active capability side files staging 区，作用类似
  OD 的 `.od-skills`，但按 session 隔离。
- `invocations/<n>/prompt.md`、`events.ndjson`、`stderr.log` 只服务 debug、replay 和
  audit，不是业务产物，也不是用户需要创建或选择的对象。
- Review 和 memory 默认进 DB；需要给人类审阅或迁移时再导出为文件。Accepted memory
  由 daemon 在后续 session 中按需检索并注入，不让 engine 自动读取全量 memory。

以下旧初始化产物不再作为默认合同：

```text
WORKER.md
WORKSPACE.md
SESSION.md
project-scope .aiworker scattered dirs
toolsets.json
capability-packs.json
mcp.json as workspace truth
case/run as product object
template runner local engine
```

### Worker Web

`apps/web/src/worker` 是 local Soul workspace app。

首屏目标：

- 左侧：Soul worker catalog、worker status、domain system、enabled capability templates；
- 中央：workspace list / selected workspace / sessions / active turn / artifact preview；
- 右侧：review、memory candidate、connector evidence、artifact metadata；
- settings：Local CLI / BYOK、engine scan/test、connector、MCP、language、
  appearance、autosave 配置。

Worker Web 不再是 admin dashboard，也不是 Open Design 的桌面复制。它的第一任务是回答：
这个 team/org 要进入哪个 Soul worker，在哪个 workspace/session 中基于哪个 capability
template 产出什么业务 artifact，是否值得沉淀为组织记忆。

## Executor Boundary

AIWorker 不拥有外部 executor 的有效能力集。

AIWorker 可以保存本地 executor hint，例如 engine 名称、endpoint、secret ref。它不能把
这些 hint 伪装成安全隔离边界，也不能把 executor 原生 MCP、plugin、skill、approval、
sandbox、profile 迁移进 AIWorker 的产品模型。

Engine 从 session 层开始接管。创建或继续 session 时，AIWorker 设置 workspace cwd、
组合 worker Soul prompt stack、domain system、capability template、workspace/session
context 和 connector evidence，并绑定 engine native session / thread。每个 turn 只是把
新的用户输入和必要 context 交给 engine；更复杂的工具循环、approval、sandbox、MCP、
plugin、skill 和 native session state 留在 executor runtime 内。

## Review And Memory

Review 是 artifact 之后的操作。

review 可以记录：

- artifact 是否 accepted；
- 需要 follow-up 的问题；
- turn / invocation 失败或证据不足；
- 可沉淀的 memory candidate。

memory proposal 必须带 provenance，指向 worker、workspace、session、turn、review、
artifact、source evidence、engine invocation 或 operator 显式输入。accepted memory 进入该 Soul worker 的
durable context；rejected memory 保留 rejection reason。

## Local Debug Contract

本地调试不应把“两步启动 API + Web”变成产品心智。

Target contract:

- Source checkout: `aiworker dev` starts the local daemon, Worker Web dev server,
  API proxy, log forwarding and health checks under one lifecycle.
- Packaged runtime: `aiworker daemon foreground` or `aiworker daemon start`
  serves the Worker Web from the same daemon origin.
- Web URL should be one local URL, with daemon API and Web under the same
  operator-facing lifecycle.
- Separate `bun run --filter '@zonease/aiworker-api' dev` and
  `bun run --filter '@zonease/aiworker-web' dev` commands may remain internal
  contributor escape hatches while the refactor is pending, but README and
  onboarding should not present them as the intended operator path.

## Deferred Control Plane

远程 worker 聚合、fleet presence、gateway routing、enrollment、remote audit 是后续阶段。
本轮 local Soul deliverable 不依赖这些路径，也不通过它们解释产品价值。

未来如果恢复聚合层，它只能聚合已经可用的 local Soul workspace state，不能重新把 local
worker 拉回管理后台模型。

## Repository Map

| Area | Current role |
| --- | --- |
| `apps/cli` | Local daemon, worker, workspace, session, turn and artifact CLI |
| `apps/api` | Local daemon API, worker registry and Web host |
| `apps/web/src/worker` | Soul worker workspace app |
| `packages/core/src/worker` | Soul worker session runtime and executor adapters |
| `packages/storage-sqlite/src/worker` | `worker.db` schema and accessors for daemon + workers |
| `packages/shared/src/local-workspace.ts` | Shared local daemon/worker/workspace DTOs |
| `packages/shared/src/worker-pack.ts` | Current pack registry to evolve into Soul pack registry |
| `packages/fs-layout` | Host daemon, worker and workspace path helpers |

## Acceptance Contract

本架构完成的判定不是“旧概念换名”，而是：

- 一个 host 上一个 local daemon 能管理多个 Soul workers；
- 新开本地 Web 后可以从 CLI/Web 选择或创建 HR/PM/QA/DevOps 等 Soul worker；
- first screen 能直接选择 Soul worker、workspace 和 capability template；
- daemon 能把 worker/workspace/session/template context 组合成 engine session/turn；
- engine 接管点明确在 workspace 下的 session，不在 worker、workspace 或 run；
- artifact 能被定位、预览、review；
- accepted memory 能带 provenance 写回对应 Soul worker/domain context；
- developer Soul 不再牵引默认产品面；
- OpenAPI 只暴露 local Soul workspace 所需 API；
- 默认本地 DB 只包含 greenfield vertical Soul 表；
- workspace runtime 没有旧本地 worker subsystem import；
- operator-facing debug/startup 有一个本地 URL 和一个 daemon lifecycle，不要求用户理解
  API/Web 双进程；
- README、GOALS、PLAN、task 与实际命令一致；
- source-local smoke、浏览器检查、focused gates、root gates 都有证据。
