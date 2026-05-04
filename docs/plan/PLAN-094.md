# PLAN-094 Hermes thin adapter spike

- **status**: draft
- **createdAt**: 2026-05-04 11:22
- **relatedTask**: FEAT-052

## 现状

Hermes Agent 支持 CLI/profile/cwd/context files，比较适合作为 cwd-native 或 profile-aware external executor runtime。AIWorker 不需要接管 Hermes 的 memory、skills、MCP 或 profiles。

## 方案

1. 先做 read-only spike，确认 Hermes non-interactive CLI 输出、session/resume、cwd/context 行为。
2. 保持真实 user HOME / HERMES_HOME，除非 operator 显式配置 profile。
3. AIWorker 只归一化 stream/result 到 `AgentEvent`。
4. Project Brain 通过 prompt/context 注入或 workspace hint 参与，不改 Hermes native memory。

## 范围

- spike plan。
- optional prototype adapter after approval。

## 非范围

- 不同步 Hermes skills。
- 不迁移 Hermes memory。
- 不做 Hermes isolation。

## 风险

Hermes CLI output 如果不是稳定 machine-readable，需要先上游或 wrapper 约定。

## 验证

- local Hermes smoke with harmless prompt。
- focused adapter tests with fake spawn.
