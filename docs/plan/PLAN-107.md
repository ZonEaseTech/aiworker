# PLAN-107 CLI brief 与 init next-steps 文案修复

- **status**: completed
- **createdAt**: 2026-05-04 23:30
- **approvedAt**: 2026-05-04 23:30
- **completedAt**: 2026-05-05 02:00
- **relatedTask**: BUG-054, TODO-011

## 现状

QA-004 在 0.6.0 published 包发现两个 CLI 层小问题：

1. **BUG-054 P2**：`aiworker brain brief --task ...` 不传 `--artifact` 时 sections
   含 `artifact-summary` 段，body 输出 `- undefined: not found in brain artifact
   registry`。CLI 把 `cac` 解析出来的 `opts.artifact = undefined` 直接包成
   `[undefined]` 传给 compiler。
2. **TODO-011 P3**：`aiworker init` 后 next-steps 第 6 / 7 步对所有 Soul preset
   写死推荐 `--engine codex`，与 FEAT-053 "Project scope = worker-bound business
   scope" 定位冲突；同时 init 写入的 default executor 是 `http://localhost:9999`
   stub，文案没有澄清"必须先 select 真 engine"。

涉及文件：

| 层 | 文件 |
|----|------|
| CLI brief | `apps/cli/src/commands/worker/brain.ts`（`brain brief` 子命令） |
| Brief compiler | `packages/core/src/worker/brain/brief/compiler.ts` |
| Brief request schema | `packages/shared/src/brain/brief.ts` |
| CLI init next-steps | `apps/cli/src/commands/init/next-steps.ts`（命名以现状为准） |

## 方案

### A. BUG-054 artifactRefs 空值兜底

1. CLI `brain brief` 子命令调用 `BrainBriefCompiler.compile` 前，规范
   `artifactRefs`：

   ```ts
   const artifactRefs = (Array.isArray(opts.artifact)
     ? opts.artifact
     : opts.artifact ? [opts.artifact] : [])
     .map((s) => String(s).trim())
     .filter((s) => s.length > 0)
   ```

2. `BrainBriefCompiler` 输入 zod schema 兜底：`artifactRefs: z.array(z.string()
   .min(1)).default([]).transform((arr) => arr.filter(Boolean))`，避免未来其它
   caller 漏处理。
3. compiler 实现：当 `artifactRefs.length === 0` 时**不生成** `artifact-summary`
   section（最小变动方案）。如果 caller 显式传一个不存在的 ref，仍走原有"not
   found in registry"路径。
4. CLI snapshot test：`brief --task "x"` 不含 `artifact-summary`；`brief --task
   "x" --artifact a --artifact b` 仍正常列出 a / b。

### B. TODO-011 next-steps 文案

1. 修 next-steps 第 6 / 7 步：
   - 统一改为 `aiworker executor select --engine <YOUR_ENGINE> --apply`，下面
     列候选清单：`claude-code | codex | acp | cursor | mcp | http`。
   - 在第 5 步与第 6 步之间新增一行说明：`Default executor is a local stub
     (http://localhost:9999); pick a real engine before running tasks`.
2. 按 Soul preset 给"建议 engine"提示（仅 informational，不写死）：
   - `developer / devops-sre`：`claude-code | codex` 推荐
   - `general-assistant`：`claude-code | cursor` 推荐
   - `hr-recruiting / finance-ops / product-designer`：`claude-code | mcp` 推荐
3. 文案由 i18n / 简体中文友好（与 AGENTS.md "默认中文交流" 一致），但 next-
   steps 已是英文路径，本轮维持英文文案，仅调整内容。
4. CLI snapshot test：6 个 Soul preset 各跑一次 `aiworker init`，验 next-steps
   输出含动态 engine 候选 + Soul-specific 推荐。

## 风险

1. **brief schema 变更**：`artifactRefs` zod default + transform 改变了"未传字段
   时的形态"，但本轮不做向后兼容（用户授权），CLI 自身会先 normalize，行为可
   预期。
2. **next-steps 文案与 docs 同步**：`docs/cli.md` / README quickstart 如有引用
   "step 6: codex" 类样例需要同步；本轮检查并更新。
3. **6 个 Soul snapshot**：测试会膨胀 snapshot 数量，但与 PLAN-097 already
   established 的 Soul preset matrix 一致，可读性可控。

## 范围

- `apps/cli/src/commands/worker/brain.ts`
- `apps/cli/src/commands/init/*`
- `packages/core/src/worker/brain/brief/compiler.ts`
- `packages/shared/src/brain/brief.ts`
- focused unit + snapshot tests
- `docs/cli.md` / README quickstart（如需同步）

## 非范围

- BrainBriefCompiler 接入 orchestrator system prompt 路径（PLAN-105 非范围
  内已说明，留 follow-up）
- next-steps 文案 i18n 中文化（沿用现有英文）
- init 默认 executor stub URL 修改（FEAT-052 / FEAT-053 行为）

## 验证

- CLI `brain brief` snapshot tests（不传 / 传 1 个 / 传 2 个 artifact）
- BrainBriefCompiler unit tests（artifactRefs 空数组无 artifact-summary 段；脏
  输入被 zod normalize）
- CLI `init` 6 个 Soul preset snapshot tests
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run typecheck` / `bun run lint` 全量
- `bun run test` 全量（最终）

## 进度

- 2026-05-04 23:30：用户批准方案（CLI normalize + compiler zod 兜底 + next-
  steps 动态 engine + Soul-specific 候选）。Plan claimed BUG-054 + TODO-011。
- 2026-05-05 02:00：实施完成。
  - CLI `runBrainBrief` 加 `normalizeRepeatableStringOption` helper + 接受
    string | string[] | undefined 三种 cac 形态；空 / undefined / blank 全部
    剔除。`BrainBriefOptions.artifactRefs` 类型放宽。
  - `brainBriefRequestSchema` 在 zod transform 阶段 strip undefined / blank /
    非 string 元素；新增 2 个 schema 测试。
  - CLI brief 测试新增 2 个：不传 --artifact 时无 artifact-summary 段；单值
    --artifact 也能正确归一化。
  - `printProjectNextSteps` / `printUserScopeNextSteps` 不再写死 codex；
    `recommendedEnginesForSoul` 按 Soul preset 给主 / 备 engine 提示，候选
    `claude-code | codex | acp | cursor | mcp | http` 全列。
  - `executor doctor` `executor.config_default_stub` 文案同步去 codex 写死。
  - init.integration 测试 3 处断言更新（user / explicit / project）。
- 2026-05-05 02:00：验证通过：core 579 / shared 131 / cli 164 / api 83 / web
  59 / gateway 148 / storage 19 / gateway-proto 19 / fs-layout 20 = 1222 tests
  pass（baseline 1181）。Workspace typecheck 9/9 全绿，root lint 0 violation。
  BUG-054 + TODO-011 全部 completed。
