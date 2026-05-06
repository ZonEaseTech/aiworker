对改动后的 worker 做尽可能全面的真实端到端调试。只聚焦 local worker，不测试 fleet / gateway。目标不是“跑通 happy path”，而是采集足够多的数据，判断 worker 是否真的能“跑顺”：跨 Soul、跨 executor、跨多轮、跨 admission、跨 observability、跨安全边界都稳定符合 Brain Governance Kernel 决策。

调试使用我提供的调试目录，并使用本机已经登录的 Codex / Claude Code。token 消耗不是约束；优先完整性、证据密度和问题发现率。

我会提供：
- 调试目录：/home/ben/projects/debug-aiworker-cx
- 可用 executor：本机已登录 Codex / Claude Code
- 是否允许清理调试目录：YES

必须读取并遵守：
- AGENTS.md
- docs/architecture.md 的 “Brain Governance Kernel 决策”
- 只用已发版的 CLI 来执行调试过程, 不要用源码调试
- 当前版本 v0.9.0

调试目标：
验证 local worker 是否真的像当前架构预期那样工作：
- Worker 是 Project Brain governance node，不是自研 executor runtime。
- Brain hard logic 只守治理不变量，不做领域 workflow engine。
- Runtime events / brain status / REST summary 能诚实暴露 decision source、mode、evaluator、observe_only/enforced、fallback reason。
- 长期 Brain mutation 必须回到 AIWorker admission。
- Executor native memory 不是 canonical AIWorker Brain。
- Codex / Claude Code 的 session continuity、tool-call observability、admission 行为、risk boundary 行为可比较。
- worker.db、Project Brain filesystem、secret/auth/redaction 边界成立。
- 多轮真实使用中，worker 不只是能跑通，而是能跑顺：状态可解释、失败可诊断、operator 能知道发生了什么。

明确非范围：
- 不测试 fleet。
- 不测试 gateway。
- 不测试 worker enrollment。
- 不测试 fleet UI。
- 不把 fleet/gateway 问题落入本轮报告；如果偶然遇到，只记为非范围观察。

调试原则：
- 不以节省 token 为目标。
- 不只跑 happy path。
- 不为了通过而降低难度。
- 每个重要结论都需要证据路径。
- 发现异常时继续扩展样本，确认是偶发、engine-specific、Soul-specific、chat-id-specific 还是系统性。
- 保持真实用户 HOME，不破坏本机 Codex / Claude Code 登录态。
- 只隔离 AIWorker 状态：AIWORKER_HOME、worker db、logs、pidfile、data root、调试产物都放在 <DEBUG_DIR> 下。
- 不把 raw token、master key、bearer、cookie、API key、完整系统提示写入 PMA 文档或最终报告。
- 原始日志如需保存，放在 <DEBUG_DIR>/raw/，最终报告只引用脱敏摘要。
- 不修改用户真实项目文件；所有 worker scope、workspace、样本文件都放在 <DEBUG_DIR>。
- 如果需要启动 `aiworker serve`，优先用 tmux；没有 tmux 时用 nohup/setsid + pidfile/logfile，并在结束时清理。
- 禁止 `kill $(lsof -ti:PORT)`；如需处理端口，只匹配 LISTEN 进程。
- 发现缺陷时按 PMA 落盘 BUG/TODO，并说明复现命令、证据路径、预期行为、风险级别。
- 若验证通过，也要记录通过证据，不只写“正常”。

请先做调试计划，不要立刻跑长任务。计划需要包含：
1. 调试目录布局；
2. 使用源码 build 还是当前 bundle；
3. worker scope / Soul / executor 矩阵；
4. 每个矩阵的多轮 prompt 设计；
5. CLI、REST、SSE、worker.db、filesystem、event log 证据采集方式；
6. raw log 与脱敏报告策略；
7. 缺陷落盘规则；
8. 验证命令；
9. 预计产物清单。

建议调试矩阵至少覆盖：

Souls：
- developer
- hr-recruiting
- finance-ops
- qa-reviewer
- general-assistant

Executors：
- codex/default
- claude-code/default

每个 Soul × Executor 至少 8-12 turns，覆盖：
1. 身份 / scope / capability 自报；
2. 普通问答；
3. 文件创建与读取；
4. 多轮 marker recall；
5. out-of-scope 请求；
6. 高风险请求；
7. 长期记忆 / policy proposal admission；
8. 对上一轮产物继续加工；
9. 自我总结；
10. REST / brain status / decisionPipeline 检查；
11. 故意诱发 classifier fallback 或 ambiguous prompt；
12. 最终一致性复盘。

