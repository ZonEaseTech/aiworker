# REFACTOR-026 OD-style local worker reboot

- **status**: superseded
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 16:31
- **claimedAt**: 2026-05-09 16:36
- **supersededAt**: 2026-05-12 21:20
- **plan**: PLAN-192
- **relatesTo**: GOALS.md, docs/architecture.md, apps/cli, apps/api, apps/web, packages/core, packages/storage-sqlite, packages/shared

## 背景

近期 AIWorker 的 Project Brain / governance / fleet 决策把产品推进到了很重的抽象层：

1. worker 的主路径被 Brain Kernel、Journal、Gate、Admission、Case、Fleet bridge 等概念拆散；
2. 用户第一屏和 CLI 第一动作很难解释“这个 worker 到底帮我产出什么”；
3. developer / HR / PM 等业务形态被 Soul/governance 语言包裹，缺少 OD 那种 artifact-first 的清晰产品回路；
4. fleet / gateway 作为控制面继续存在会放大复杂度，应先暂停，不再牵引本轮 worker 重构。

Open Design 的参照价值不在图片/视频领域本身，而在产品语法：

- 本地 daemon 是唯一 privileged process；
- web 是 artifact 工作台；
- project folder 是真实产物归属；
- SQLite 只存 metadata / conversation / run 状态；
- skill + design system + prompt stack 是核心产品资产；
- executor CLI 是外部 teammate，daemon 只负责拼 prompt、设 cwd、收流、写入产物。

本轮目标是把 AIWorker worker 从治理抽象拉回同样清晰的 local-first worker loop。

## 目标

以 Open Design 为结构参照，从零重构 AIWorker local worker：

1. worker 的默认产品面变成 “选择业务 worker skill / domain system → 发起 work order → 外部 executor 在真实 workspace 中执行 → web 实时展示 run / event / files / case artifacts”；
2. daemon/CLI 与 web 成为第一交付面；desktop 暂不做；
3. fleet / gateway 暂停在非默认路径，不参与第一阶段设计；
4. Brain 不再优先表现为 governance kernel，而是 file-first worker context / domain system / reusable lesson 的一部分；
5. admission / review / case 只保留为产物晋升和复盘机制，不再压过 worker 的主执行体验；
6. developer、HR、project-manager 等只是内置业务领域，不把 Project 收窄成代码仓库，也不把产品做成通用 executor 平台。

## 非目标

- 不做 desktop / Electron。
- 不在第一阶段继续扩展 fleet / gateway / enrollment / remote worker。
- 不逐行复制 Open Design 源码。
- 不把 AIWorker 变成图片/视频设计工具。
- 不重新实现 executor 的 MCP / plugin / sandbox / native session。
- 不为 1.0 之前的旧 CLI/API/config 形态保留兼容 shim。

## 验收标准

1. 新 worker 体验有一条 OD-style 主路径：daemon start、web open、skill/domain 选择、work order、run stream、artifact/case 可见。
2. CLI 与 web 都消费同一套 run service，不再出现 CLI path / HTTP path / gateway path 三套心智模型。
3. worker.db 只承载 local metadata、run、conversation、artifact index、review/admission state；真实业务产物留在 workspace 文件夹。
4. 内置 developer / HR / PM worker packs 可通过文件扩展，而不是硬编码在 orchestrator 分支里。
5. 旧 Brain governance 能力被重新归位为 review / lesson promotion，而不是主执行 loop 的前置复杂度。
6. 默认文档、README、CLI help 与 Worker Web 首屏都能解释“AIWorker 是什么、下一步做什么、产物在哪里”。
7. 聚焦测试、web build、CLI bundle 和至少一个真实 local worker smoke 通过。

## 风险

- 这是产品 pivot，不是局部重构；必须先更新 GOALS / architecture，否则后续实现会继续被旧北极星拉回 governance-first。
- 现有 worker API / CLI / web 可能大面积破坏。1.0 之前允许破坏性收敛，但每个 slice 要可验证。
- OD 的源码自身也很重，不能盲目复制 server.ts 巨石；应复制产品拓扑和交互语法，再按本仓库 Bun/Hono/React 约束落地。
- 如果第一阶段仍试图保留 fleet/gateway 默认入口，复杂度会回流。

## 调查结论

- Open Design 当前 `main` 为 `4c15ea4`，描述是 local-first design product；daemon + web + SQLite + project files + skills/design-systems 是主干。
- OD 当前浅克隆统计：113 个 `SKILL.md`、145 个 `DESIGN.md`、96 个 prompt-template 文件。README 展示的“31 skills / 72 design systems”是产品口径，不是源码总数。
- OD 的 daemon run model 是 `/api/runs` 创建 run，`/api/runs/:id/events` 通过 SSE 续传事件，`/api/runs/:id/cancel` 取消；web provider 直接消费同一 run service。
- AIWorker 当前 worker 已有 run/task、conversation、journal、case、admission、executor adapter、web routes，但主路径被治理概念打散，缺少一个 artifact-first worker studio。

## 建议分期

详见 PLAN-192。本轮已按用户授权进入 S0，先完成产品北极星、目标架构、README/CLI 文档的方向重置。

## Superseded

This reboot plan is no longer a current implementation constraint. The active
architecture is Host / Soul App dual autonomy, tracked by FEAT-060..065 and
PLAN-284..289. Historical Open Design mappings and fleet/gateway deferral notes
must not guide new CLI, Web, API, or developer onboarding work.
