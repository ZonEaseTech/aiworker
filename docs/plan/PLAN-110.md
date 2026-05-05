# PLAN-110 Decision pipeline 强化（Soul guard / heuristic / LLM evaluator）

- **status**: pending
- **createdAt**: 2026-05-05 04:25
- **relatedTask**: BUG-063, BUG-064, TODO-013

## 现状

QA-005 在 9 Soul × 10 prompt 真实采样里发现 decision pipeline 三个互锁缺陷：

1. **BUG-063 P1**：vague developer-Soul prompt（"我代码挂了。"）触发 ≥12 轮 brute-force Bash tool_call、跨越 cwd 扫描调试 campaign 的 `findings/dump/run/`，最终 90s timeout 0 byte 返回。横向 9 Soul 比对：仅 developer 出现工具死循环；其它 8 个 Soul 在 F-class prompt 下都正确反问。
2. **BUG-064 P2**：`packages/core/src/worker/orchestrator/intent-classifier.ts:199-205` heuristic risk regex 缺 git/db/money/ops 关键动词（`force-push`、`force kill`、`reset --hard`、`drop`、`落账 直接`、`不审核`、`立即上线`等），把高风险写动作标 `risk=low`，downstream `quality_gate.threshold` 从 8 降到 5（实际 LLM 仍拒绝，但 audit 风险信号污染）。
3. **TODO-013 P2**：启用 LLM evaluator 后 intent + capability + main + quality（含 retry）4-5 次 sub-process 串行 spawn；single prompt wall-clock > 90s，默认 `--timeout-ms` 不够。`packages/core/src/worker/orchestrator/service.ts:251` await intent → `:264` capability sync → `:350` await quality 全是顺序。

涉及文件：

| 层 | 文件 |
|----|------|
| Soul presets | `packages/shared/src/soul/modules/{developer,devops-sre,finance-ops,...}.ts` |
| intent classifier | `packages/core/src/worker/orchestrator/intent-classifier.ts` |
| capability classifier | `packages/core/src/worker/orchestrator/capabilities.ts` |
| quality gate | `packages/core/src/worker/orchestrator/quality-gate.ts` |
| orchestrator service | `packages/core/src/worker/orchestrator/service.ts` |
| tool policy | `packages/core/src/worker/orchestrator/policy.ts` |
| claude-code spawn | `packages/core/src/worker/executor/engines/claude-code/executor.ts` |
| process manager | `packages/core/src/worker/executor/process-manager.ts` |
| 现有测试 | `intent-classifier.test.ts`、`quality-gate.test.ts`、`capabilities.test.ts`、`service.policy.test.ts`、Soul module tests |

## 方案

### A. BUG-063 — Soul 模板 clarify guidance（横切 9 Soul）

`packages/shared/src/soul/modules/<id>.ts` 全部 9 个 module 的 `SOUL.md` 模板末尾（`riskPolicy.riskNotes` 之前）追加新 section：

```
## 模糊或缺失上下文

收到不完整 prompt（< 20 字 / 无可定位 artifact / 仅“挂了/失败/不行”等）时：
- 先用一句话反问关键缺失信息（具体报错文本、复现步骤、最近改动 / 时间窗口 / 责任人）
- 不直接调 tool 探索；让用户先补齐上下文
- 不要为了避免反问而扩大 cwd 搜索范围
```

每个 Soul 措辞按 manifest tone 微调（developer 措辞偏证据/复现，hr 偏候选人/岗位上下文，等）。

`developer.ts` 补 explicit clarifying 列表："具体报错文本"、"最近改动文件"、"是否能在干净环境复现"。

### B. BUG-063 — orchestrator dead-loop detector

新增 `DeadLoopDetector` 工具于 `packages/core/src/worker/orchestrator/dead-loop.ts`：
- 在 `collectAssistantText` 事件循环里每收到 `tool_call` 类事件 +1 计数；每收到 `assistant_message_delta`（任何 text）即重置计数。
- 阈值 `DEAD_LOOP_TOOL_CALL_THRESHOLD = 8`，可被 worker config `orchestrator.deadLoop.threshold` 覆盖（schema + zod）。
- 命中阈值时调用 `signal` 的 `controller.abort('dead-loop-suspected')`，并 emit `orchestrator.aborted` 事件 reason=`dead-loop-suspected:tool_call=N,no_text_delta`。
- 默认开启；config 加 `orchestrator.deadLoop = { enabled: boolean; threshold: number }`，默认 `{ enabled: true, threshold: 8 }`。

### C. BUG-063 — cwd policy（best-effort，scope.json 边界）

由于 claude-code engine 走 `--dangerously-skip-permissions`，AIWorker 只能在 spawn 边界做 best-effort：
- `packages/core/src/worker/executor/engines/claude-code/executor.ts` spawn 时 `cwd = workspacePath`（已经如此）。本轮 explicit 加注释：cwd 是 best-effort isolation；engine 本身可以走绝对路径越过 cwd。
- 不做 Bash hook 拦截（设计层面 AIWorker 不当 executor 平台，详见 AGENTS.md "能力边界"）。
- Soul template 改造（A 项）解决 root cause：让 LLM 自己不去 brute-force 探索。
- 在 `service.ts` Soul system prompt 注入路径加一句："`<workspace>` 是项目根；不要主动 ls/grep `<workspace>` 之外的目录。" 由 `composeSystemPromptText` 后面附加（PLAN-105 helper 已落地）。这是 LLM 行为约束，非硬隔离。

### D. BUG-064 — heuristic intent risk 词典扩展

