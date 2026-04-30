# PLAN-048 优化 CLI help 信息架构

- **status**: completed
- **createdAt**: 2026-04-30 16:09
- **approvedAt**: 2026-04-30 16:11
- **completedAt**: 2026-04-30 16:28
- **relatedTask**: FEAT-041

## 现状

1. `apps/cli/src/aiworker.ts` 使用 `cac('aiworker')` 注册所有 CLI 命令，最后调用 `cli.help()` 与 `cli.version(packageJson.version)`。
2. 全局 `aiworker --help` 是 `cac` 默认输出：一个 `Commands` 区块列出全部命令，再自动输出每条命令的 `--help` 示例。
3. 命令注册顺序虽然在代码里用注释分成 `worker-local` 与 `operator-remote`，但默认 help 不展示这些模块边界。
4. 现有描述明显中英混输：例如 `init`、`serve`、`schedule-list` 是英文，`fleet list`、`gateway start`、`chat`、`enroll approve` 是中文；部分选项也混杂语言。
5. 子命令 help 仍有价值：它展示具体 option、默认值和参数要求，且现有测试确认 `--help` 不应触发本地 bootstrap 或写入 `AIWORKER_HOME`。
6. 本地 `cac@6.7.14` 支持 `cli.help(callback)` 改写 help sections，可在保留当前命令解析、校验和多词命令预处理的前提下自定义全局 help。

## 方案

1. 新增一个小型 help 渲染 helper，例如 `apps/cli/src/help.ts`，集中维护命令分组、guide 文案和中文描述，避免继续把 `apps/cli/src/aiworker.ts` 拉长。
2. 将命令描述与 option 描述统一为中文，覆盖全局 help 和常用子命令 help；保留必要英文协议名、环境变量名、路径和技术名词，例如 `worker.db`、`gateway`、`WebSocket`、`AIWORKER_HOME`。
3. 全局 help 改成场景分组，而不是线性命令列表：
   - 本地 worker：`init`、`scope`、`run`、`serve`、本地 config/token/approvals/schedule/sessions。
   - Gateway / fleet：`gateway start/status/stop`、`fleet list/info/launch/stop/remove`、`pair`、`enroll *`。
   - 远端 worker 操作：`chat`、`config get/set`、`token rotate`、远端 approvals/schedule、`logs`。
   - 安装、诊断、高级维护：`install systemd`、`sessions maintenance`、`scope` 等。
4. 在全局 help 顶部加入短 guide：
   - 新建本地 worker：先 `aiworker init`，再 `aiworker serve`。
   - 管理 fleet：先 `aiworker gateway start`，再 `aiworker pair` 或 `aiworker enroll list`。
   - 只试一次消息：用 `aiworker run --message ...`；已接入 fleet 后用 `aiworker chat <workerId> <text>`。
   - `install systemd`、`sessions maintenance`、`approvals*` 属于部署、维护或审批场景，首次使用通常不用。
5. 保留子命令 `--help` 的默认结构，必要时只追加或调整局部文案，不改解析逻辑。
6. 更新 `apps/cli/src/aiworker.test.ts`，断言全局 help 包含分组标题、guide 语句、关键命令，并不再依赖默认逐命令 `--help` 长列表。

## 风险

1. 自定义 help 如果直接替换 `cac` sections，可能漏掉新命令。对策：分组 helper 中对所有显式注册命令做覆盖检查，测试比较 `cli.commands` 和分组集合。
2. 统一中文文案可能影响已有测试中对英文片段的断言。对策：同步更新这些断言，让它们仍覆盖同一行为语义，例如 `config-show` 会 bootstrap 本地状态。
3. `cac` 子命令 help 的默认 `--no-*` option 会显示 `(default: true)`，这次不优先解决默认值格式；若要彻底重写 option 渲染，应另开更大范围。
4. 纯中文 help 可能降低非中文用户可读性。当前仓库 AGENTS.md 明确默认中文，对外 CLI 文案这次按中文收敛；英文双语输出可作为后续 i18n 任务。

## 范围

预期改动：

- `apps/cli/src/help.ts`
- `apps/cli/src/aiworker.ts`
- `apps/cli/src/aiworker.test.ts`
- `docs/task/FEAT-041.md`
- `docs/task/index.md`
- `docs/plan/PLAN-048.md`
- `docs/plan/index.md`

不做：

- 不更换 CLI 框架。
- 不改变任何命令名、参数名、退出码或运行逻辑。
- 不引入英文/中文切换配置。
- 不改 README、部署文档或发布流程，除非实现时发现测试必须同步引用。

## 验证

已通过：

1. `PATH="$HOME/.bun/bin:$PATH" bun test apps/cli/src/aiworker.test.ts`
2. `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' typecheck`
3. `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' test`
4. `PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' build:bundle`
5. `PATH="$HOME/.bun/bin:$PATH" bun run lint`
6. `git diff --check`

## 备选方案

1. 只把现有 command/option 描述翻译成中文。改动最小，但仍然保留线性列表和逐命令长 help，不能解决“哪个场景用什么”的核心问题。
2. 完全手写所有 help 输出，包括子命令 options。体验可控性最高，但需要复制 `cac` 的参数/默认值展示逻辑，维护成本更高，不适合作为本次第一步。
3. 引入 Commander.js 等更强 CLI 框架。可提供更丰富的 help 组织能力，但会波及解析、测试和多词命令兼容，范围过大。

## 批注

- 2026-04-30 16:09：用户反馈 help 中英混输、缺少模块板块、场景边界不清，并允许补充 guide 语句。
- 2026-04-30 16:09：proposal ready，等待用户批准后实现。
- 2026-04-30 16:11：用户回复 `proceed`，进入实现。
- 2026-04-30 16:28：完成实现与验证。实际输出改为中文 `用法`、`使用引导`、分组命令、`更多`、`选项`；保留子命令参数细节和原有解析行为。
