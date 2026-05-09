# AIWorker Goals

AIWorker 的使命，是把外部 AI executor 变成可长期运行、可自托管、可治理的业务
worker。

AIWorker 不是另一个 coding assistant、模型 wrapper、memory database 或 agent
framework。AIWorker 应该拥有的是持久 Project Brain、worker identity、治理边界和
Worker/Fleet 运维；真实推理、工具调用、文件编辑和 runtime 执行仍由外部 executor
完成。

这份文档是后续开发 session 的产品北极星。任何涉及 Brain、Executor、Soul、Fleet、
scope、memory、skill、MCP、plugin、capability、approval、audit 或 runtime 边界的
改动，都应先读这份文档。

## 为什么 AIWorker 存在

当前 AI agent 生态正在快速走向强 executor：Codex、Claude Code、Cursor、OpenHands、
goose、Hermes、OpenClaw、MCP runtime，以及未来同类系统。它们擅长执行任务，拥有
tool loop、native skill、plugin、sandbox、approval、auth、session、model 和各自的
产品体验。

生产环境里尚未解决的是另一组问题：

- context 被分散在不同工具、账号和会话里；
- long-term memory 很有价值，但容易污染、过期、泄漏或跨 scope；
- agent 自我迭代需要 provenance、approval 和 rollback；
- MCP / plugin / skill 生态扩张速度快于信任边界建设；
- 团队需要 worker identity、audit、routing、persistence 和 operations；
- 真实业务 scope 远大于 software project。

AIWorker 的存在理由，是在不重建 executor 生态的前提下，把强 executor 变成客户自己
拥有的、绑定业务 scope 的、可审计的 worker。

## 产品论点

AIWorker 是 **self-hosted Project Brain governance runtime for bring-your-own
agents**。

它的竞争面只有四个：

1. **Project Brain ownership**：filesystem-first、可 review、可迁移、客户自己拥有的
   scope context。
2. **Governed self-iteration**：持久 Brain 变更必须经过 admission、evidence、
   secret scan、approval、audit 和 rollback planning。
3. **Executor neutrality**：外部 executor 保留原生能力；AIWorker 提供 context、
   boundary、persistence、observation 和 control。
4. **Worker/Fleet operations**：worker 可单机运行，也可进入 fleet 聚合 presence、
   routing、approval、schedule、log 和 audit，且不把 Brain 内容复制到 fleet state。

如果一个功能不能强化这四个面之一，它大概率不属于 AIWorker core。

## 目标

### 1. 让 Project Brain 成为客户持久资产

Project Brain 必须可读、可 review、可迁移，并绑定到一个业务 scope。它承载 identity、
persona、user profile、policy、memory、rollup、artifact、Brain skill，以及 managed
native skill projection evidence。

Project Brain 不是 executor-native memory。外部 executor 声称“我记住了”并不等于写入
canonical Brain；只有 AIWorker 记录了正确 Brain 状态，才算成为长期资产。

### 2. 治理长期变更，但不破坏工作流

AIWorker 不应该让用户确认每一条低风险 memory。那会让产品不可用。

Brain governance 应该是 risk-based：

- 低风险偏好可以 journal 或 auto-stage，并保留 undo；
- 普通项目知识进入 Brain inbox，支持批量 review；
- policy、scope identity、sensitive fact、PII、secret、跨 worker 影响和高风险业务判断
  需要显式 approval；
- executor-native capability change 永远不能被当成 Brain truth。

Audit 是产品不变量；打断用户只是处理高风险场景的手段。

### 3. 保持 executor-neutral

AIWorker 必须保留外部 executor 的所有权边界：

- tool loop；
- MCP server selection 和 execution；
- native skill / plugin / command；
- sandbox 和 approval implementation；
- subagent 和 native session；
- auth、profile、model routing 和 provider-specific default。

AIWorker 可以提供 project overlay hint、readiness check、event normalization、context
projection 和 governance signal，但不能声称自己是 executor effective capability source
of truth。

