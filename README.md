# AIWorker

AIWorker 正在重构为面向 team/org 的 vertical Soul workspace。

它不做另一个 developer engine，也不复制 Open Design 的图片/视频领域。它借鉴 Open
Design 的产品语法：先选能力和系统，再基于模板进入项目上下文，最后产出可审查的
artifact。AIWorker 把这套结构迁移到 HR、PM、QA、DevOps、finance、legal、ops 等
组织职能。

```text
Soul + domain system + capability template
  -> case
  -> engine run
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
| Design skill | Soul capability |
| Design system | Domain system / rubric / policy |
| Image/video template | Capability template / case template |
| Project | Domain case / team workspace |
| Examples | Example artifacts / playbooks |
| Connectors | ATS / docs / issue tracker / CI / cloud / CRM connectors |
| Run stream | Engine run stream |
| Artifact preview | Business artifact preview |
| Critique | Review / memory candidate |

截图只能校准感受，不能成为复制桌面壳、品牌、宠物或设计工具术语的理由。

## 产品边界

AIWorker 负责：

- Soul catalog 与 Soul pack；
- domain system 与 capability template；
- local daemon API 和 Web；
- prompt composition；
- connector evidence 的边界与来源；
- engine run 的事件和 artifact 索引；
- review/admission；
- durable org memory。

外部 engine 负责：

- 原生执行循环；
- tool / plugin / MCP 生态；
- sandbox 与 approval UX；
- 用户级认证和 profile；
- runtime 自己的模型与会话行为。

AIWorker 只通过薄 adapter 调用和观察 engine，不把自己做成 executor 平台。

## Quickstart

当前 CLI 仍处在从 local worker loop 向 vertical Soul loop 迁移的中间态。目标 onboarding
会收敛到：

```bash
aiworker init --name "Team Workspace" --root .
aiworker soul list
aiworker soul select hr-recruiting
aiworker template list
aiworker case create --template candidate-screen
aiworker run start --case <caseId>
```

短期内，已有 `brief` / `lessons` 命令可能仍作为底层实现存在；1.0 前不为旧命令形态保留
长期兼容。

## 仓库结构

```text
apps/
  cli/       local Soul workspace CLI
  api/       local daemon API and web host
  web/       Worker Soul workspace web
  gateway/   deferred fleet/gateway control plane
packages/
  core/             local Soul run engine and executor adapters
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
3. capability template / domain system 文件模型；
4. local daemon 的 Soul/template/case API；
5. Web 首屏：Soul catalog + capability templates + simple settings；
6. business artifact preview；
7. review/admission -> durable org memory；
8. developer Soul 降级为 supporting role；
9. cleanup、验证与发布证据。

fleet/gateway 和 desktop 暂缓，等单个 vertical Soul workspace 自身可用、可解释、可验证后再回到可选扩展层。
