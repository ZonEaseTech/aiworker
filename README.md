# AIWorker

AIWorker 正在重构为面向 team/org 的 vertical Soul workspace。

它不做另一个 developer engine、admin dashboard 或通用 agent runtime。当前架构以
Host / Soul App 双自治为中心：Host 提供本地 daemon、workspace/session runtime、
engine handoff、artifact/review/memory 和隔离 broker；Soul App 提供垂直领域产品逻辑、
UI/API、artifact schema、connector needs 和 review policy。

```text
host -> local daemon
  -> Soul worker
  -> workspace/project
  -> session
  -> turn
  -> business artifact
  -> review
  -> durable org memory
```

## 为什么改成这个形态

开发领域已经有成熟的一线 engine。AIWorker 不应该默认以 developer 为中心，更不应该
把自己做成完整开发平台。developer Soul 可以存在，但它应服务 code review、release
evidence、repo report、handoff、risk audit 等 supporting workflows。

AIWorker 的主要价值在更需要组织沉淀的垂直职能：

- HR：candidate screen、interview brief、role rubric、hiring risk；
- PM：PRD、decision record、roadmap slice、status report；
- QA：test plan、regression matrix、defect evidence、release gate；
- DevOps：deployment checklist、incident review、runbook update、capacity summary；
- finance/legal/ops：各自领域的审查、模板化输出、证据链和复用经验。

## Soul App 模型

Soul App 是可独立部署、也可挂载到 AIWorker Host 的垂直产品单元。例如 `aiworker-hr`
可以作为 HR-first 本地应用独立运行，也可以被 Host 挂载，与 `aiworker-qa` 等其他
Soul App 共存在同一个 local daemon 中。

```text
Standalone:
aiworker-hr -> embedded AIWorker core runtime -> HR workspace/session/artifacts

Host mounted:
aiworker-host -> Soul App registry -> aiworker-hr / aiworker-qa
```

两种模式应复用同一份 manifest、domain logic、artifact schema 和 review policy。
Host 不 import 垂直 app 内部源码；Soul App 不直接控制 Host engine、connector、
secret、DB 或全局 memory。

## 基础设施模型

AIWorker 的本地目标架构是：

```text
1 host
  -> 1 local daemon
    -> N Soul workers
      -> 1 Soul per worker
        -> N workspaces/projects
          -> N sessions
            -> N turns / artifacts
```

- Host 是承载环境，不是产品对象。
- Local daemon 是唯一的本地控制面，负责 Web/API、SQLite、engine inventory、BYOK、
  connectors、MCP、settings 和 worker registry。
- Worker 绑定一个 Soul，并拥有该 Soul 的 capabilities、domain system、review policy
  和 durable memory namespace。
- Workspace/project 是某个 worker 下的业务作用域，例如候选人、需求、release、
  incident 或 runbook。
- Session 是 workspace 内持续上下文，也是 engine native session 的绑定点和接管点。
- Turn 是 session 内一次用户输入、engine 回复、tool/event 更新或 artifact 修改。
- Engine invocation 只是内部审计对象；用户不创建、不维护 run。
- Capability template 属于 Soul worker；workspace 默认继承 worker capabilities；
  session/turn/artifact 必须记录实际使用的 capability 或 workflow。

## 产品边界

AIWorker 负责：

- Soul catalog 与 Soul pack；
- domain system 与 capability template；
- local daemon API 和 Web；
- prompt composition；
- connector evidence 的边界与来源；
- session event、engine invocation 审计和 artifact 索引；
- review/admission；
- durable org memory。

外部 engine 负责：

- 原生执行循环；
- tool / plugin / MCP 生态；
- sandbox 与 approval UX；
- 用户级认证和 profile；
- runtime 自己的模型与会话行为。

AIWorker 只通过薄 adapter 调用和观察 engine，不把自己做成 executor 平台。

本阶段实现严格遵循 `docs/architecture.md` 中的 session 接管合同：engine 从 workspace 下
的 session 层开始接管，run 不作为产品对象。除非真实实现证明该合同无法落地或产品体验
不如预期，否则不再调整架构；任何调整都必须先走新的 proposal。

## Quickstart

目标 operator 路径应是一个本地 daemon 生命周期和一个 Web URL，而不是要求用户分别理解
API dev server 与 Web dev server。

目标 source-checkout 调试入口：

```bash
aiworker dev
```

目标 packaged/local runtime 入口：

```bash
aiworker daemon foreground --port 9217
```

Source checkout 调试也走同一个 daemon；先构建一次 Web 静态资源，然后以前台 daemon
托管 Web/API：

```bash
bun run --filter '@zonease/aiworker-web' build
bun apps/cli/src/aiworker.ts dev --port 9217
```

打开 Web 后，首屏应是 Soul worker catalog。用户选择或创建 HR / PM / QA / DevOps
worker，进入该 worker 下的 workspace/session，选择或接受推荐的 capability template，
在 session 中多轮 turn 沟通并看到对应业务 artifact。Settings 由明确 settings button
打开，支持 Local CLI / BYOK、engine scan/test、connectors、MCP、language、appearance
和 autosave。

## 仓库结构

```text
apps/
  api/           local daemon API and Worker Web host
  cli/           aiworker CLI and packaged local daemon entry
  web/           Worker Web workbench
  aiworker-hr/   official HR Soul App
  aiworker-qa/   official QA Soul App
packages/
  core/              local session runtime, Soul App registry and executor adapters
  storage-sqlite/    worker.db schema, migrations and repositories
  fs-layout/         AIWORKER_HOME, worker and workspace path helpers
  shared/            shared schemas, Host/Soul App contracts and utilities
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

1. 产品北极星与目标架构重置为 vertical Soul workspace；
2. Soul catalog 与内置 HR/PM/QA/DevOps 优先级；
3. host daemon / Soul worker / workspace / session / turn / invocation 对象模型；
4. capability template / domain system 文件模型；
5. local daemon 的 worker registry、Soul/template/workspace/session/turn/artifact API；
6. Web 首屏：Soul worker catalog + capability templates + workspace/session/artifact；
7. CLI/Web 调试入口收敛为单 daemon lifecycle；
8. Settings：Local CLI / BYOK、engine scan/test、connectors、MCP、language、
   appearance、autosave；
9. business artifact preview；
10. review/admission -> durable org memory；
11. developer Soul 降级为 supporting role；
12. Soul App protocol / Host mount / standalone SDK / isolation brokers；
13. HR 与 QA reference Soul App；
14. developer onboarding、验证与发布证据。
