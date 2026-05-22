# AIWorker

AIWorker 正在收敛为 **Local Shell + Engine Bridge for Soul Apps**。

它不做另一个 developer engine、admin dashboard、远程控制面、通用平台或通用 agent runtime。
Host 只负责启动 Soul App、提供本地 Web/CLI/daemon 壳、定位 worker/workspace/session、挂载
app-owned surface，并为 session 准备 cwd/context/engine 调用入口。业务对象、业务输出、
确认动作和历史记录由 Soul App 自己拥有。

```text
AIWorker -> Soul App -> workspace -> session -> app-owned work
```

当前架构合同见 `docs/architecture.md`，其中 `Constraint Registry` 是 Host / Soul App /
protocol / data / engine / UI / documentation 的硬约束源头。旧北极星文档已经移除，避免开发入口
被拆成多套叙事。

第一原则：Host 是 shell / locator / mount / bridge，不是 Soul App 的上层配置中心。Host-owned
Worker Configuration 只到 Soul worker 级别；同一 Soul App 的不同 worker 必须彼此隔离。
workspace/session 只作为不透明 locator/context 传给 mounted Soul surface 或 engine bridge，
不能成为 Host 配置层。Soul 通过 manifest/protocol descriptor 告知 Host 可泛化消费的选项；
领域配置 UI、字段和保存逻辑属于 Soul-owned micro-app 或 app-owned API。

## 文档地图

- `docs/architecture.md`：当前架构合同。
- `docs/cli.md`：当前 CLI 命令参考。
- `docs/deployment.md`：local daemon、packaged CLI 和 operator 运行手册。
- `docs/executor-engines.md`：外部 engine 安装、登录和 readiness 说明。
- `docs/soul-app-developer.md`：Soul App authoring workflow。

## Developer Route

| 我要修改 | 从这里开始 |
| --- | --- |
| Host daemon/API、registry、local enablement、storage metadata | `docs/architecture.md` + `.agents/skills/aiworker-host-dev/SKILL.md` |
| Host Web Shell、Settings、Worker Configuration、mounted workbench | `docs/architecture.md` + `.agents/skills/aiworker-host-dev/SKILL.md`，前端实现再用 `/pma-web`；shadcn/ui 相关改动再用 `.agents/skills/shadcn/SKILL.md` |
| CLI lifecycle、daemon/app/worker/workspace/session 命令 | `docs/cli.md` + `.agents/skills/aiworker-host-dev/SKILL.md` |
| 官方 HR/QA Soul App、manifest、standalone、Host mounted、artifact/profile/review/lesson | `docs/soul-app-developer.md` + `.agents/skills/aiworker-soul-app-dev/SKILL.md` |
| 新第三方 Soul App | `aiworker app create` + `docs/soul-app-developer.md` + `.agents/skills/aiworker-soul-app-dev/SKILL.md` |
| Host/Soul App 边界、shared protocol、manifest-declared adapter/context | 先读 `docs/architecture.md#constraint-registry`，判断 ownership 后进入 Host 或 Soul App skill |

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

Host 是本地运行壳和 engine bridge，只负责：

- start：发现、安装、启用、禁用、路由和启动 Soul App；
- shell：提供 local daemon API、Web shell、CLI 入口和运行 shell 所需的本地设置；
- locate：维护 Soul worker、workspace、session、selected engine 和本地路径上下文；
- mount：解析 manifest 声明的 routes、micro-app surfaces、action descriptors 和 app-owned
  local adapter；
- bridge：为 session 准备 cwd、context files、selected engine metadata 和 invocation boundary；
- metadata：保存 installed/enabled app state、workers、workspaces、sessions、routing protocol
  cache、mounted surface references 和 platform file references。

Host 不负责解释 HR profile、QA release verdict、artifact 内容、review verdict 或 lesson/memory
的领域意义。它只能消费 Soul App 通过 manifest/protocol 暴露的 route、mounted UI、action
descriptor、workspace context、session context 或 lightweight UI event；如果 app 没有暴露，
Host 停止，不取、不猜、不补。

Host left panel、header、Worker Configuration trigger/dialog shell 属于 Host-owned chrome。
Worker Configuration 只保存 worker-scoped Host shell preference、worker overlay/local
enablement 和 manifest-derived 泛化选项；它不是 Soul/App 全局设置页，也不是 workspace/session
配置页。需要 workspace/session/domain 配置时，进入 Soul-owned micro-app 或 app-owned API。

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
- Worker 绑定一个 Soul App，并拥有该 worker 的 Host shell preference、capabilities 投影和
  app-scoped namespaces；同一 Soul App 下不同 worker 的配置彼此隔离。
- Workspace/project 是某个 worker 下的业务作用域，例如候选人、需求、release、incident 或
  runbook。
- Session 是 workspace 内持续上下文，也是 engine native session 的绑定点和接管点。
- Engine invocation 只是内部审计对象；用户不创建、不维护 run。

## Quickstart

目标 operator 路径应是一个本地 daemon 生命周期和一个 Web URL，而不是要求用户分别理解 API
dev server 与 Web dev server。

目标 source-checkout 调试入口：

```bash
bun run dev
```

目标 packaged/npm preview 入口：

```bash
bunx @zonease/aiworker-cli daemon start --port 9217
# or, if Bun is already available for the shim:
npx @zonease/aiworker-cli daemon start --port 9217
```

这是 `0.x preview`：Host Web/API 启动、worker DB migrations，以及官方 HR/QA Soul App
bootstrap 需要能从 npm package 直接工作。HR/QA 业务 workflow、第三方 Soul App authoring、
standalone SDK/runtime npm publication 仍是 preview surface，不是 1.0 承诺。

Source checkout 调试也走同一个 daemon；先构建一次 Web 静态资源，然后以前台 daemon 托管 Web/API：

```bash
bun run --filter '@zonease/aiworker-web' build
bun apps/cli/src/aiworker.ts daemon foreground --port 9217
```

源码态默认使用 `~/.aiworker-dev` 作为开发 profile；发布包和 npm preview
默认仍使用 `~/.aiworker`。两种入口都可以通过 `AIWORKER_HOME=<path>` 显式覆盖。
`aiworker dev` 仅保留为 source-checkout compatibility alias；日常 operator
lifecycle 使用 `daemon start|stop|restart|status|logs`。

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
  ui/                shadcn-managed shared UI primitives and theme variables
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
7. Host/Soul protocol 继续收敛 route、action descriptor、workspace/session context、event 和 mount mode；
8. Developer onboarding、验证、发布证据和第三方 app authoring 继续完善。
