# TODO-011 `aiworker init` next-steps text recommends `--engine codex` regardless of Soul

- **status**: pending
- **priority**: P3
- **owner**: unassigned
- **createdAt**: 2026-05-04 22:40
- **plan**: TBD
- **relatesTo**: FEAT-049, FEAT-052

## Description

实测 0.6.0 在每个 Soul preset（developer / hr-recruiting / finance-ops / devops-sre /
product-designer / general-assistant）下跑 `aiworker init --soul <preset>`，输出的 next-steps
固定推荐：

```text
6. Select task executor when ready: `aiworker executor select --engine codex --apply`.
7. Check executor readiness: `aiworker executor doctor --engine codex` (engine login/auth lives outside AIWorker).
```

问题：

1. **Soul-agnostic**：HR Soul / Finance Soul / Designer Soul 的常见 executor 不一定是 codex。
   "codex" 是开发场景偏好，写死在 next-steps 文案违反 FEAT-053 "Project scope = worker-bound
   business scope（不仅是 git repo）" 的产品定位
2. **与默认配置错位**：`aiworker init` 写入的 default executor 是 `http://localhost:9999`
   stub（详见 `aiworker config show`），但 next-steps 推 codex；operator 不显式 select 永远
   跑不动 executor，文案推 codex 也没解释为什么不是 claude-code / 其它 BYO engine

## Scope

调整 `aiworker init` 后的 next-steps 文案：

1. 第 6 / 7 步从写死 codex 改为引用变量，例如 `aiworker executor select --engine <YOUR_ENGINE>
   --apply`，并在下面给 1~2 行候选清单（claude-code / codex / acp / cursor / mcp / http）
2. 或在第 6 步前面加一句 "default executor is `http://localhost:9999` stub; pick a real
   engine via `aiworker executor select --engine <engine>`"
3. 或按 Soul preset 给"建议 executor"提示（developer → claude-code / codex 推荐；HR / Finance
   / Designer → claude-code / cursor / mcp 等不那么 coding-bias 的提示）

## Why this matters

- FEAT-048 ~ FEAT-053 反复强调 "executor is bring-your-own / Project scope is business scope"，
  但 init 的最后一面（next-steps）把用户拉回 "codex" 的工程师叙事
- 0.6.0 是个 minor release，CLI 文案是 user-facing；写死 codex 的 next-steps 与产品定位不一致

## Reproducer

任意 Soul preset 跑 `aiworker init` 看输出 next-steps 第 6 / 7 步。

参考 `/home/ben/projects/debug-aiworker/qa-2026-05-04/REPORT.md` 第二节末尾。