### 4. 支持业务 scope，而不是只支持代码仓库

Project 表示 worker-bound business scope。developer worker 可以绑定 repo；HR worker
可以绑定岗位或候选人池；finance worker 可以绑定财务周期；legal worker 可以绑定合同或
案件资料夹；ops worker 可以绑定队列或 runbook。

不要把 software project 或 PMA-only 假设写进 Project Brain kernel。

### 5. 让 Worker/Fleet 控制面有用，但不集中复制私有 Brain

Gateway 和 fleet surface 应聚合 worker presence、routing、log、approval、schedule、
audit 和摘要状态。它们不应变成 worker Brain、conversation 或 secret 的中心副本。

Fleet control 应回答“哪个 worker 在哪个 scope 下、以什么治理状态做什么事”，但不能把
私有 Brain payload 拉进 `fleet.db`。

## 非目标

AIWorker 不应该变成：

- Codex、Claude Code、Cursor、OpenHands、goose、Hermes、OpenClaw 或未来 executor 的
  替代品；
- 通用 model gateway；
- 完整 MCP / plugin / skill 平台；
- 默认 sandbox 或 executor isolation 层；
- 硬编码 HR / finance / legal / software workflow engine；
- coding-only 项目管理工具；
- 通用 vector memory service；
- 静默改写长期 Brain state 的 opaque auto-memory 系统。

当成熟 executor 已经拥有某项能力时，AIWorker 应该在边界上 integrate、observe 和
govern，而不是重新实现。

## 架构承诺

1. **Brain Kernel owns governance invariants.**
   Brain hard logic 可以守 scope identity、data-plane isolation、evidence、
   provenance、admission state、secret redaction、rollback/audit、token budget、
   source tagging 和 fleet/worker boundary。这些不变量不能交给 prompt 或外部
   executor 自觉遵守。

2. **Brain Engine owns review semantics.**
   Brain 需要 engine 支持，但 Brain Engine 的角色是 reviewer / evaluator / lesson
   extractor，不是另一个 task executor。它可以判断结果质量、证据充分性、遗漏项、是否
   需要 repair / rerun / switch-executor / hold，以及某次经验是否值得进入 memory
   candidate。它不能直接写 canonical Brain，也不能绕过 Kernel 的 admission、audit、
   source/mode 标注和权限边界。

3. **Executor owns task execution.**
   外部 executor 负责真实任务语义：如何写代码、如何分析候选人、如何解释财务异常、如何
   调工具、如何编辑文件、如何使用 native session。AIWorker 不把自己做成 executor 平台。

4. **Filesystem Brain 是 canonical。**
   Markdown 和 manifest 文件是可 review 的 Project Brain 表面。SQLite 可索引 runtime
   state、conversation、artifact 和 admission state，但不能替代 canonical Brain file。

5. **Admission gates durable Brain mutation。**
   Generated memory、Brain skill 和 policy change 必须带 evidence 进入 proposal，再成为
   durable state。不支持的 proposal kind 要诚实失败，不能静默改写状态。

6. **Executor overlay 只是 hint。**
   `.aiworker/executor-capabilities.json` 是 project overlay / bootstrap hint，不是隔离
   边界，也不是 executor effective capability source of truth。

7. **Fleet 不复制 Brain。**
   `fleet.db` 只存 fleet pointer 和 audit data。Worker-owned Brain、conversation、config
   和 secret 留在 worker data plane。

8. **Truthfulness beats product theater。**
   如果行为只是 heuristic、observe-only、best-effort、unsupported 或 executor-owned，
   CLI、API、UI、文档和事件都应直接说明。

一句话边界：**Brain Kernel owns invariants; Brain Engine owns review semantics;
Executor owns task execution.**

## Brain 三层运行模型

AIWorker 的 Brain 不应该只是硬编码规则，也不应该变成一个万能 LLM agent。正确形态是
Kernel 约束下的三层循环：

