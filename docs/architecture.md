# AIWorker Architecture

> 状态：这是当前 greenfield vertical Soul 架构。默认产品面是单个 team/org
> Soul workspace；远程聚合控制面被放到后续阶段，不牵引本轮 CLI、daemon、API、Web。

AIWorker 现在按一条垂直业务工作流组织：

```text
Soul + domain system + capability template
  -> case
  -> engine run
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
- External engine owned：外部 engine 负责 tool loop、approval UX、sandbox、
  profile、auth、native session、MCP/plugin/skill 生态；AIWorker 只做薄 adapter、
  prompt composition、事件归一化和证据记录。
- Business artifact visible：成功 run 必须产生可定位、可预览、可 review 的业务产物。
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
| Soul | 面向用户的垂直角色，如 HR、PM、QA、DevOps、finance、legal、ops |
| Soul pack | Soul 的文件化定义和运行时投影 |
| Domain system | 领域规范、rubric、policy、style、artifact expectation |
| Capability template | 可启动的模板，如 candidate screen、PRD、release gate、incident review |
| Case | 一次业务工作上下文，例如候选人、需求、发布、事故、合同审查 |
| Engine run | 外部 executor 对一个 case/template 的执行尝试 |
| Business artifact | 可定位的输出文件、报告、矩阵、brief、decision record、runbook |
| Review | 人对 artifact 的质量、风险和后续动作判断 |
| Durable org memory | 带 provenance 的可复用经验、rubric refinement、example 或 source-tagged fact |

Web、README、GOALS 和 onboarding 应使用 Soul / template / case / artifact 语言；
`work order` 不再是默认产品入口。

## Runtime Components

### CLI

`apps/cli` 是本地 Soul workspace 自动化入口。

目标命令面应围绕 Soul 和 case 收敛：

```text
aiworker init
aiworker soul list
aiworker template list
aiworker case create|list|show
aiworker run start|list|show|cancel
aiworker files list|show|write|delete|search
aiworker artifacts list|show|open
aiworker review list|show|create
aiworker lessons list|propose|accept|reject
aiworker settings list
aiworker executor select|doctor
aiworker daemon start|foreground|status|stop|logs|check
aiworker open
```

当前 CLI 已使用 `case` 作为业务入口；`lessons` 是 memory candidate 的最小命令面，
后续可继续收敛命名，但不保留 `brief` 旧入口。

### Local Daemon

`apps/api` 是 local daemon。

目标 HTTP surface 应围绕 local Soul workspace：

```text
GET    /api/local/info
GET    /api/local/souls
GET    /api/local/souls/:id
GET    /api/local/templates
GET    /api/local/templates/:id
GET    /api/local/cases
POST   /api/local/cases
GET    /api/local/cases/:id
PATCH  /api/local/cases/:id
GET    /api/local/runs
POST   /api/local/runs
GET    /api/local/runs/:id
POST   /api/local/runs/:id/cancel
GET    /api/local/runs/:id/events
GET    /api/local/files
GET    /api/local/files/raw/*
PUT    /api/local/files/raw/*
DELETE /api/local/files/raw/*
GET    /api/local/files/search
GET    /api/local/artifacts
GET    /api/local/artifacts/:id
GET    /api/local/reviews
POST   /api/local/reviews
GET    /api/local/reviews/:id
GET    /api/local/lessons
POST   /api/local/lessons
PATCH  /api/local/lessons/:id
GET    /api/local/settings
PATCH  /api/local/settings
POST   /api/local/settings/engines/rescan
POST   /api/local/settings/engines/test
GET    /api/local/events
```

daemon 负责：

- 解析 local workspace 与 `worker.db`；
- 加载内置 vertical Souls、capability templates 和后续 Soul pack/domain system；
- 提供 CLI/Web 共用 API；
- 用 case/template 创建 run；
- 在 workspace cwd 下调用外部 engine adapter；
- 写入 run event；
- 将成功输出写成 workspace 文件；
- 登记 artifact metadata；
- 创建 review 和 memory proposal；
- 托管 Worker Web 静态资源。

### Core Runtime

`packages/core/src/worker` 是 local Soul run engine。

核心类型和服务应围绕这些对象：

- workspace
- soul
- domain system
- capability template
- case
- run
- run event
- file
- artifact
- review
- memory proposal
- setting

Runtime 只处理 case intake、prompt composition、executor dispatch、event stream、
assistant-output 文件落盘、artifact index、review、memory proposal。旧的通道、定时、
审批、演化、会话路由、远程 gateway client、可见 Brain 管理面不再属于默认本地 runtime。

### Storage

`packages/storage-sqlite` 应为 local Soul workspace 创建 greenfield 表。目标模型：

```text
workspaces
cases
runs
run_events
files
artifacts
reviews
lessons
settings
```

当前 HR/PM/QA/DevOps Soul 与 capability templates 由 `packages/shared` 内置目录提供，
不是 SQLite 表；case/run/artifact/review/settings 是本地 DB 的落地面。

业务内容不被塞进数据库。HR 简历、PM 文档、QA 缺陷证据、DevOps runbook、artifact
文件应留在 workspace 或连接器系统中；SQLite 记录指针、状态、索引、provenance、
review verdict 和 memory admission 状态。

### Worker Web

`apps/web/src/worker` 是 local Soul workspace app。

首屏目标：

- 左侧：Soul catalog、domain system、capability templates；
- 中央：case list / selected case / active run / artifact preview；
- 右侧：review、memory candidate、connector evidence、artifact metadata；
- settings：Local CLI / BYOK、engine scan/test、connector、MCP、language、
  appearance、autosave 配置。

Worker Web 不再是 admin dashboard，也不是 Open Design 的桌面复制。它的第一任务是回答：
这个 team/org 要用哪个 Soul，基于哪个模板和上下文，产出什么业务 artifact，是否值得
沉淀为组织记忆。

## Executor Boundary

AIWorker 不拥有外部 executor 的有效能力集。

AIWorker 可以保存本地 executor hint，例如 engine 名称、endpoint、secret ref。它不能把
这些 hint 伪装成安全隔离边界，也不能把 executor 原生 MCP、plugin、skill、approval、
sandbox、profile 迁移进 AIWorker 的产品模型。

run engine 给 executor 的输入是组合后的 Soul prompt stack、case context、workspace cwd
和 connector evidence；executor 返回事件和最终文本。更复杂的工具循环留在 executor
runtime 内。

## Review And Memory

Review 是 artifact 之后的操作。

review 可以记录：

- artifact 是否 accepted；
- 需要 follow-up 的问题；
- run 失败或证据不足；
- 可沉淀的 memory candidate。

memory proposal 必须带 provenance，指向 review、run、artifact、source evidence 或
operator 显式输入。accepted memory 进入 durable Soul/domain context；rejected memory
保留 rejection reason。

## Deferred Control Plane

远程 worker 聚合、fleet presence、gateway routing、enrollment、remote audit 是后续阶段。
本轮 local Soul deliverable 不依赖这些路径，也不通过它们解释产品价值。

未来如果恢复聚合层，它只能聚合已经可用的 local Soul workspace state，不能重新把 local
worker 拉回管理后台模型。

## Repository Map

| Area | Current role |
| --- | --- |
| `apps/cli` | Local Soul workspace CLI and daemon lifecycle |
| `apps/api` | Local daemon API and Web host |
| `apps/web/src/worker` | Worker Soul workspace app |
| `packages/core/src/worker` | Local Soul run engine |
| `packages/storage-sqlite/src/worker` | `worker.db` schema and accessors |
| `packages/shared/src/local-workspace.ts` | Shared local workspace DTOs |
| `packages/shared/src/worker-pack.ts` | Current pack registry to evolve into Soul pack registry |
| `packages/fs-layout` | Local path and home helpers |

## Acceptance Contract

本架构完成的判定不是“旧概念换名”，而是：

- 新开 workspace 后可以从 CLI/Web 选择 HR/PM/QA/DevOps 等 Soul；
- first screen 能直接选择 capability template 并创建 case；
- daemon 能把 case/template/Soul context 组合成 engine run；
- artifact 能被定位、预览、review；
- accepted memory 能带 provenance 写回 Soul/domain context；
- developer Soul 不再牵引默认产品面；
- OpenAPI 只暴露 local Soul workspace 所需 API；
- 默认本地 DB 只包含 greenfield vertical Soul 表；
- local runtime 没有旧本地 worker subsystem import；
- README、GOALS、PLAN、task 与实际命令一致；
- source-local smoke、浏览器检查、focused gates、root gates 都有证据。
