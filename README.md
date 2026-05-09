# AIWorker

AIWorker 正在按 `REFACTOR-026` 重构为一个 local-first worker workbench。

默认体验应该很直接：选择业务 worker pack，提交 work order，让外部 executor 在真实
workspace 里工作，通过 web 实时观察 run，然后把结果沉淀为文件、review 和可复用 lesson。

```text
worker pack + workspace -> work order -> run -> artifact -> review -> lesson
```

当前仓库仍保留旧的 Project Brain、case、fleet、gateway 实现，但新的产品判断和实现应以
[GOALS.md](GOALS.md) 与 [docs/architecture.md](docs/architecture.md) 为准。

## 为什么改成这个形态

这次重构参考的是 Open Design 的产品语法，而不是它的图片/视频设计领域：

| Open Design | AIWorker |
| --- | --- |
| Design skill | Worker skill |
| Design system | Domain system |
| Project folder | Worker workspace |
| Prompt template | Work-order template |
| Run stream | Worker run stream |
| Artifact preview | Business artifact / case preview |
| Critique | Review / lesson candidate |

AIWorker 的领域是 developer、HR、PM、QA、finance、legal 等业务 worker。领域差异通过
pack、domain system、template、review rubric 表达，不通过 orchestrator 硬编码分支表达。

## 产品边界

AIWorker 负责：

- 初始化本地 workspace；
- 启动本地 daemon；
- 提供 HTTP/SSE run API；
- 托管 worker web workbench；
- 读取 worker packs 与 domain systems；
- 组合 prompt / work order；
- 记录 run event；
- 索引产物文件；
- 管理 review 与 lesson promotion。

外部 executor 负责：

- 原生执行循环；
- tool / plugin / MCP 生态；
- sandbox 与 approval UX；
- 用户级认证和 profile；
- runtime 自己的模型与会话行为。

AIWorker 只通过薄 adapter 调用和观察 executor，不把自己做成 executor 平台。

## 目标 Quickstart

命令树会在 `REFACTOR-026` 中收敛。目标操作流是：

```bash
aiworker init --worker developer
aiworker daemon start --open
aiworker run "Review this repository and produce a release-readiness brief"
```

在重构完成前，过渡版本仍可能暴露旧的 `serve`、worker、case、brain、fleet、gateway
命令。它们是待收敛的兼容/遗留表面，不是新的长期产品模型。

## 仓库结构

```text
apps/
  cli/       local worker CLI
  api/       local daemon API and web host
  web/       worker workbench and deferred fleet UI
  gateway/   deferred fleet/gateway control plane
packages/
  core/             worker runtime services and executor adapters
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

`REFACTOR-026` 分阶段落地：

1. 产品北极星与目标架构重置；
2. 统一 local run service；
3. workspace metadata 与 artifact index；
4. worker pack loader 和内置 packs；
5. CLI daemon lifecycle 与 root help；
6. worker web workbench 首屏；
7. review 和 lesson promotion；
8. cleanup、验证与发布证据。

fleet/gateway 和 desktop 暂缓，等本地 worker loop 自身可用、可解释、可验证后再回到可选扩展层。
