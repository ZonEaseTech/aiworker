# PLAN-117 Admission governance bridge and bypass guardrail

- **status**: completed
- **createdAt**: 2026-05-06 00:45
- **approvedAt**: 2026-05-06 00:45
- **completedAt**: 2026-05-06 01:20
- **relatedTask**: BUG-068, BUG-074

## 现状

DOC-005 / PLAN-115 将 Brain 定位为 Governance Kernel：durable memory /
policy mutation 必须回到 AIWorker admission，而不是 executor native memory。
当前代码仍有三处差距：

- `aiworker brain admission propose` 已存在，但在 CLI help 和命令注册中仍标为
  TODO-009 debug-only，并要求 `--i-know-this-is-debug`。这让 LLM-facing 路径不可
  发现、不可被视为正式入口。
- `AGENT.md` / `SOUL.md` 初始化模板没有明确告诉 LLM：长期记忆、policy、brain
  skill proposal 必须使用 `aiworker brain admission propose`，不能写入 engine-native
  memory 后宣称 AIWorker 已提交。
- Orchestrator 不检测 assistant reply 声称 "proposal submitted / remembered /
  persisted" 但 `brain_admission_proposals` 没有新增 row 的情况；Worker Admin 空
  pending admissions 状态也没有提示 operator 这是 governance bypass 风险。

## 方案

1. **Promote admission propose**
   - 去掉 CLI `--i-know-this-is-debug` 强制 gate。
   - 更新 root + `worker brain admission propose` help：正式入口，用于提交
     operator-approved durable Brain mutation proposal。
   - 保留原有 zod、secret redaction、worker.db 写入路径；不新增 DB migration。

2. **LLM guidance**
   - `aiworker init` 生成的 `AGENT.md` / `SOUL.md` 增加 "Brain admission" 指引。
   - 指引只说明 governance 路径与 CLI 形态，不把 admission 变成领域 workflow。
   - 明确 executor native memory 不是 canonical AIWorker Brain。

3. **Bypass guardrail**
   - Orchestrator 在每轮执行前后比较 admission proposal count。
   - 如果 assistant reply 包含 admission / long-term memory success claim，但本轮没有
     新增 AIWorker admission row，则 emit `brain.governance.bypass_suspected`。
   - 进程内记录最近 warning，并在 `brainSummary.admissions.bypassRisk` 暴露。
   - Worker Admin pending admissions 空状态显示该 warning hint。

## 风险

1. **CLI propose 被误当作 apply**：propose 只写 pending row，不落 filesystem；approval /
   apply 仍由 operator 明确执行。
2. **启发式误报**：claim detector 只在强 admission / memory success 词命中且 DB delta=0
   时触发，payload 中标注 heuristic 与 observe-only，不阻断执行。
3. **既有模板不自动迁移**：本 slice 只影响新 init；旧 scope 需要 operator 审阅后手动更新。

## 范围

- `apps/cli/src/aiworker.ts`
- `apps/cli/src/help.ts`
- `apps/cli/src/commands/worker/brain.ts`
- `apps/cli/src/commands/worker/init.ts`
- `packages/core/src/worker/orchestrator/service.ts`
- `packages/core/src/worker/brain/summary.ts`
- `packages/shared/src/fleet/worker-info.ts`
- `apps/web/src/worker/features/brain/brain-panel.tsx`
- Focused tests for CLI admission, init templates, orchestrator guardrail, and brain summary.

## 非范围

- 不实现 heavy Brain decision LLM。
- 不把 executor native memory 纳入 AIWorker canonical Brain。
- 不新增 admission materializer kind。
- 不修改 fleet.db / worker.db schema。
- 不修 Codex continuity / tool-call observability（BUG-069 / BUG-070）。

## 验证

```bash
bun run --filter '@zonease/aiworker-cli' test apps/cli/src/commands/worker/brain-admission.test.ts apps/cli/src/commands/worker/init.integration.test.ts apps/cli/src/aiworker.test.ts
bun run --filter '@zonease/aiworker-core' test packages/core/src/worker/orchestrator/service.claude-code.test.ts packages/core/src/worker/brain/summary.test.ts
bun run --filter '@zonease/aiworker-web' test apps/web/src/worker/api.test.ts
bun run typecheck
bun run lint
git diff --check
```

## 进度

- 2026-05-06 00:45：立项并 claim BUG-068 / BUG-074；按 PLAN-115 第 2 阶段实施。
- 2026-05-06 01:20：完成正式 admission propose 入口、init 模板 LLM guidance、
  bypass warning event + brainSummary / Worker Admin 空状态提示。验证通过：
  `bun test ./apps/cli/src/commands/worker/brain-admission.test.ts ./apps/cli/src/commands/worker/init.integration.test.ts ./apps/cli/src/aiworker.test.ts`
  (65 pass), `bun test ./packages/core/src/worker/orchestrator/service.claude-code.test.ts ./packages/core/src/worker/brain/summary.test.ts ./packages/core/src/worker/gateway-client/dispatcher.test.ts`
  (24 pass), `bun test ./apps/api/src/worker/brain/routes.test.ts ./apps/web/src/worker/api.test.ts`
  (18 pass), `bun run typecheck`, `bun run lint`, `bun run test`, `bun run check`,
  `git diff --check`。