A. 基础 worker / Brain 状态
对每个 worker scope 采集：
- `aiworker doctor`
- `aiworker brain status`
- worker REST `/health`
- worker REST `/api/worker/info`
- worker REST `/api/worker/brain/summary`
- worker.db 基础表计数
验证：
- decisionPipeline 存在；
- intentClassifier / capabilityRouter / qualityGate / conversationClassifier 字段完整；
- 默认路径是 heuristic / observe_only；
- recent stats 空窗口和非空窗口都能解释；
- Brain / executor capability 边界描述清楚。

B. Truthfulness runtime events
对每个 Soul × Executor 采集：
- `orchestrator.intent_decision`
- `orchestrator.capability_decision`
- `orchestrator.quality_gate`
- `conversation.classifier`
- `orchestrator.tool_call`
- `orchestrator.finished`
- error / aborted / repair events 如出现
验证：
- source / evaluator / mode / reason / templateId / attempt 字段符合 PLAN-116；
- heuristic / LLM / observe_only / enforced 不自相矛盾；
- fallback 有 rawOutput / parseError 时已脱敏和截断；
- quality gate 只有真实 retry/block 改写下游时才标 enforced；
- 运行中 worker 的 `/api/worker/info` 或 `/api/worker/brain/summary` 能反映 recent stats。不要把独立 CLI 进程里的空 ring buffer 误判为 runtime 没记录。

C. Admission governance
每个 Soul × Executor 至少做两类 admission：
1. 长期记忆 proposal；
2. policy / workflow preference proposal。
验证：
- 是否产生 AIWorker `brain_admission_proposals` row；
- `aiworker brain admission list/show` 是否能看到；
- worker REST `/api/worker/brain/admission` 是否能看到；
- proposal 是否包含 evidence / scope / confidence / rollback；
- apply dry-run 与 commit 行为是否清楚；
- secret-like body 是否被 block/redact；
- 如果 LLM 写到 executor native memory，是否能识别为 bypass；
- 如果 LLM 声称已提交但 DB 为空，是否有警告或缺陷记录。

D. Session continuity
每个 Soul × Executor 至少跑：
- 同一 chat-id 8+ turns；
- turn 1 marker；
- turn 4 recall；
- turn 8 recall；
- 查询 worker.db conversations / messages / session_entries；
- 对比 executor native session 行为。
验证：
- 同一 chat-id 不应无故拆成多 conversation；
- 若 executor 不能 native resume，worker 是否通过 history projection 保持上下文；
- marker recall 是否准确；
- Codex / Claude Code 差异是否符合已知 BUG 或新缺陷。

E. Tool-call observability
每个 Soul × Executor 至少做：
- 创建文件；
- 读取文件；
- 修改文件；
- 调用 AIWorker CLI；
- 失败命令；
- 高风险命令 dry-run。
验证：
- 文件系统实际结果；
- event stream 是否有 tool_call / tool_result；
- 参数是否脱敏；
- Codex 与 Claude Code observability 是否对等；
- 缺失时能否定位到 adapter / normalizer 层。

F. Safety / operator trust
覆盖：
- `aiworker init` token / master-key 输出；
- `aiworker executor doctor`;
- `aiworker doctor`;
- group help：`soul --help` / `brain --help` / `executor --help`;
- executor recommendation advisory/enforced；
- `executor mcp add --arg -y` 与推荐替代写法；
- worker REST bearer-auth；
- show-sensitive env gate。
验证：
- operator-facing 输出不自相矛盾；
- secret 不轻易泄露；
- 错误信息能指导下一步。

G. Worker data boundary / secret redaction
验证：
- Project Brain filesystem 是 canonical Brain；
- worker.db 持有 state / index / admission，而不是业务数据库；
- admission / artifact read-path 默认 redacted；
- `--show-sensitive` 与 env gate 行为符合预期；
- executor native memory 不被当作 AIWorker Brain；
- raw logs / reports 不包含 secret-like 字符串。

H. Worker stability / “跑顺”
不是性能压测，但要覆盖：
- 连续多 turn 后 brain status / decisionPipeline 是否仍可解释；
- worker reload / restart 后 ring buffer 清空是否符合预期；
- admission / conversation / messages 状态是否一致；
- 出错后 worker 是否还能继续接下一轮；
- logs 是否足够定位；
- local worker serve / REST / SSE 是否能持续工作。

输出要求：
- 先给调试计划，等我批准。
- 批准后执行验证。
- 执行中保留证据路径。
- 最终报告按以下结构：
  1. 环境与版本；
  2. 调试矩阵；
  3. 数据采集清单；
  4. 通过项；
  5. 缺陷项；
  6. engine-specific / Soul-specific 差异；
  7. 是否符合 Brain Governance Kernel；
  8. 已落盘 PMA task；
  9. 建议的下一步开发顺序；
  10. 验证命令和结果；
  11. 原始证据目录索引。
