# AIWorker Agent Bootstrap

默认用中文与用户交流。文档、代码注释、commit message、PR title/description 也默认中文，除非用户另有要求。

## Authority

AIWorker 当前合同只看 canonical docs：

- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`

Temporary drafts live in `tmp/`。旧 changelog、历史 E2E、旧 project-local skills 只可作为证据，不能覆盖 canonical docs。tmp/refactor accepted decisions must be promoted to canonical docs or tests before implementation。

## Product Boundary

AIWorker 的核心现在是 Paseo 工作区的企业分发薄层：把一个懂行的人写出的 Soul（能力模板）版本化、分配给员工，并通过 `aissh` 在目标机器上安装/校验 Paseo 与 provider CLI，再把 Soul 投影成 Paseo workspace 所需的 `AGENTS.md` / `CLAUDE.md` / `skills` / MCP 配置 / 业务上下文文件。

Paseo 拥有员工侧运行时、daemon、client、workspace、session、权限请求、日志、relay/direct 连接、provider orchestration、Claude/Codex/OpenCode/ACP 等 CLI 的进程生命周期。AIWorker 不再拥有 Worker daemon、Workbench、chat/session/invocation、engine bridge、runtime projection、本地 broker API，也不 fork/vendor/embed Paseo。

默认模型：

```text
Manager/Admin -> AIWorker CLI -> aissh target -> Paseo environment -> Paseo workspace -> agent sessions
```

Soul = 版本化 Paseo workspace template。Paseo workspace = Soul projection container。一个 Paseo environment/daemon 可以承载同一员工的多个 workspace；不要设计成一个 Soul 一个 daemon。跨员工隔离靠 OS user / container / VM + 独立 `PASEO_HOME` + 独立 daemon endpoint + 独立 provider credentials。

## Monorepo Boundary

保留的核心包面：

- `apps/aiworker-cli`：AIWorker CLI，描述/规划 provisioning 与 handoff。
- `packages/aiworker-control`：assignment、aissh provision plan、redacted receipt、handoff、workspace file projection guardrails。
- `packages/soul-descriptor`：`soul/v1` descriptor schema，只包含 `protocol / identity / workspaceTemplate`。
- `packages/soul-sdk`：Soul authoring/build helpers，把 `engine/**` 复制成 `dist/workspace-template/**`。
- `souls/*`：官方 Soul templates。

禁止重新创建或引用：`apps/worker-cli`、`apps/worker-web`、`apps/host-web`、`apps/host-cli`、`packages/worker-daemon`、`packages/worker-runtime`、`packages/engine-bridge`、`packages/engine-projection`、`packages/worker-control-protocol`、`packages/storage-sqlite`、`packages/ui`、`packages/host-control`、`core-v2`、`shared-v2`。

## Protocol Boundary

AIWorker protocol 是围绕 Paseo workspace provisioning 的薄协议：

```text
PaseoEnvironment + ProviderProfile + SoulRelease + Assignment -> ProvisionPlan -> Handoff
```

`ready` 只表示 AIWorker 已经准备好 workspace 与 Paseo-native handoff，不表示 AIWorker 可以读取 session、日志、终端输出或 agent event。Handoff 可以是 Paseo daemon endpoint、Paseo pairing offer，或 manual path；若调用 Paseo CLI，`--host` 只是 Paseo 的外部参数名。AIWorker 不能代理 workspace UI 或 session traffic。

## Runtime Boundary

AIWorker no longer has an employee-side runtime. Paseo is the runtime.

AIWorker 可以通过 `aissh` 做：

1. 安装/校验 `@getpaseo/cli`。
2. 安装/校验 Claude/Codex/OpenCode/ACP provider CLI。
3. 设置 `PASEO_HOME` / config metadata / provider profile references。
4. 创建 workspace directory。
5. 写入 Soul projected files。
6. 记录 redacted receipt 和 handoff。

AIWorker 不启动/观察 native engine，不保存 transcript，不实现 follow-up API，不持有 provider API key。Author-owned MCP/config files may contain operational settings, but AIWorker must not copy literal provider secrets into descriptor, DB, receipt, log, diagnostic output, OpenAPI example, UI, or projected workspace files。

## Dev Services

当前薄层没有自研 Worker daemon。AIWorker Web 是管理员薄控制台，默认只监听本机 Vite 端口 `20831`。默认开发入口：

```bash
bun run dev                       # aiworker-web on 127.0.0.1:20831
bun run dev:cli                   # aiworker-cli help
bun run docs:check
bun run test:contracts
bun run test
bun run typecheck
bun run lint
bun run build
```

需要真实 Paseo 行为时，优先按 Paseo 官方 CLI/docs 在目标机器或本地 sandbox 中验证；不要为了测试重新实现 Worker daemon。

环境变量只保留 root `.env.example` / ignored `.env`，字段用于 AIWorker/Paseo/aissh/profile metadata。Provider secret 只存 secret reference，不在 env 示例中放 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 等长期密钥字段。

## Workflow

Use Superpowers for brainstorming, non-trivial planning, TDD, systematic debugging, and verification before completion.

Destructive refactor is allowed before 1.0. Keep changes scoped to the thin Paseo distribution layer. Do not change the new architecture to satisfy old Worker E2E assumptions.

Code changes need focused contract tests appropriate to scope. Before final completion, run the smallest fresh verification that proves the touched surface. For code changes, run code-review-graph unless the change is docs-only, instruction-only, or pure formatting.

发版是开发 agent 的常规自主能力：完成一个可发布阶段后，调用 `release-loop` skill 自行走完整发版闭环。若发布包名或渠道因本次断崖式重构改变，先让 release artifacts/tests 反映当前薄层包面，再发布。

## UI

当前 AIWorker 不做员工侧 UI。Paseo owns employee workspace UI.

AIWorker Web 是管理员主可视化操作台，可在 UI 内**创建/编辑** AIWorker-owned 元数据：assignment、Paseo environment、provider 引用（profile + secret 引用）、Soul release（**register 已 build 的 release，不是浏览器内 authoring**），以及 provisioning/audit/handoff 记录。

但仍是薄层，硬约束不变：

- Web 后端**不是 snapshot source of truth**；所有创建/编辑写动作经 `aiworker` CLI spawn 代写，由 CLI 命令负责落地元数据。
- provider 只存 `secret://` 引用，绝不在 UI/DB/receipt/log 里落 literal secret。
- 不 render/fork/proxy/observe Paseo runtime/workspace/session/provider traffic。
- 不引入 ad-hoc component systems；沿用既有 shadcn 基线。
