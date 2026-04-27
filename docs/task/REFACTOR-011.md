# REFACTOR-011 fs-layout 引入 project scope 解析 + project layout 模板

- **status**: completed
- **priority**: P1
- **owner**: PLAN-023
- **createdAt**: 2026-04-27 18:30
- **claimedAt**: 2026-04-27 19:00
- **completedAt**: 2026-04-27 19:15
- **plan**: PLAN-023

## 描述

`packages/fs-layout/src/index.ts` 当前只支持 user 级 `~/.aiworker/workers/<workerId>/`。本任务把 layout 升级为「user / project / 显式」三层 scope 解析：

1. 新增 `resolveProjectRoot(cwd)`：从 cwd 向上找包含 `.aiworker/` 的最近祖先；遇到 git root 或文件系统根停止。
2. 新增 `resolveAiworkerScope(opts?)`：返回 `{ scope, home }`，优先级：CLI `--aiworker-home` > `AIWORKER_HOME` env > project root > `~/.aiworker`。
3. `resolveAiworkerHome()` / `resolveWorkerHome()` / `resolveBrainHome()` 等内部转调 scope 解析；签名保持兼容。
4. 新增 project layout 模板：`<project>/.aiworker/{AGENT.md, SOUL.md, USER.md, MEMORY.md, ROLLUP.md, skills/, memories/, mcp.json, local/{worker.db, workspaces/, identity.json, .env}}`。`local/.gitignore` 强制写入。
5. project 模式下 `resolveWorkerHome(workerId)` 退化为 `<project>/.aiworker/`（无 `workers/<id>/` 中间层），因为「一 project 一 worker」。
6. 新增 `ensureProjectAiworker(opts)`：幂等创建 project layout（含 .gitignore 模板）；与 `ensureWorkerHome(workerId)` 保持互不干扰。

不在本任务的范围（移交其他 task）：

- CLI 命令（`aiworker init` / `aiworker scope` 改造）→ FEAT-036
- orchestrator 注入 SOUL/AGENT/MEMORY → Phase C
- brain provider 项目级 inherit → Phase D
- secrets vault 多层 fallback → Phase D

## 进行时描述

重构 fs-layout 引入 project scope

## 依赖

- **blocked by**: (无)
- **blocks**: FEAT-036

## 笔记

关键不变量：
- `AIWORKER_HOME` 显式设置 = 最高优先（兼容容器/systemd 路径）
- project 探测**仅在未显式设值时启用**（确保零回归 systemd / docker 部署）
- worker.db 物理路径决定权由 `WORKER_DB_PATH` 持有（`packages/core/src/config/worker.ts:38`），fs-layout 不接管它；本任务只确保 fs-layout 默认值在 project 模式下指向 `<project>/.aiworker/local/worker.db`

### 2026-04-27 19:15 完成

落地的 API：
- `resolveAiworkerScope(opts)` 返回 `{ scope, home, projectRoot?, source }`，优先级 cli-flag > env > project-detect > user-default
- `resolveProjectRoot(cwd)` 同步算法，遇 `.aiworker/` 命中、遇 `.git/` 无 `.aiworker/` 即停止（不跨 git 边界）
- `ensureProjectAiworker(projectRoot)` 幂等创建 project layout（含 `local/.gitignore = "*\n!.gitignore\n"`、`.aiworker/.gitignore = "local/\n"`、persona/skills/memories/mcp.json/local 全套）
- `resolveWorkerHome` / `resolveBrainHome` / `resolveWorkspacesRoot` 在 project 模式下退化为「无 workers/<id>/ 中间层」；user/explicit 模式保持 `<home>/workers/<id>/...`
- `ensureWorkerHome` 在 project 模式下变 no-op（仅创建 workspaces dir），persona docs 由 `ensureProjectAiworker` 负责
- 新增 `resolveRollupMdPath` / `resolveMcpJsonPath` 占位（PLAN-021 Phase D/E 启用）
- 新增 `projectAiworkerExists(projectRoot)` 助手

验证：
- `bun run --filter '@zonease/aiworker-fs-layout' test` → 16/16 pass，含 explicit/env/project/user 优先级、git boundary、ensure 幂等、user vs project workerHome 退化、ensureWorkerHome project no-op
- 全 monorepo `bun run typecheck` → 9/9 pass，下游 brain factory（`resolveBrainHome` 调用方）零改动通过
- `bun run lint` → pass
