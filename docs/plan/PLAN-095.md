# PLAN-095 OpenClaw configured runtime spec

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 14:00
- **relatedTask**: FEAT-052

## 现状

OpenClaw 使用 configured agent/workspace/state/config 模型，不应被 AIWorker
强行扭成 plain cwd executor。它可以作为 external runtime，但 project binding
必须尊重 OpenClaw 自己的 `OPENCLAW_CONFIG_PATH`、`OPENCLAW_STATE_DIR`、
agent workspace 和 gateway/session model。

## 方案

1. 定义 OpenClaw adapter 只支持 configured runtime。
2. operator 显式提供 config/state/agent 或 profile；AIWorker 不默认生成 hermetic runtime。
3. 可选 project overlay 只作为 bootstrap helper，把 agent workspace 指向项目。
4. AIWorker 只调用 OpenClaw agent run surface 并归一化事件。

## 范围

- spec docs。
- no-code spike unless separately approved。

## 非范围

- 不复制 OpenClaw workspace bootstrap。
- 不接管 OpenClaw skills/plugins/channels。
- 不做 project-only 强约束。

## 风险

OpenClaw 的 gateway/channel 能力与 AIWorker gateway 语义重叠；默认只接 agent run，不启用 OpenClaw channel/gateway hosting。

## 验证

- config model review。
- future local smoke with isolated OpenClaw test state if implemented。

## 完成记录

- 2026-05-04 14:00：完成 OpenClaw configured runtime spec 文档化（**只出 spec，不落代码**，与 plan 范围一致）。

### Spec 摘要

OpenClaw thin adapter 接入 AIWorker 时遵守 4 条硬约束：

1. **Configured runtime only**：OpenClaw 必须由 operator 提供以下其中一组完整环境：
   - `OPENCLAW_CONFIG_PATH=<file.yaml>` 指向 OpenClaw 自己的 agent / model / runtime config，且
   - `OPENCLAW_STATE_DIR=<dir>` 指向 OpenClaw 自己的 state（sessions / threads / cache），或
   - 显式 OpenClaw agent profile name + workspace path（具体字段命名以 OpenClaw 上游 CLI 当前规格为准，spike 阶段确认）。
   AIWorker 不默认 mint 一份 hermetic OpenClaw runtime；缺乏上述 env / 参数时 adapter `health()` 直接报 `not-configured`，`run()` 返回 `error` 类型 AgentEvent，提示 operator 补 config。
2. **Workspace 模型**：OpenClaw 的 agent workspace 由 OpenClaw 自己管理；AIWorker 把 per-conversation workspace 通过 `AgentRunInput.workspacePath` 传给 OpenClaw agent run，但**不**复制 OpenClaw workspace bootstrap、不接管 workspace 文件结构。Project Brain 通过 prompt / context 注入参与，**不**写入 OpenClaw workspace。
3. **Project overlay 只能是 bootstrap helper**：`.aiworker/executor-capabilities.json` 中如未来出现 `engines.openclaw.*`，只允许表达 “建议 OpenClaw agent profile name = X” / “建议 workspace path = $PROJECT/...” 这一类 hint；**不能**用 overlay 替换 `OPENCLAW_CONFIG_PATH` 内容、也不能在不告诉 operator 的情况下 mutate OpenClaw config 文件。
4. **只接 agent run surface**：AIWorker adapter 只调用 OpenClaw 的 agent execution API（CLI 子命令或 SDK 等价物），把事件归一化到 `AgentEvent`。**不**启用 OpenClaw 自带的 channel / webhook / gateway hosting，避免与 AIWorker gateway / channels 语义重叠：
   - OpenClaw 如果有内置 server / channel daemon，operator 必须自己关掉，或绑到不同端口 / 不同 reverse proxy；AIWorker 默认假设它没在跑。
   - AIWorker 不读 OpenClaw 的 channel webhook 注册结果，也不把 OpenClaw 注册成 fleet 内的 worker。

### Adapter 输入 / 输出契约（PLAN-093 之上的 OpenClaw 化）

| 维度 | OpenClaw 接入约定 |
|------|-------------------|
| `health()` | 仅检查 `OPENCLAW_CONFIG_PATH` 文件存在 + binary 可调用；不打开 OpenClaw 内部 session、不连其 channel daemon。 |
| `listTools()` | 返回空数组：OpenClaw 自管 tool registry。 |
| `run(input)` | 直接 spawn OpenClaw agent run（CLI 或等价 IPC），把 stdout 事件流归一化到 `AgentEvent`；`input.workspacePath` 作为 cwd / agent workspace hint 传入；`input.engineBinding` 留给 spike 阶段确定 OpenClaw 是否暴露稳定 session/thread handle。 |
| Cancel | `input.signal` 触发 OpenClaw run 子进程的 SIGINT → SIGTERM。 |
| Resume | 仅在 OpenClaw 暴露稳定 binding 时使用；否则空。 |
| Error | 区分 `not-configured` / `binary-missing` / `runtime-error` / `cancelled` 四类，对齐 `FallbackExecutor.onErrorKinds`。 |

### Spec 之外不做

- 不在 `packages/core/src/worker/executor/engines/` 下创建 openclaw 子目录；任何代码原型只放 `tmp/openclaw-spec/`。
- 不把 OpenClaw schema 加进 `executor-capabilities.json`；如未来需要 overlay hint，按 “Project overlay 只能是 bootstrap helper” 单独走 PMA。
- 不接入 OpenClaw 的 channel / webhook / gateway hosting；如未来要把 OpenClaw 跑成独立 channel server，那是 AIWorker channel adapter 的话题，不在本 plan。

### 验证

- 本 plan 不动代码；spec docs 完成即视为完成。
- 后续真正实现 OpenClaw adapter 时单独开 PMA，跑 focused executor tests + isolated OpenClaw smoke。
