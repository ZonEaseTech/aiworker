# AIWorker

AIWorker 正在重构为面向 team/org 的 **local-first vertical Soul App host**。

它不做另一个 developer engine、admin dashboard 或通用 agent runtime。当前架构以 Host /
Soul App 双自治为中心：Host 提供本地 daemon、安装启用、鉴权安全、平台设置、能力 broker、
统一 shell 与协议定位；Soul App 提供垂直领域产品逻辑、standalone 体验、Host mounted 体验、
领域 UI/API，以及 artifact/profile/review/lesson 的领域语义。

```text
Host -> install/enable Soul App -> Soul worker -> workspace -> session
  -> Soul App exposed views/actions -> business artifact/profile/review/lesson
```

当前架构合同见 `docs/architecture.md`。旧北极星文档已经移除，避免开发入口被拆成多套叙事。

## 为什么改成这个形态

开发领域已经有成熟的一线 engine。AIWorker 不应该默认以 developer 为中心，更不应该把自己
做成完整开发平台。Developer Soul 可以存在，但它应服务 code review、release evidence、
repo report、handoff、risk audit 等 supporting workflows。

AIWorker 的主要价值在更需要组织沉淀的垂直职能：

- HR：candidate screen、interview brief、role rubric、people profile、hiring risk；
- PM：PRD、decision record、roadmap slice、status report；
- QA：test plan、regression matrix、defect evidence、release gate；
- DevOps：deployment checklist、incident review、runbook update、capacity summary；
- finance/legal/ops：各自领域的审查、模板化输出、证据链和复用经验。

## Soul App 模型

Soul App 是可独立部署、也可挂载到 AIWorker Host 的垂直产品单元。例如 `aiworker-hr`
可以作为 HR-first 本地应用独立运行，也可以被 Host 挂载，与 `aiworker-qa` 等其他 Soul App
共存在同一个 local daemon 中。

```text
Standalone:
aiworker-hr -> app-local runtime/settings/storage -> HR workspace/session

Host mounted:
aiworker-host -> app registry -> manifest/protocol -> aiworker-hr / aiworker-qa
```

两种模式应复用同一份 manifest、domain logic、artifact schema、review policy 和权限声明。
Host 不 import 垂直 app 内部源码；Soul App 不直接控制 Host engine、connector、secret、DB 或
全局 memory。

## Host 的职责

Host 是平台定位与能力壳，负责：

- local daemon API 和 Web shell；
- Soul App registry、install、enable、disable、route 和 mounted launch；
- Host auth、安全层、session 安全和 grant enforcement；
- appearance、language、default engine、local MCP、connector、BYOK、autosave 等横向设置；
- storage、connector evidence、secret reference、log、search、audit 等 broker；
- worker/workspace/session locator；
- Host shell layout 和 optional header contract；
- app protocol discovery、health、descriptor cache 和平台审计。

Host 不负责解释 HR profile、QA release verdict、artifact 内容、review verdict 或 lesson/memory
的领域意义。它只能消费 Soul App 通过协议和 grant 暴露的 view、action、status、descriptor、
search、review summary、memory summary 或 audit event。

## Soul App 的职责

Soul App 是领域主权方，负责：

- 垂直领域 UI/API；
- workspace type 与 session workflow；
- capability prompt；
- artifact schema、内容、生命周期与含义；
- profile 组合；
- review rubric 与 verdict 语义；
- lesson/memory promotion 语义；
- app-scoped storage content；
- standalone shell；
- Host mounted service entrypoints。

例如 HR People Profile 应由 HR App 从候选人 artifact、面试 evidence、人工 review 和业务规则
组合而成。Host 可以定位并展示 HR App 暴露的 profile view，但不应该知道 profile 如何合成。

## 基础设施模型

```text
1 Host
  -> 1 local daemon
    -> N installed/enabled Soul Apps
      -> N Soul workers
        -> N workspaces/projects
          -> N sessions
            -> protocol-exposed views/actions/descriptors
```

- Host 是承载环境，不是垂直产品对象。
- Local daemon 是唯一的本地控制面，负责 Web/API、SQLite、engine inventory、BYOK、
  connectors、MCP、settings 和 app registry。
- Worker 绑定一个 Soul App，并拥有该 app 的 capabilities、domain system、review policy 和
  app-scoped namespaces。
- Workspace/project 是某个 worker 下的业务作用域，例如候选人、需求、release、incident 或
  runbook。
- Session 是 workspace 内持续上下文，也是 engine native session 的绑定点和接管点。
- Engine invocation 只是内部审计对象；用户不创建、不维护 run。

## Quickstart

目标 operator 路径应是一个本地 daemon 生命周期和一个 Web URL，而不是要求用户分别理解 API
dev server 与 Web dev server。

目标 source-checkout 调试入口：

```bash
aiworker dev
```

目标 packaged/local runtime 入口：

```bash
aiworker daemon foreground --port 9217
```

Source checkout 调试也走同一个 daemon；先构建一次 Web 静态资源，然后以前台 daemon 托管 Web/API：

```bash
bun run --filter '@zonease/aiworker-web' build
bun apps/cli/src/aiworker.ts dev --port 9217
```

打开 Web 后，首屏应帮助用户 install/enable 官方或第三方 Soul App，再创建 Soul worker 与
workspace/session。Settings 由明确 settings button 打开，支持 Local CLI / BYOK、engine
scan/test、connectors、MCP、language、appearance、autosave 和 Soul App 管理。

## 仓库结构

```text
apps/
  api/            local daemon API and Worker Web host
  cli/            aiworker CLI and packaged local daemon entry
  web/            Host Web Shell and worker workbench
  aiworker-hr/    official HR Soul App
  aiworker-qa/    official QA Soul App
packages/
  core/              local runtime, Host services and engine adapters
  storage-sqlite/    worker.db schema, migrations and repositories
  fs-layout/         AIWORKER_HOME, worker and workspace path helpers
  shared/            shared schemas, Host/Soul App protocol and utilities
  component/         shared React UI primitives and patterns
  soul-app-sdk/      public SDK for Soul App authors
  soul-app-runtime/  standalone/mounted Soul App runtime harness
```

## 开发命令

安装依赖：

```bash
bun install
```

常用检查：

```bash
bun run typecheck
bun run lint
bun run test
bun run check
bun run build
```

聚焦命令：

```bash
bun run --filter '@zonease/aiworker-core' test
bun run --filter '@zonease/aiworker-api' build
bun run --filter '@zonease/aiworker-web' build
bun run --filter '@zonease/aiworker-cli' build:bundle
```

## 当前路线

当前重构阶段重新排优先级：

1. 架构入口收敛为 `AGENTS.md` + `docs/architecture.md`；
2. Host 作为平台定位、能力壳、安装启用、安全设置和 shell contract；
3. Soul App 作为 app-level standalone + Host mounted 垂直产品；
4. 官方 HR/QA Soul App 通过快捷 install/enable 进入 Host，而不是被 Host 内置；
5. Worker Web 首屏围绕 Soul App、worker、workspace、session 和 app-owned workbench；
6. Settings 管理 Local CLI / BYOK、engine scan/test、connectors、MCP、language、
   appearance、autosave 和 installed Soul Apps；
7. Host/Soul protocol 继续收敛 view、action、status、descriptor、broker 和 mount mode；
8. Developer onboarding、验证、发布证据和第三方 app authoring 继续完善。
