# FEAT-046 Worker local brain activation and lifecycle

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-03 13:03
- **claimedAt**: 2026-05-03 13:03
- **plan**: PLAN-073

## 描述

`aiworker init --soul <preset>` 已经会生成项目级 Soul、persona、memory index、`skills/`、`memories/` 和 brain/runtime capability 草案。但首次写入 `worker_config` 时仍缺少默认 brain source，导致 persona 文件能被直接注入 system prompt，而 runtime 层的 filesystem skill 扫描、memory search、pre-compaction memory 写入没有默认挂载点。

本任务把 worker 本地 filesystem brain 激活成一等 runtime 能力，并保持 Brain capability 与 Executor capability 的隔离边界。

## ActiveForm

默认激活本地 filesystem brain，并按小阶段强化 worker brain 生命周期。

## Dependencies

- **blocked by**: none
- **blocks**: durable worker memory, filesystem brain skill visibility, Soul-backed worker behavior, future brain/runtime capability commands
- **relates to**: FEAT-031, FEAT-039, FEAT-043, FEAT-044, FEAT-045, QA-002, PLAN-012, PLAN-041

## Acceptance Criteria

1. 新 seed 的 worker 默认挂载一个 writable local filesystem brain source，且不访问外部服务。
2. 默认 brain source 通过 `@zonease/aiworker-fs-layout` 解析路径：project scope 使用 `<project>/.aiworker/`，user / explicit scope 保持 worker home 下的 brain layout。
3. Brain / Executor 边界不回退：executor MCP、engine plugin、engine-native skill projection 仍只走 `.aiworker/executor-capabilities.json` 与 `aiworker executor ...`。
4. runtime 与 operator surface 能看清本地 brain 状态，避免 “Soul 存在但 brain 是空的”。
5. 长期计划记录 diagnostics、brain inspection commands、admission gates 和真实 Codex-backed 验证等后续阶段。

## Notes

- 2026-05-03 13:03：调查在 `/Users/ben/projects/aiben` 复现缺口：Soul 文件和 capability 草案存在，`aiworker doctor` 通过，但 `aiworker config show` 仍显示 `brains: []` 和空 `brainWriteTarget`。
- 2026-05-03 13:03：S1 已实现，新 seed worker 默认写入本地 filesystem brain。已初始化且显式为空的旧 config 本阶段不迁移。
- 2026-05-03 13:28：S2-S5 已完成。worker info、brain test、CLI 只读 inspection 均可展示 `local-filesystem` 的 health / home / writeTarget；admission boundary 已写入架构文档；`/Users/ben/projects/aiben` 已完成 Codex-backed worker 真机验证。
