# AIWorker

AIWorker 正在重构为面向 team/org 的 vertical Soul workspace。

它不做另一个 developer engine，也不复制 Open Design 的图片/视频领域。它借鉴 Open
Design 的产品语法：先选能力和系统，再基于模板进入项目上下文，最后产出可审查的
artifact。AIWorker 把这套结构迁移到 HR、PM、QA、DevOps、finance、legal、ops 等
组织职能。

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

## Open Design 映射

| Open Design | AIWorker |
| --- | --- |
| Local daemon | Host-local AIWorker daemon |
| Project | Workspace/project under one Soul worker |
| Conversation | Session under one workspace |
| Chat turn | Turn under one session |
| Run / chat run | Engine invocation / internal audit attempt |
| Design skill | Capability template owned by a Soul worker |
| Design system | Domain system / rubric / policy |
| Image/video template | Capability template / workspace template |
| Examples | Example artifacts / playbooks |
| Connectors | ATS / docs / issue tracker / CI / cloud / CRM connectors |
| Run stream | Session event stream |
| Artifact preview | Business artifact preview |
| Critique | Review / memory candidate |

截图只能校准感受，不能成为复制桌面壳、品牌、宠物或设计工具术语的理由。

OD 没有 `worker` 这一层；AIWorker 必须有。AIWorker 的 worker 是一个 Soul-bound
runtime，例如 HR worker、PM worker、QA worker 或 DevOps worker。OD 的 project 对应
AIWorker worker 下的 workspace/project，而不是 worker 本身。

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
  cli/       local Soul workspace CLI
  api/       local daemon API and web host
  web/       Worker Soul workspace web
  gateway/   deferred fleet/gateway control plane
packages/
  core/             local Soul session runtime and executor adapters
  storage-sqlite/   local SQLite metadata
  fs-layout/        workspace and .aiworker layout helpers
  shared/           shared schemas and utilities
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
12. cleanup、验证与发布证据。

fleet/gateway 和 desktop 暂缓，等单个 vertical Soul workspace 自身可用、可解释、可验证后再回到可选扩展层。