1. **Journal：记录但不裁决。**
   每轮 executor 运行都可以记录目标、输入、使用的 Brain context、artifact、tool event、
   executor 输出、错误、retry、风险信号和最终状态。Journal 不改变长期 Brain，也不打断
   用户。它的价值是复盘、审计和后续学习素材。

2. **Gate：按风险放行、修复、重跑或升级。**
   Kernel 先做 scope、secret、PII、policy、admission、artifact presence、越界和危险操作
   等硬检查；Brain Engine 再按 Soul / scope / rubric 做语义评估。Gate 的动作可以是
   `pass`、`warn`、`repair`、`rerun`、`switch-executor`、`hold` 或 `block`。Brain 评估的是
   结果是否可放行，不接管 executor 的执行过程。

3. **Admission：把少数经验变成长期 Brain。**
   做错了先进入 Journal，不等于马上写 memory；做对了也不等于马上写 memory。只有重复、
   可泛化、scope 稳定、风险可控、来源明确的经验，才应成为 memory / Brain skill / policy
   candidate，并带 evidence、risk、expiry、approval 和 rollback 进入 admission。

这个三层模型的目标不是让 AIWorker 为了产品形态而增加复杂度，而是把 agent 进入真实业务后
必然需要的复盘、放行、重跑、学习和审计边界明确下来。

## 后续开发决策测试

实现任何新功能前，先回答这些问题：

1. 它强化了哪个 AIWorker-owned surface：Project Brain ownership、governed
   self-iteration、executor-neutral context/control，还是 Worker/Fleet operations？
2. 它是否其实属于 executor-native concern：MCP、plugin、sandbox、approval、native
   session、auth、model routing 或 tool execution？
3. hard logic 守住的是哪个治理不变量？如果答案是“业务含义”或“下一步该做什么”，就应
   移到 Soul guidance、prompt context、proposal 或 executor。
4. 如果需要语义评估，它应该属于 Brain Engine review，还是属于 executor task execution？
   Brain Engine 的输出是否带 source/mode，并受 Kernel gate/admission 约束？
5. 它是否保留了 Project = business scope，还是把 AIWorker 收窄成代码仓库和 PMA workflow？
6. 它是否创建 durable Brain state？如果是，evidence、admission status、approval path、
   secret scan 和 rollback plan 在哪里？
7. 它是否增加高频用户确认？如果是，能否改成 silent journaling、batch review 或
   risk-based approval？
8. 结果是否可检查、可审计、可解释、可回滚？
9. 如果 Codex / Claude Code / Cursor / 另一个 executor 很快做出类似能力，AIWorker
   这一层还剩什么不可替代价值？

如果一个功能无法通过这些测试，它不应该进入 core runtime。

## 需要验证的产品赌注

AIWorker 应通过垂直 worker 场景证明价值，而不是泛泛宣称自己是 agent platform：

- **Developer repo worker**：围绕一个 repo 保存架构决策、release evidence、regression
  和跨 executor 连续性。
- **HR recruiting worker**：处理候选人池 memory、PII 边界、evidence-backed
  recommendation 和治理后的长期备注。
- **Finance ops worker**：区分 observation 与 durable fact，对高风险判断要求 approval，
  并保留 audit trail。
- **Ops / support worker**：维护 runbook context、escalation history、queue state 和
  worker/fleet visibility。

检验标准不是 AIWorker 是否能让 executor 更聪明，而是团队相比只用裸 executor，是否减少了
重复解释、非受控 memory drift、审计盲区和长驻 worker 运维风险。

## 1.0 产品判断

1.0 的第一目标用户不是个人 power user，也不是大型企业安全团队，而是已经在团队里重度使用
AI executor 的技术负责人或 AI ops owner。他们通常已经在用 Codex / Claude Code / Cursor /
OpenHands 一类工具，已经感受到 context 重复解释、memory 混乱、agent 行为不可复盘的问题，
但还没有大到需要采购完整企业 AI governance platform。

