# REFACTOR-015 CLI IA canonical worker/fleet/gateway command tree

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-02 11:24
- **claimedAt**: 2026-05-02 11:24
- **completedAt**: 2026-05-02 14:07
- **plan**: PLAN-062

## 描述

当前 `aiworker` CLI 仍混合了 worker-local dash-form、operator-remote root commands、gateway lifecycle 与 install commands。用户需要从命令形态推断数据域，容易把本地 worker、fleet 控制面和 gateway 进程生命周期混在一起。

本任务按 pre-1.0 策略做破坏性收敛：

1. 裸 `aiworker <cmd>` 只作为当前本地 worker 的快捷入口。
2. `aiworker worker ...` 是本地 worker 的 canonical 分组。
3. `aiworker fleet ...` 是 fleet 控制面和远端 worker 操作的 canonical 分组。
4. `aiworker gateway ...` 是 gateway 进程生命周期的 canonical 分组。
5. 1.0.0 前不保留 legacy alias、compat shim 或旧命令迁移层。

## 验收标准

1. `AGENTS.md` 明确 1.0.0 前不承诺 legacy 兼容，优先架构语义和文档一致性。
2. CLI 实现目录按 worker / fleet / gateway 归属重组，本地 worker 代码落在 `apps/cli/src/commands/worker/`。
3. 新 canonical 命令可注册并通过 argv 预处理：`worker ...`、`fleet ...`、`gateway install systemd`。
4. 旧 root 远端命令和 dash-form 本地命令不再注册：`pair`、`chat`、`logs`、`config get/set`、`enroll ...`、`config-show`、`config-set` 等。
5. `docs/cli.md`、`docs/architecture.md`、README 和相关运行时提示更新到新命令树。
6. CLI help / argv / 参数校验测试覆盖新命令树，并确认旧命令不再存在。

## 依赖

- **relates to**: FEAT-041, REFACTOR-014, PLAN-060
- **blocks**: `aiworker up` 快速路径、executor auto detection、pre-1.0 CLI 发布整理

## 笔记

- 2026-05-02 11:24：用户明确要求忘掉 legacy 兼容，1.0.0 正式发布前不为旧命令保留 alias。CLI 语义改为“裸 `aiworker` 等价于当前本地 worker 快捷入口；跨 worker / fleet.db / gateway WS operator 协议必须显式走 `fleet`；gateway 生命周期走 `gateway`”。
- 2026-05-02 14:07：已完成目录重组、命令注册树、help/argv/numeric validation、文档与测试同步。旧 dash-form 本地命令和旧 root 远端命令不再注册；root 仅作为本地 worker 快捷入口。
