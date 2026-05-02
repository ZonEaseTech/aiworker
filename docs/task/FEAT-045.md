# FEAT-045 Worker quick start `aiworker up`

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-02
- **claimedAt**: 2026-05-02 19:09
- **completedAt**: 2026-05-02 19:19
- **plan**: PLAN-063

## 描述

当前本地 worker 首次使用路径已经拆成 `init`、`doctor`、`executor doctor`、`run --dry-run` 和 `serve`，但新用户仍需要理解顺序和何时处理 executor。新增 `aiworker up` 作为本地 worker 的快速启动路径，让 root shortcut 与 canonical worker tree 保持一致：

- `aiworker up`：本地 worker 快捷入口。
- `aiworker worker up`：本地 worker canonical 入口。

`up` 负责把安全初始化、能力检查、executor readiness 提示和 worker HTTP/admin 启动串成一条命令，但不引入 fleet/gateway 语义，也不把 executor 原生能力混入 brain capability。

## 验收标准

1. 注册 `aiworker up` 与 `aiworker worker up`；不新增 `aiworker fleet up` 或 `aiworker gateway up`。
2. 未初始化 project 时，`up` 复用 `init` 的 Soul 选择规则：非交互 brand-new project 必须显式传 `--soul <preset>`，不能悄悄生成 stub worker。
3. 已初始化 project 或 explicit/user scope 下，`up` 不覆盖现有 `.aiworker/`、`worker.db`、identity、token、secret ref 或 executor capability manifest。
4. `up --dry-run` 只输出将执行的阶段和预检结果，不写文件、不启动 HTTP server、不打开浏览器。
5. `up` 复用现有 `serve` 能力和参数，包括 `--port`、`--host`、`--gateway`、`--gateway-token`、`--no-reconnect`、`--no-serve-web`、`--open`、`--no-open`。
6. `up` 做 executor readiness 检测与清晰提示，但本阶段不自动选择 engine、不写 engine project config；executor MCP/engine-native 配置仍通过 `aiworker executor ...` 完成。
7. help、测试和文档体现 root shortcut = worker 语义，并明确 1.0.0 前不做 legacy command 兼容。

## 依赖

- **relates to**: FEAT-036, FEAT-043, FEAT-044, REFACTOR-015
- **blocks**: 一条命令完成本地 worker 首次启动体验、后续 executor engine 引导增强

## 笔记

- 2026-05-02：用户确认 root `aiworker ...` 可视为 `aiworker worker ...` alias；其他入口继续细分为 `worker`、`fleet`、`gateway`。
- 2026-05-02：用户明确 1.0.0 前不考虑 legacy 兼容，因此 `up` 只落新命令树，不增加旧命令 shim。
- 2026-05-02 19:19：已完成 `aiworker up` / `aiworker worker up`，覆盖 dry-run、brand-new project、serve 参数透传、bootstrap opt-out、help/docs/changelog 与测试。
