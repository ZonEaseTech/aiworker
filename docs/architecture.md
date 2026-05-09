# AIWorker Architecture

> 状态：这是当前 greenfield local worker 架构。默认产品面只有 local
> workspace loop；远程聚合控制面被放到后续阶段，不牵引本轮 CLI、daemon、API、Web。

AIWorker 现在按一条本地业务工作流组织：

```text
workspace + worker intent
  -> brief
  -> run
  -> workspace files and artifacts
  -> review
  -> durable lessons
```

Open Design 的参考价值在于它的项目意图：本地 daemon 管真实项目、真实文件、运行流、
预览和复盘。AIWorker 不复制图片/视频领域，而是把同一套产品语言用于 developer、HR、
PM、QA、finance、legal 等 worker。

## 架构原则

- Local workspace first：`aiworker init`、local daemon、Worker Web 是默认入口。
- Files first：业务文件留在 workspace；SQLite 只存 metadata、状态、索引和复盘结果。
- Brief before run：operator 的意图先成为 brief，run 是一次 executor 尝试。
- Artifacts are visible：成功 run 必须产生可定位的 artifact，而不是只留下日志。
- Review after run：复盘和 lesson 晋升发生在产物之后，不是首屏治理概念。
- External executor owned：tool loop、approval UX、sandbox、profile、auth、native session
  都属于外部 executor；AIWorker 只做薄 adapter 和事件归一化。
- No compatibility surface：1.0 前不保留旧本地 worker API、CLI alias、DB 迁移读取或隐藏旧页面。

## 运行时组件

### CLI

`apps/cli` 是本地 workspace 自动化入口。

当前命令面：

```text
aiworker init
aiworker daemon start|foreground|status|stop|logs|check
aiworker brief create|list|show
aiworker run start|list|show|cancel
aiworker files list|show|write|delete|search
aiworker artifacts list|show|open
aiworker review list|show|create
aiworker lessons list|propose|accept|reject
aiworker settings list
aiworker executor select|doctor
aiworker open
aiworker commands
```

CLI 不再把本地 worker 包装成管理后台。它只负责初始化、启动 daemon、提交 brief/run、
查看文件和 artifact、写入 review、处理 lesson。

### Local Daemon

`apps/api` 是 local daemon。

默认 HTTP surface 是 `/api/local/*`：

```text
GET    /api/local/info
GET    /api/local/workspace
PATCH  /api/local/workspace
GET    /api/local/briefs
POST   /api/local/briefs
GET    /api/local/briefs/:id
PATCH  /api/local/briefs/:id
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
GET    /api/local/events
```

daemon 负责：

- 解析 local workspace 与 `worker.db`；
- 提供 CLI/Web 共用 API；
- 用 brief 或 direct prompt 创建 run；
- 在 workspace cwd 下调用外部 executor adapter；
- 写入 run event；
- 将成功输出写成 workspace 文件；
- 登记 artifact metadata；
- 创建 review 和 lesson proposal；
- 托管 Worker Web 静态资源。

### Core Runtime

`packages/core/src/worker` 是新的 local run engine。

核心类型和服务围绕这些对象：

- workspace
- brief
- run
- run event
- file
- artifact
- review
- lesson
- setting

`LocalWorkerRuntime` 只处理 brief intake、executor dispatch、event stream、
assistant-output 文件落盘、artifact index、review、lesson proposal。旧的通道、定时、
审批、演化、会话路由、远程 gateway client、可见 Brain 管理面不再属于默认本地 runtime。

### Storage

`packages/storage-sqlite` 只为 local worker 创建 greenfield 表：

```text
workspaces
briefs
runs
run_events
files
artifacts
reviews
lessons
settings
```

业务内容不被塞进数据库。当前 run 输出写入 workspace 下：

```text
.aiworker/local/artifacts/runs/<runId>/response.md
```

SQLite 记录文件指针、大小、状态、metadata、review verdict、lesson provenance。

### Worker Web

`apps/web/src/worker` 是 local workspace app。

首屏布局：

- 左侧：workspace、briefs、files；
- 中央：active run、event stream、artifact preview；
- 右侧：review、lesson、artifact metadata。

Worker Web 不再是 admin dashboard，也不展示旧本地 worker 管理页面。它的第一任务是回答：
当前 workspace 要做什么、跑到了哪里、产物在哪、是否值得沉淀为 lesson。

## Executor Boundary

AIWorker 不拥有外部 executor 的有效能力集。

AIWorker 可以保存本地 executor hint，例如 engine 名称、endpoint、secret ref。它不能把
这些 hint 伪装成安全隔离边界，也不能把 executor 原生 MCP、plugin、skill、approval、
sandbox、profile 迁移进 AIWorker 的产品模型。

run engine 给 executor 的输入是组合后的 work order 和 workspace cwd；executor 返回事件
和最终文本。更复杂的工具循环留在 executor runtime 内。

## Review And Lessons

Review 是产物之后的操作。

review 可以记录：

- artifact 是否 accepted；
- 需要 follow-up 的问题；
- run 失败或证据不足；
- 可沉淀的 lesson candidate。

lesson 必须带 provenance，指向 review、run、artifact 或 operator 显式输入。accepted
lesson 进入 durable local context；rejected lesson 保留 rejection reason。

## Deferred Control Plane

远程 worker 聚合、fleet presence、gateway routing、enrollment、remote audit 是后续阶段。
本轮 local worker deliverable 不依赖这些路径，也不通过它们解释产品价值。

未来如果恢复聚合层，它只能聚合已经可用的 local workspace state，不能重新把 local worker
拉回管理后台模型。

## Repository Map

| Area | Current role |
| --- | --- |
| `apps/cli` | Local workspace CLI and daemon lifecycle |
| `apps/api` | Local daemon API and Web host |
| `apps/web/src/worker` | Worker workspace app |
| `packages/core/src/worker` | Local run engine |
| `packages/storage-sqlite/src/worker` | `worker.db` schema and accessors |
| `packages/shared/src/local-workspace.ts` | Shared local workspace DTOs |
| `packages/fs-layout` | Local path and home helpers |

## Acceptance Contract

本架构完成的判定不是“旧概念换名”，而是：

- 新开 workspace 后可以从 CLI 完成 init -> daemon -> brief -> run -> artifact -> review -> lesson；
- Worker Web 首屏就是 workspace product surface；
- OpenAPI 只暴露 `/api/local/*`；
- 默认本地 DB 只包含 greenfield 表；
- local runtime 没有旧本地 worker subsystem import；
- README、GOALS、PLAN、task 与实际命令一致；
- source-local smoke、浏览器检查、CRG、focused gates、root gates 都有证据。
