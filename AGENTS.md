# AIWorker Agent Guide

AIWorker 当前目标是 **local-first vertical Soul workspace**：让团队按 HR、PM、QA、
DevOps、finance、legal、ops 等垂直职能选择 Soul worker，在 workspace/session 中产出可审查的业务 artifact，并把通过 review 的经验沉淀为可复用组织记忆。

默认产品路径：

```text
local daemon -> Soul worker -> workspace -> session -> turn -> artifact -> review -> lesson/memory
```

不要把默认体验拉回 developer-only work order、admin dashboard、远程控制面、治理内核或通用 agent runtime 平台。

## 必读入口

- `GOALS.md`：产品北极星和取舍边界。
- `docs/architecture.md`：当前对象模型与实现合同。
- `docs/task/FEAT-060.md` 到 `docs/task/FEAT-065.md`、`docs/plan/PLAN-284.md` 到 `docs/plan/PLAN-289.md`：Soul App / Host 双自治架构、挂载协议、独立运行、隔离边界和开发者入口。
- `docs/governance-node-status.md`：遇到旧治理术语时看这里；这些概念已经降级为历史实现或 run 后 review/lesson 机制。

不要把历史外部产品映射、旧远程控制面或旧重启计划当作当前实现约束。它们只属于历史决策轨迹；当前规范入口是 Host / Soul App 双自治、local daemon、workspace/session、artifact、review/lesson 和 Soul App protocol。

## 工作方式

- 默认用中文与用户交流；文档、代码注释、commit message、PR title/description 也默认中文。
- 非平凡开发任务遵循 PMA：先调查，再 proposal，获批后实现，并同步 `docs/task/*.md`；后端参考 `/pma-bun`，前端参考 `/pma-web`，代码评审参考 `/pma-cr`。
- 修改或新增 `apps/aiworker-*` Soul App、Soul App scaffold/validation 或相关 authoring 文档时，先使用 `.agents/skills/aiworker-soul-app-dev/SKILL.md`；保持同一套 Host / Soul App、workspace/session、artifact、review/lesson、standalone/Host mounted 设计语言。
- 保持改动收敛，优先修当前路径；不要为未要求的旧入口、别名、shim 或兼容层扩范围。
- 1.0.0 前允许破坏性收敛；判断标准是当前架构语义、代码归属和用户可理解的产品路径。
- 不创建非必要说明文件；临时产物放 `tmp/`。
- 修改代码文件后，最终回复前介入 code-review-graph 做变更审查；仅改文档、注释、纯格式或用户明确要求跳过时可以跳过，并说明原因。

## 当前实现地图

- `apps/cli`：`aiworker` CLI，本地 daemon lifecycle、Soul/workspace/session/artifact/review/lesson 命令入口。
- `apps/api`：local daemon API 与 Worker Web 静态托管。
- `apps/web`：Worker Web workbench；默认首屏应围绕 Soul worker、workspace/session、artifact、review。
- `packages/core`：local worker runtime、engine adapter、workspace file handling、session event/artifact 归集。
- `packages/component`：共享 UI primitives / patterns。
- `packages/shared`：Soul、worker pack、local workspace schema、共享类型；其中部分旧目录仍可能承载历史或底层类型，改动前先确认是否属于当前默认路径。
- `packages/storage-sqlite`：worker metadata schema 与 migration；真实业务产物属于 workspace 文件夹，不应复制进 DB。
- `packages/fs-layout`：`AIWORKER_HOME`、worker home、workspace 与 `.aiworker/` 布局。

## 产品与实现边界

- 默认入口先解释 Soul worker、domain system、capability template、workspace/session、artifact、review/lesson。
- Developer Soul 只是 supporting role，用于 code review、release evidence、repo report、handoff、risk audit 等；不要让 repo/PMA/coding loop 成为产品中心。
- Workspace/project 是业务作用域，不等同于软件仓库；HR 可以是岗位或候选人池，QA 可以是 release 或 test suite，DevOps 可以是 service、incident 或 runbook。
- 外部 engine 负责自己的 tool loop、模型、sandbox、approval、auth、profile、native session 和插件生态；AIWorker 只在 session 层准备 cwd/context、调用或观察 engine，并索引事件和产物。
- 旧治理能力只应作为 context quality、provenance、review、lesson promotion 的底层机制；不要把它推到首屏、CLI 第一动作或普通用户心智里。
- 远程聚合/控制面不属于当前默认 local worker 主路径。

## 数据与 API 规则

- `worker.db` 存 local metadata：workers、workspaces、sessions、turns、events、engine invocations、files、artifacts、reviews、lessons。
- 真实业务文件和 artifact 留在 workspace 文件夹；DB 只存索引、状态和来源。
- API 文档以代码为准：OpenAPIHono `app.doc('/openapi.json')` + `/docs`。
- 新增或修改 API 时同步 zod schema、OpenAPI metadata、typed client/proto 和相关测试。
- Schema 变更通过 `packages/storage-sqlite` 的 Drizzle schema 与 migration 生成，不手写应用层绕过。
- Secret 只能放 `.env` 或 vault/ref；不要写入 engine config、`.aiworker/*.json`、DB metadata 或日志。

## UI 规则

- Worker Web 应是 artifact 工作台，不是设置页、日志页或治理概念陈列。
- 新组件优先复用 `apps/web/src/shared/components/ui/`、`packages/component` 和已有 primitives。
- 交互组件使用成熟 headless UI；不要手写 focus trap、scroll lock、ARIA 或键盘导航。
- 视觉值来自根目录 `DESIGN.md`，通过 Tailwind CSS v4 `@theme` 接入；不要新增 hex 字面量或 arbitrary value。
- 文案用用户能理解的业务对象：Soul、worker、workspace、session、artifact、review、lesson。仅在开发者/诊断界面暴露底层 run/invocation/engine 词汇。

## 常用命令

- 安装依赖：`bun install`
- 类型检查：`bun run typecheck`
- Lint：`bun run lint`
- 测试：`bun run test`
- 常规 gate：`bun run check`
- 构建：`bun run build`
- Web 构建：`bun run --filter '@zonease/aiworker-web' build`
- API 构建：`bun run --filter '@zonease/aiworker-api' build`
- CLI bundle：`bun run --filter '@zonease/aiworker-cli' build:bundle`
- Worker DB schema：`bun run db:generate:worker`
- code-review-graph：`bun run crg:status` / `bun run crg:update` / `bun run crg:review`

优先跑与改动范围匹配的聚焦命令；跨 package、发布、迁移、安全或公共 API 改动再跑全量 gate。

## Shell、Git 与验证

- 命令默认用 `bash`。
- 长驻进程优先放 tmux，session name 用 `{basename}-{hash}`；没有 tmux 时用 `setsid`/`nohup` + 明确 pidfile/logfile，并在完成后清理。
- 禁止 `kill $(lsof -ti:PORT)`；如需按端口处理，只匹配监听进程，例如 `lsof -tiTCP:PORT -sTCP:LISTEN`。
- Commit message / PR title / PR description 使用中文；Conventional Commit type 保持英文，例如 `feat:`、`fix:`、`refactor:`、`docs:`、`chore:`、`test:`、`ops:`。
- 提交前说明已运行的验证命令和结果；未能运行的 gate 要说明原因。
- 简单文件查找优先 `rg` / `rg --files`。
- 单文件文档/配置改动直接读写即可，不需要强行使用 MCP 或 code-review-graph。
