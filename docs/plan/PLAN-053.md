# PLAN-053 优化 init 后引导与 Soul 能力测试流程

- **status**: completed
- **createdAt**: 2026-05-01 12:34
- **approvedAt**: 2026-05-01 12:39
- **relatedTask**: FEAT-043

## 现状

1. `apps/cli/src/commands/init.ts` 现在内嵌 9 个内置 Soul preset 和 `customize` 路径。`aiworker init --soul developer` 会生成非 stub 的 `SOUL.md`、`AGENT.md`、`policy.json`、`toolsets.json`、`capability-packs.json`，并创建 `.aiworker/local/worker.db`。
2. `runInit()` 成功后只打印 `project-scope worker ... ready`，前面的 preflight 只告诉用户会创建或保留哪些文件，不告诉用户下一步应该做什么。
3. `docs/cli.md` 有 init、scope、run、serve 的分散说明，但 CLI 输出没有把它们串成首次使用路径。
4. 当前没有 `soul` 子命令。用户无法直接列出所有 Soul 的职责、默认 packs/toolsets 或风险策略；只能读源码或初始化后看生成文件。
5. `apps/cli/src/commands/init.integration.test.ts` 覆盖了 developer preset、dry-run、非交互缺 `--soul`、no-overwrite 和外部 agent 文件保留，但没有遍历所有内置 Soul，也没有验证 registry 完整性。
6. FEAT-039/PLAN-041 仍是主线任务，当前切片应只补 onboarding 和能力可见性，不提前实现 S3 的 Skill/MCP/Toolset validation。

## 方案

1. **抽出 Soul registry**
   - 新增 `apps/cli/src/soul/presets.ts`，导出 `BUILTIN_SOUL_PRESETS`、`CUSTOMIZE_SOUL_ID`、`findBuiltinSoul()`、`supportedSoulIds()`、`toSelectedSoul()`、类型定义。
   - `apps/cli/src/commands/init.ts` 只保留 init 流程、prompt 与 seed 生成，复用 registry。

2. **补 init 成功后的 next steps**
   - 在 project-scope init 成功后打印 4-6 行短引导：
     - `aiworker scope`
     - 查看 `.aiworker/SOUL.md` / `.aiworker/AGENT.md`
     - `aiworker run --message "hello" --dry-run`
     - 配好 executor 后 `aiworker run --message "..."`
     - 需要 HTTP/UI 时 `aiworker serve --port 9217`
     - 需要 fleet 时再启动或连接 gateway
   - user/explicit scope 也给对应短提示，但不提项目文件。
   - 保持输出不泄漏 master key 或 bootstrap token 以外的敏感内容。

3. **新增 Soul 能力查看命令**
   - 在 `apps/cli/src/aiworker.ts` 注册：
     - `aiworker soul list`
     - `aiworker soul show <preset>`
   - 新增 `apps/cli/src/commands/soul.ts`：
     - `list` 输出 preset id、label、description、packs、toolsets。
     - `show` 输出 responsibilities、boundaries、communicationStyle、riskPolicy、outOfScope、packs、toolsets。
   - `customize` 在 list 中展示为交互路径，但 `show customize` 说明它需要通过 init wizard 生成。

4. **补齐测试矩阵**
   - 单元测试 registry：每个 preset 必须有非空 responsibilities、boundaries、packs、toolsets，id 唯一，help 中列出的 preset 与 registry 一致。
   - CLI integration 遍历所有内置 preset：
     - `init --dry-run --soul <preset>` 不写文件，输出 Soul 行。
     - `init --soul <preset>` 生成五个能力文件，并校验 JSON 中 `soul` / `soul.preset` 与 preset id 一致。
   - `soul list/show` 测试输出包含关键能力字段。

5. **更新文档**
   - `docs/cli.md` 的 init 段增加 “初始化后下一步” 小节。
   - `docs/cli.md` 新增 `aiworker soul list/show` 段落。
   - FEAT-039/PLAN-041 不做大范围改写，只在 FEAT-043 完成时补一条关联进展。

## 风险

1. **CLI 输出变啰嗦**：next steps 必须短，避免每次 re-init 都刷一大段文档。可以只在创建新 project worker 或首次补齐 layout 时输出完整提示，已存在 worker 时输出更短诊断。
2. **把 draft 能力误说成已验证能力**：当前 packs/toolsets 仍是草案，输出里要明确 `status: draft` / `validation: pending`，避免用户以为外部 MCP/Skill 已可用。
3. **测试耗时增加**：遍历 9 个 preset 会多跑多次 CLI init。应复用现有 integration cleanup，保持聚焦在 CLI 包，避免全仓 gate 成本失控。
4. **与 FEAT-039 S3 重叠**：本计划只展示和静态校验能力草案，不实现 Skill/MCP/Toolset 的真实启用与 validation。

## 工作量

预计改动 5-7 个文件：

- `apps/cli/src/commands/init.ts`
- `apps/cli/src/soul/presets.ts`（新增）
- `apps/cli/src/commands/soul.ts`（新增）
- `apps/cli/src/aiworker.ts`
- `apps/cli/src/commands/init.integration.test.ts`
- 可能新增 `apps/cli/src/commands/soul.test.ts`
- `docs/cli.md`

聚焦验证：

- `bun test --timeout=15000 apps/cli/src/commands/init.integration.test.ts`
- `bun test apps/cli/src/commands/soul.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`

## 备选方案

1. **只改 docs，不改 CLI 输出**：成本低，但解决不了刚执行完 init 的即时迷路问题，不推荐。
2. **生成 `.aiworker/NEXT_STEPS.md`**：方便留档，但会新增非权威说明文件，且容易漂移；当前仓库规则要求不创建非必要说明文件，不推荐。
3. **直接做 S3 capability validation**：更完整，但范围明显变大，会吞掉当前 onboarding 小切片；建议后续按 PLAN-041 S3 单独推进。

## 批注

- 2026-05-01 12:34：根据用户反馈创建方案。关键判断：先把 “用户下一步怎么走” 和 “Soul 当前声明能力是什么” 做清楚；真实 Skill/MCP/Toolset validation 留给 PLAN-041 S3。
- 2026-05-01 12:39：用户批准，开始实现。
- 2026-05-01 12:47：实现完成。验证通过：`bun test --timeout=30000 apps/cli/src/soul/presets.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/init.integration.test.ts`、`bun run --filter '@zonease/aiworker-cli' typecheck`、`bun run lint`、`git diff --check`。`bun run --filter '@zonease/aiworker-cli' test` 仍有两处非本次失败：`aiworker-bin-shim.test.ts` 的 macOS `/var` vs `/private/var` 路径断言，以及整包运行时 `common.test.ts` 的 mock 顺序隔离问题（单跑通过）。
