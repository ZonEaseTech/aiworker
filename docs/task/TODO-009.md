# TODO-009 Add operator-facing `aiworker brain admission propose` debug entry

- **status**: completed
- **priority**: P3
- **owner**: aiworker-maintainer
- **createdAt**: 2026-05-04 22:30
- **completedAt**: 2026-05-05 01:30
- **plan**: PLAN-106
- **relatesTo**: PLAN-101

## Description

PLAN-101 admission MVP 只暴露 `list / show / approve / reject / apply`，proposal 的写入路径
完全由 orchestrator runtime 内部 `BrainAdmissionService.propose` 完成。

实测影响：

- 裸装 0.6.0 的 operator 在没起 orchestrator / 没跑真实对话之前，**无法演示或冒烟整条
  admission 状态机**
- QA / docs 演示需要先发送一段真实对话，等 evolution / orchestrator 自然产出 proposal —— 流程长、
  不确定性高
- 当前唯一能注入 fixture 的方式是直写 worker.db，不经 zod 校验，容易写错（详见 BUG-058 的注入
  示例错过 evidence schema）

## Scope

补一个 debug-only / hidden CLI 子命令：

```bash
aiworker brain admission propose \
  --kind memory-add \
  --target memories/<topic> \
  --summary "..." \
  --rollback "..." \
  --risk low|med|high \
  --confidence 0.0..1.0 \
  --evidence @evidence.json \
  --payload @payload.json \
  --soul developer
```

要求：

- 走完整 zod 校验，与 orchestrator 内部 `propose` 等价
- 只为调试 / 文档示例 / fixture 提供：可挂在 `--debug` flag 后或 `aiworker brain admission
  propose --i-know-this-is-debug`
- 同步在 `apps/api/src/worker/brain/routes.ts` 加一条 `POST /admission` 写端点（同样 debug-only
  / dev mode），让 Worker Admin UI 演示更顺
- 测试：CLI 写入后 list / show / approve / apply 一气呵成

## Why this is TODO not BUG

- PLAN-101 设计意图是 propose 由 orchestrator 自动产出（高 confidence），手动 propose 不是
  生产形态
- 但 0.6.0 publish 后 Worker Admin Brain 视图、文档示例、QA 验证都需要可控注入入口；缺这一条
  意味着 admission MVP 的可观察 / 可演示性低于预期

## Reproducer / Context

`/home/ben/projects/debug-aiworker/qa-2026-05-04/findings/UX-3-admission-no-propose.md`