`intent-classifier.ts:200` `inferRisk` 拓展 regex：

```ts
function inferRisk(text: string, intent: WorkerIntent): WorkerRisk {
  const HIGH = [
    /prod(?:uction)?|deploy|delete|reset|secret|token|key|生产|部署|删除|重置|密钥|令牌/i,
    /force[- ]?push|force[- ]?kill|--force\b|reset --hard|drop\s+(?:table|database|index)|truncate/i,
    /落账\s*直接|代扣个税|跳过\s*(?:审批|审核|dry[- ]?run|review|确认)|不\s*(?:审核|review|确认|通知|A\/B\s*test)/i,
    /立即上线|强制\s*(?:上线|发布|执行)|直接(?:落账|执行|上线)|不要\s*(?:确认|审批)/i,
  ]
  if (HIGH.some(re => re.test(text))) return 'high'
  if (intent === 'code_work' || intent === 'config_admin') return 'medium'
  return 'low'
}
```

测试：BUG-064 expected 4 条 prompt（"force-push main"、"force kill 重启主库"、"50 万代扣个税直接落账"、"立即上线，不要 A/B test"）全部 → `risk=high`，且不污染既有低风险测试用例。

### E. TODO-013 — 决策管线并行 + timeout 调整

1. **intent + capability 并行**：service.ts L251-274 的 `await classifyIntentDecision` → `await snapshot` → `planCapabilities` 顺序串行。`planCapabilities` 实际依赖 `intentDecision.intent`，所以无法天然并行。但 `await contextManager.buildSystemPrompt` + `capabilityRegistry.snapshot` 可以与 `classifyIntentDecision` 同时跑：用 `Promise.all([classifyIntentDecision(...), buildSystemPrompt(...), snapshot(...)])`。intent 完成后再 plan capabilities。可以省 ~30% wall-clock。
2. **timeout auto-extend**：在 service.ts run 入口检测 `config.orchestrator.decisionPipeline.intentClassifier.evaluator === 'llm'` 或 `qualityGate.evaluator === 'llm'`：
   - 当用户传 `--timeout-ms` < 240_000 时 emit warn "LLM evaluator 启用，建议 timeout-ms ≥ 240000"，并把内部 abort timer 默认拉到 `Math.max(userTimeout, 240_000)`。
   - 不强制覆盖，但内部 grace。
3. **graceful degradation**：`evaluateQualityGate` 内部如果 LLM 调用 wall-clock > 半个 budget → `Promise.race(llmCall, timeoutPromise)`，timeout 触发 fallback heuristic + emit reason `llm-budget-exhausted`。
4. **prompt cache**：claude-code spawn 已经走 `--append-system-prompt`，相同 system prompt 对同进程复用；本轮不引入跨 spawn 缓存（每次 spawn 是新进程，用户层面无显著收益）。document only。

config schema：`packages/shared/src/worker.ts` `orchestrator.decisionPipeline` 增加 `qualityGate.budgetMs?: number`，默认 30_000；intent classifier 同样。

## 风险

1. **dead-loop 阈值默认值 8**：可能误伤合法多 step tool 工作流（开发者会让 LLM 跑 grep+read+edit+test 序列）。default false-positive 风险存在；通过 worker config flag 让 advanced operator 调高/关闭，并且只在"无任何 text delta"才计数（有 streaming text 的工作流不受影响）。
2. **Soul template 横切改 9 文件**：模板字符串修改不会破坏现有 zod schema（templates 在 `briefHooks.boilerplate` / `manifest.persona` 字段），但改前先跑全量 Soul module 测试避免误改 frontmatter。
3. **intent 词典扩展误报**：`reset` 关键词也可能命中"reset password"等低风险场景；通过 `reset --hard`、`reset main` 这样的精确组合 regex，而不是单纯 `reset`。
4. **timeout auto-extend**：用户可能想用短 timeout 做主动取消；本轮不把 timeout 强制改大，只在 evaluator=llm 时 emit warn + 内部 grace；用户传 `--timeout-ms` 仍然是上限。
5. **config schema 升级**：`orchestrator.deadLoop` 是新字段；老 config 解析默认值即可，不需要 migration。

## 范围

- `packages/shared/src/soul/modules/*.ts`（9 文件 + tests）
- `packages/core/src/worker/orchestrator/intent-classifier.ts`
- `packages/core/src/worker/orchestrator/quality-gate.ts`（budget 降级）
- `packages/core/src/worker/orchestrator/service.ts`（dead-loop 接入 + 并行化）
- `packages/core/src/worker/orchestrator/dead-loop.ts`（新文件）
- `packages/shared/src/worker.ts`（config schema）
- `packages/core/src/worker/executor/engines/common/run-input.ts`（如需追加 cwd 边界 system 提示，PLAN-105 helper 复用）
- focused unit + integration tests
- `docs/cli.md` 增补 `orchestrator.deadLoop` config 段

## 非范围

- 真正硬性 cwd sandbox（设计层面 AIWorker 不做 executor 隔离，详见 AGENTS.md 能力边界）
- LLM evaluator 跨 spawn prompt cache（claude-code engine 自己负责）
- 多 model fallback / cheaper-model evaluator routing

## 验证

- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run typecheck` / `bun run lint` 全量
- 单元测试：dead-loop detector hit / 重置；intent risk 4 条新 prompt → high；Soul module 9 个均含"模糊或缺失上下文"段；orchestrator parallel 不破坏现有事件序列（先 intent_decision 再 capability_decision 顺序保留）。

## 进度

- 2026-05-05 04:25：plan created。
