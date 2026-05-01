# PLAN-051 Orchestrator 控制执行器与任务执行器解耦

- **status**: completed
- **createdAt**: 2026-04-30 20:05
- **approvedAt**: 2026-05-02
- **completedAt**: 2026-05-02
- **relatedTask**: FEAT-042

## 当前保留原因 / Current Scope

本 plan 已完成。它不是旧 capability projection 需求，而是 Orchestrator control-plane 与 task executor 的边界拆分，最终实现覆盖 config schema、secret hydration、worker info diagnostics 和 focused tests。

## 现状

FEAT-038 / PLAN-039 已落地 worker 决策管线：

1. Intent classifier 默认 heuristic，可选 `llm` evaluator。
2. Quality gate 默认 heuristic，可选 `llm` evaluator，并支持一次 repair。
3. Compaction / memory flush 已通过 suppressed executor run 生成摘要。
4. 所有 LLM control calls 当前都复用 `this.deps.executor`，也就是 worker 主任务 executor。

这个 MVP 行为可以保留，但必须被视为兼容 fallback，而不是最终架构边界。

## 问题

Orchestrator 是上游 brain/control plane，task executor 是下游执行面。复用主 executor 有几个风险：

1. **能力耦合**：如果主 executor 是 Codex / Claude Code / Cursor 这类任务型 engine，短 JSON 分类和质量评审会被迫走同一 engine。
2. **成本耦合**：控制面判断通常适合小模型或低成本 HTTP executor，没必要总用主任务模型。
3. **副作用耦合**：控制面 run 不应继承会执行文件编辑、shell、MCP 写操作等任务工具能力。
4. **认证耦合**：主 executor 可能依赖用户本机 CLI 登录态；控制面更适合可审计的 worker-owned provider。
5. **诊断不清晰**：当 classifier/gate 出错时，很难判断是 control-plane evaluator 失败，还是主任务 engine 失败。

## 方案

### 1. Control Executor Resolver

新增统一 resolver：

- 输入：`WorkerConfig.executor`、`WorkerConfig.orchestrator.decisionPipeline.executor`。
- 输出：`controlExecutor` 和 `taskExecutor`。
- 默认：未配置 control executor 时，`controlExecutor = taskExecutor`，保持 FEAT-038 MVP 行为。
- 显式配置：control executor 可使用 `http` 或其他轻量 engine，并能独立配置 model、timeout、fallback。

### 2. Control Call 边界

以下调用统一改走 control executor：

- intent LLM classifier；
- quality gate LLM evaluator；
- quality repair；
- compaction summary；
- memory flush summary；
- 后续 retrospect / proposal reviewer。

主任务 response generation 继续走 task executor。

### 3. Safety Defaults

Control executor 默认应偏保守：

- temperature 默认为 0；
- 不暴露 task tools；
- 不继承会造成文件/命令副作用的 native tool 权限；
- 默认只传必要 messages、model、signal、workspace hint；
- 后续如需要 workspace，应优先只读或 descriptor-only。

### 4. Config / Schema / Diagnostics

同步覆盖：

- worker config schema；
- secret ref hydration 和 redaction；
- `config-show` / diagnostics；
- worker info 中标识 control executor 是否复用 task executor；
- tests 覆盖默认 fallback 和显式 control executor。

## 风险

1. **配置复杂度上升**：新增 executor 层会让 worker config 更复杂。对策：默认复用主 executor，只在高级场景暴露配置。
2. **secret hydration 重复**：control executor 也可能需要 apiKey/ref。对策：复用现有 executor config secret 处理路径，不新增明文 secret 存储。
3. **多 engine 语义不一致**：不同 engine 对 JSON 输出稳定性不同。对策：control executor 默认推荐 HTTP/openai-compatible 小模型，主 executor 继续执行任务。

## 推进顺序

1. 增加 config 类型和 schema，先允许 `decisionPipeline.executor` 存在但默认不启用行为变化。
2. 抽出 `resolveControlExecutor()`，未配置时复用主 executor。
3. 把 intent / quality / repair / compaction / memory flush control calls 改走 resolver。
4. 补齐 diagnostics、worker info、tests 和 changelog。

## 范围外

- 不重写 FEAT-038 的 intent / quality 语义。
- 不改变 `.aiworker` brain 文件加载规则。
- 不实现外部 agent adapter 投影；该范围仍归 FEAT-039 / PLAN-041。

## 完成记录

- `WorkerConfig.orchestrator.decisionPipeline.executor` 支持独立 control executor。
- `resolveControlExecutor()` 在未配置时复用 task executor，显式配置时独立构造 control executor。
- continuation classifier、LLM intent classifier、quality gate、repair、compaction summary 和 memory flush 均走 control executor。
- 显式 control calls 不传 task workspace、tool list 或 engine binding；默认 `temperature=0`。
- secret paths 覆盖 control executor 及 fallback chain。
- Worker info 返回 `controlExecutor` 诊断。
- Focused tests 覆盖默认 fallback、显式 control executor、schema、secrets 和 diagnostics。
