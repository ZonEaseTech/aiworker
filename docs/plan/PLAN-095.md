# PLAN-095 OpenClaw configured runtime spec

- **status**: draft
- **createdAt**: 2026-05-04 11:22
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
