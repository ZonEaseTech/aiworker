# H5 God Files 分析（待排期 backlog）

- 日期：2026-05-23
- 来源：`docs/superpowers/specs/2026-05-23-zero-trust-boundary-audit-design.md`（H5，中）
- 状态：**分析与排期建议，非已批准的实现设计**。零信任整改（H1–H4 + 孪生 + H6）已闭环并合并；
  H5 是纯重构，独立排期，未实现。
- 约束基线：无安全/边界约束;目标是可维护性，行为保持。

## 定性

单文件过大不是 bug，但带来三类成本：认知负载、编辑可靠性下降、隐性耦合（不相关逻辑挤在一起、难以隔离测试）。
H5 是**纯重构**——拆分职责、不改任何行为。与 H1–H4 性质不同：无安全风险，优先级最低、可独立排期。

关键区分：**大 ≠ god file**。值得拆的是把多个不相关职责塞在一起的文件；内聚的大文件（如单一 schema）拆分反而割裂。

## 候选清单（产品代码，按体量；行数为 2026-05-23 快照）

| 文件 | 行数 | 诊断 |
| --- | --- | --- |
| `apps/cli/src/aiworker.ts` | 2481 | 真 god file。124 个函数、~40 个 CLI command 全在一个文件 |
| `apps/api/src/modes/worker.ts` | 1653 | 真 god file。daemon API 的全部 HTTP 路由 + handler + helper |
| `apps/web/src/features/settings/components/settings-dialog.tsx` | 858 | 大对话框组件，多区块混合 |
| `packages/ui/src/components/session-composer.tsx` | 814 | 大 UI 组件 |
| `packages/shared/src/soul-app/manifest.ts` | 809 | 大但**内聚**（单一职责：manifest zod schema），拆分收益低，建议不动 |
| `packages/ui/src/components/sidebar.tsx` | 712 | 大 UI 组件 |
| `apps/web/src/worker/worker-configuration-dialog.tsx` | 668 | Worker Configuration 对话框 |

## 最严重项剖析：`aiworker.ts`

把以下本应分层的东西压在一个文件：

- CLI 接线（~40 个 `cli.command(...)` 注册，集中在文件尾部 ~2249-2340）。
- 各命令业务逻辑（124 个函数：init/doctor/update/upgrade、daemon 生命周期、app
  install/enable/disable/doctor/permissions/bootstrap/create/validate/smoke、soul/worker/workspace/
  session/turn/template/files/settings/engine）。
- 边界校验器（`scanPrivateImports`/`appSourceScanDirs`/`isSecretReference` 等——H1 孪生缺口所在）。
- 更新器、脚手架、JSON 输出等工具函数。

**可能的拆分方向（示意，非定案）**：

- 按命令域拆 `apps/cli/src/commands/{daemon,app,worker,workspace,session,engine,maintenance}.ts`，
  业务函数下沉到各域模块。
- 瘦 `aiworker.ts` 只保留 CLI 入口与 `cli.command(...)` 注册（注册引用各域 action）。
- 边界校验器抽到独立 `apps/cli/src/soul-app-boundary.ts`，便于与 `scripts/check-soul-app-boundaries.ts`
  对齐（两者目前是各自实现的并行边界检查）。

`worker.ts`（daemon API）同理：按资源域拆路由/handler（apps、workers、workspaces、sessions、turns、
engine invocations、settings），瘦入口只做路由装配。

## 风险 / 收益

- 收益：中。可维护性、可测性、未来改动可靠性提升。
- 风险：中。纯搬运仍可能引入循环依赖、漏移共享 helper、破坏 CLI/API 行为。
- 前置条件：**先补回归测试再拆**。`aiworker.ts` 当前几乎无单测；无行为保持保障的大重排风险过高。

## 排期建议

1. **先补测试**：为 CLI 命令与 daemon API 的关键路径补回归/快照测试，建立行为保持基线。
2. **小步搬运**：一次只拆一个域，每步绿灯提交，避免大爆炸重排。
3. **优先顺序**：`aiworker.ts` → `worker.ts`（两个真 god file）；UI 大组件（settings-dialog、
   session-composer、sidebar、worker-configuration-dialog）按触碰频率酌情拆；`manifest.ts` 不动。
4. 真做时同样走 brainstorm → 设计 → 计划 → Subagent-Driven，每步行为保持验证。

## 非目标

- 不在零信任整改批次内做（已闭环并 push，是干净里程碑；H5 夹入无协同收益）。
- 不拆内聚的 `manifest.ts`。
- 不借拆分顺手改行为/加功能——H5 严格行为保持。