1.0 的第一个垂直场景应优先选择 **developer repo worker**。这不是把 AIWorker 收窄成 coding
工具，而是因为 developer repo 的 artifact、diff、test、release log、issue 和 PR 证据链最清楚，
executor 生态最成熟，dogfood 与验证成本最低。HR / finance / legal / ops 更能体现 business
worker 理念，但应在第一个闭环被证明后再扩展。

AIWorker 1.0 的最小不可替代价值是：

> 让一个真实业务 scope 的 AI worker 在不同 executor 之间持续保留项目事实，按证据放行结果，
> 并把可复用经验纳入受治理的 Project Brain。

AIWorker 不应成为用户日常工作的主界面。用户应优先在 Codex、Claude Code、Cursor 等
原生 executor 里工作；AIWorker 的角色是 Project Brain sidecar：让 native-agent work
能被汇报、复盘、admission、投影，并在下一次 run 里验证是否真的改善。Worker Admin Chat
只能是调试/管理入口，不是产品闭环本身。

这个闭环的最小形态是：

```text
native executor run
→ task-scoped Case evidence
→ Brain review decision
→ rerun / hold / pass
→ lesson candidate
→ admission
→ canonical Project Brain
→ native skill / context projection
→ later run verifies whether the lesson changed behavior
```

如果一个实现只做到 prompt 注入、聊天转发、raw log 展示或 heuristic `ready_to_ship`，
它还没有证明 AIWorker 的存在价值。

Brain 学习边界采用四级：

1. **Journal**：默认记录，低摩擦，不影响未来行为。
2. **Candidate**：Brain Engine 认为可能值得记，但只进入 inbox。
3. **Admission**：带 evidence、scope、risk、expiry、rollback，等待 approve/apply。
4. **Canonical Brain**：批准后写入 filesystem Brain，未来会影响上下文。

永远不能直接记入 canonical Brain 的内容包括 secret 明文、未经授权的 PII、一次性任务中间态、
executor 自称但无证据的事实、跨 scope 推断、高风险业务结论，以及未标来源的“偏好”。

权限边界的商业承诺必须保守：

> AIWorker governs Brain and AIWorker-brokered capabilities. It does not govern
> unmanaged ambient executor authority.

也就是说，Brain 写入、worker/fleet state、AIWorker vault secret 和未来 AIWorker broker 的能力，
都必须强治理；executor 自己从 shell、MCP、cloud token、IDE plugin 或 user/host 环境拿到的能力，
AIWorker 只能提示、记录、建议 plan-only，不能承诺拦截。

1.0 前明确不做：

- 通用 sandbox / container isolation；
- 通用 MCP firewall；
- 完整 cloud permission broker；
- 多租户企业 IAM；
- HA / multi-host 复杂调度；
- 通用 workflow builder；
- 行业专家规则库；
- 自研 executor tool loop；
- 自动写入长期 memory；
- 把 HR / finance / legal 做成硬编码业务流程。

1.0 应证明的闭环是：

1. 初始化一个真实 repo scope。
2. 接入至少一个外部 executor，优先保证 Codex / Claude Code 这类强 executor 能工作。
3. 执行一个真实修复、验证或发布辅助任务。
4. Brain Journal 记录目标、上下文、artifact、tool event、输出和风险信号。
5. Brain Gate 检查 diff、测试、scope、secret、evidence 和输出质量。
6. 失败时生成明确原因，并 repair / rerun / switch-executor / hold。
7. 成功时放行输出。
8. Brain Engine 提取可复用 lesson candidate。
9. 用户通过 admission 批准后写入 Project Brain。
10. 下一次换另一个 executor，也能利用同一个 Project Brain。

这个闭环跑通，AIWorker 才有继续扩垂直领域的资格；跑不通，就不应扩大产品面。
