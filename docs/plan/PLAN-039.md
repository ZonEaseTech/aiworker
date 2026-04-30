# PLAN-039 Worker 决策管线：意图识别、能力选择与质量门禁

- **status**: s1_completed_s2_pending_review
- **createdAt**: 2026-04-29 17:04
- **relatedTask**: FEAT-038

## 现状

用户对 worker 的定位已经明确：一个项目级、兼容多引擎的工作区。当前代码已经完成一部分基础设施：

1. **项目级落位已具备基础**：`packages/fs-layout/src/index.ts` 已支持 `<project>/.aiworker/`、`AGENT.md` / `SOUL.md` / `USER.md` / `MEMORY.md` / `ROLLUP.md`、`skills/`、`memories/`、`mcp.json` 与 `local/` 隔离。
2. **连续会话已有控制面**：FEAT-037 / PLAN-028 已落到 `session_entries`、token budget、compaction、memory flush、engine native binding、session status/maintenance。也就是说，本计划不应重做 session control plane。
3. **当前意图识别仍很窄**：`packages/core/src/worker/conversation/router.ts` 的 `classifyContinuation()` 只判断“继续上一会话还是新 topic”，没有产出任务意图、能力需求、风险等级、需要什么上下文、是否要质量复核等结构化结果。
4. **当前 skill 仅作 prompt 描述**：`Orchestrator.buildSystemPrompt()` 只注入 `brain.listSkills()` 前 10 个 name/description；没有 `load_skill`、没有 skill body progressive disclosure，也没有按 intent 选择 skill。
5. **当前 MCP 仍是 executor 形态**：`McpExecutor.run()` 未实现 chat，MCP 没有进入 orchestrator 的 tool/capability registry；`WorkerConfig` / config schema 也还没有 per-worker `mcp.servers` 字段。
6. **当前质量门禁只在 tool policy 层**：`toolPolicy` 可以 auto/ask/deny 单个工具，但最终回复没有 reviewer/repair/gate。`evolution` 只记录 tool_call/finished，proposer 仍偏 n-gram，不看最终答复质量。

## 参照物复调研

### Hermes Agent 结论

复查 Hermes Agent 官方仓库与文档后，Hermes 更适合作为 AIWorker worker runtime 的主参照，而不是把 `ttpos-bot` 的 gate-first 流程作为主线：

1. **核心是统一 agent loop**：Hermes 的 turn lifecycle 是输入入库、构建或复用 system prompt、检查压缩、构建 API messages、调用模型、执行 tool calls、最终持久化与 memory flush。AIWorker 应该在现有 `Orchestrator` 外围补齐这些阶段的显式决策事件，而不是另起一套 conversation buffer。
2. **能力是 registry/toolset，不是 prompt 堆叠**：Hermes 把 tool registry、toolsets、platform presets、动态 MCP toolsets 作为一等能力；这比“把 skill/MCP 描述全塞进 system prompt”更适合项目级多引擎 worker。
3. **上下文文件是 progressive disclosure**：Hermes 启动时加载项目指令与全局人格，并在访问子目录时渐进发现上下文文件，避免 system prompt 膨胀并保留 prompt cache。AIWorker 已有 `.aiworker/AGENT.md`、`SOUL.md`、`USER.md`、`MEMORY.md`、`ROLLUP.md` 路径，缺的是对应 composer 与加载策略。
4. **memory 分层清晰**：Hermes 区分固定注入的短 memory/user profile 与按需 session search；AIWorker 应复用 FEAT-037 的 session summary，并把 `MEMORY.md` / `ROLLUP.md` 作为短摘要，把长历史检索做成 `memory_search`。
5. **skill 是可安装、可发现、可执行的资源**：Hermes 支持官方、well-known、GitHub、marketplace 等来源，并把 skill 与命令/tool/context 联动。AIWorker 可以吸收 descriptor、依赖、版本、启用范围、按需加载这些抽象，但不能直接照搬其生态来源。
6. **自我迭代要加治理**：Hermes 强调经验生成 skill、使用中改进、跨会话召回；AIWorker 应采纳“observe -> propose -> approve -> apply”，并补上 skill 验证、版本冲突、审计与回滚，避免模型直接越权改配置。

调研来源：

- <https://github.com/NousResearch/hermes-agent>
- <https://hermes-agent.nousresearch.com/docs/developer-guide/architecture/>
- <https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop/>
- <https://hermes-agent.nousresearch.com/docs/user-guide/features/tools/>
- <https://hermes-agent.nousresearch.com/docs/user-guide/features/skills/>
- <https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/>
- <https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files/>

### `ttpos-bot` 次要参考

`ttpos-bot` 不应作为 worker runtime 最佳实践；它更像一个业务 bot 的治理样本。可取之处是控制形态，不是 TTPOS 的业务规则：

1. **输入归一化先行**：Lark message handler 先做历史消息过滤、幂等去重、群聊 mention gate、slash command 路由、附件/引用上下文注入，再把自然语言交给 agent。
2. **质量门禁是结构化 reviewer**：`draft_issue` 先生成候选，再用独立 reviewer 输出 strict JSON 分数、missing、suggestions；通过阈值才签发 `draft_token`。
3. **gate 绑定最终产物**：`create_*` 必须提交原样 `enriched_body` 与 `draft_token`，token 绑定 body hash、user、issue type、TTL，避免 agent 绕过评分后篡改最终输出。
4. **失败反思有上限**：低分时 agent 先按 suggestions 自我改写重试；达到失败上限才触发 `learn_from_failure`，产出单个具体追问和可沉淀 memory。
5. **长期校准来自真实反馈**：retrospect 定期读取 draft logs、GitHub 反馈、quality enforcement events，对 memory 执行 reinforce / contradict / override / new_insight。

迁移到 AIWorker 的限定结论：只吸收“结构化质量事件、失败反思、签名 gate、retrospect”这类治理机制；runtime 主干仍应以 Hermes 的 context / memory / skill / tool registry / loop 设计为准。

## 方案对比与择优

| 方案 | 优点 | 问题 | 结论 |
| --- | --- | --- | --- |
| A. `ttpos-bot` gate-first 流水线 | reviewer、签名 token、失败反思和 retrospect 很成熟 | 业务 bot 色彩重，围绕 issue/digest/notification；如果照搬会把 worker 做窄 | 只借治理机制 |
| B. Hermes faithful clone | agent loop、context files、memory、skill、toolsets、MCP 动态工具完整 | Python/CLI/gateway 结构、生态安装源、部分平台假设不适合 AIWorker；治理/audit 需要补强 | 作为主架构参照，不复制实现 |
| C. AIWorker session control + Hermes runtime primitives + `ttpos-bot` governance | 复用 FEAT-037，补齐 registry/composer/gate/learning，兼容多 engine 与项目级 workspace | 模块较多，需要 observe-only 分期落地 | 推荐 |
| D. 只扩 system prompt 或硬编码 router | 实现最短 | 不可观测、不可回放、token 膨胀，无法自我迭代 | 不推荐 |

最终选择 C：以 Hermes 的 runtime primitives 为主线，以 AIWorker 已有 session control plane 为不可变基础，以 `ttpos-bot` 的治理经验补质量门禁和反思闭环。

## 方案

新增一条 Hermes-shaped worker cognitive pipeline，挂在现有 `Orchestrator.ingest()` / `run()` 外围，不替代 FEAT-037 session control plane。

### 0. Context Manager

先把 `buildSystemPrompt()` 拆成可测试的 `ContextManager` / `RunContextComposer`：

- 输入：worker config、project scope、session state、channel/user metadata、capability decision、quality profile。
- 固定注入：SOUL / AGENT / USER / MEMORY / ROLLUP 的短快照、session summary、必要的 project context。
- 渐进注入：subdirectory context、skill body、MCP tool long description、长历史检索结果。
- 约束：延续 FEAT-037 token budget、compaction 与 engine binding；不新增独立短期 buffer。

### 1. Intent Router

在会话 resolver 之后、主 executor run 之前增加窄口径 `IntentClassifier`。它不负责替代上下文/能力规划，只产出 session、risk、quality profile 等决策信号：

- 输入：当前 envelope、session summary、最近消息窗口、可用 skill/MCP/tool descriptor、channel/user metadata。
- 输出 strict JSON：
  - `sessionAction`: `continue` | `new_topic` | `reset_requested` | `isolated_task`
  - `intent`: `answer` | `code_work` | `planning` | `research` | `config_admin` | `memory_update` | `skill_request` | `unknown`
  - `risk`: `low` | `medium` | `high`
  - `requiredContext`: `recent_history` / `memory_search` / `skill_load` / `mcp_tools` / `workspace`
  - `qualityProfile`: `default` | `code_review` | `planning` | `high_stakes`
  - `confidence` + `reason`
- 继续复用现有 `classifyContinuation()` 能力，但把它升级为 intent decision 的一个字段，而不是孤立判断。
- classifier 失败时走安全默认：继续当前 session、少工具、默认质量 profile，并记录 `classifier_error`。

### 2. Capability Planner

在主 run 前根据 intent 和 context 需求做能力选择，采用 registry + ranking，不做硬编码路由：

- 建立 `CapabilityRegistry`，统一管理：
  - project/user/package skill descriptors；
  - per-worker `mcp.json` / `worker_config.mcp.servers` 的 MCP tool descriptors；
  - 内置工具如 `load_skill`、`memory_search`；
  - executor 原生 tool descriptors。
- 输出 strict JSON：
  - `selectedSkills[]`
  - `selectedMcpTools[]`
  - `selectedBuiltins[]`
  - `deniedCapabilities[]`
  - `weights` / `reason`
- 初期只做“选择 + 观测 + prompt/toolDefinitions 透传”，不做自动长期权重写盘；权重只来自 descriptor match、显式配置、历史 observation 的只读统计。
- 所有选择先过 allowlist / denylist / `toolPolicy`；secret 仍只能走 ref + hydrate，不能进入 `worker_config.configJson` 明文。

### 3. Run Context Composer

把 `ContextManager` 输出渲染为 engine-agnostic prompt/tool definitions：

- 固定顺序：SOUL / AGENT / USER / MEMORY / ROLLUP / session summary / selected skill descriptors / selected MCP tool descriptors / quality profile。
- skill body 不默认全量注入；提供 `load_skill(name)` 按需读取。
- memory 不默认全文无限注入；提供 `memory_search(query)`，同时保留 `MEMORY.md` / `ROLLUP.md` 的短摘要注入。
- 对不同 executor engine 做降级：支持 native tools 的 engine 透传 tool definitions；不支持的 engine 只注入精选 descriptor 与操作约束。

### 4. Quality Gate

在 executor 输出最终 assistant text 后、deliver 前增加 `QualityGate`：

- 输入：用户原始请求、intent decision、capability decision、final answer、关键 tool/gate events、session summary。
- 输出 strict JSON：
  - `score` 0..10
  - `threshold`
  - `dimensions`: relevance / completeness / evidence / safety / format
  - `missing[]`
  - `suggestions[]`
  - `action`: `pass` | `repair` | `warn` | `block`
- 默认 `observe` 模式，只记录不改变交付。
- 批准进入 enforcement 后，低分可触发一次 suppressed repair run；仍不达标时按配置 `warn` 或 `block`。
- 高风险 intent 默认提高阈值，并禁止自动 repair 执行破坏性工具。

### 5. Learning Loop

扩展现有 evolution observer，不急着新增重 schema。自我迭代采用 Hermes 的“经验形成能力”方向，但强制加 approval 与审计：

- 事件：`orchestrator.intent_decision`、`orchestrator.capability_decision`、`orchestrator.quality_gate`、`orchestrator.repair_attempted`。
- 先持久化到现有 `evolution_observations`，让 FEAT-006/后续 proposer 可以消费；如果查询性能或结构化分析不足，再升级为专表。
- 失败反思策略：
  - 单轮低分：写 observation，不写配置。
  - 连续同类低分：产出 pending memory/skill/policy proposal。
  - 周期 retrospect：读取质量 gate、用户纠正、operator override、会话结果，reinforce / contradict / override 既有记忆或 proposal。
- 所有写盘/启用必须经过 approval。尤其 skill/MCP/policy 变更不能由模型直接落地。
- 新增/修改 skill 必须通过 validation、version/conflict 检查和 audit 记录；失败只保留 proposal。

## 推进顺序

建议分五段实现，每段都能独立验证：

1. **S1：Context Manager + 决策事件骨架 observe-only**
   - 拆出 context composer、短快照加载、decision/gate event 类型、测试。
   - 不改变现有交付行为。
2. **S2：Capability Registry + toolsets observe-only**
   - 引入 descriptor registry、toolset/profile、MCP descriptor 读取。
   - 初期只记录 selected descriptors，不实际强制 tool exposure。
3. **S3：Intent / Risk / Quality Profile 分类 observe-only**
   - 新增 narrow classifier、strict JSON parser、fallback、bus event、测试。
   - 分类结果只影响 observation，不影响执行。
4. **S4：Quality Gate observe-only → one-shot repair**
   - 默认 observe，验证日志与评分稳定后再打开 repair。
   - 只允许一次 repair，避免自循环。
5. **S5：Retrospect / proposer 接入**
   - 把 gate/intent/capability 事件纳入 evolution proposer。
   - 仅生成 pending proposal，不直接改 worker config；skill 变更必须过 validation/version/audit。

## 风险

1. **分类器误判**：意图识别错会带偏后续工具选择。对策：observe-only 起步、低置信度走保守默认、保留用户显式 `/new` / `/reset`。
2. **质量门禁增加延迟和成本**：每轮多一次 reviewer 可能拖慢聊天。对策：按 quality profile 启用；普通闲聊 observe/sample，高风险或任务型请求全量 gate。
3. **自我迭代越权**：模型可能把错误经验写成规则。对策：所有 memory/skill/policy 改动先 pending，operator/user approval 后落盘。
4. **MCP prompt injection 面扩大**：MCP/skill 描述可能携带恶意内容。对策：descriptor 与 body 分离、body 按需加载、allowlist/denylist、secret ref、不把未经审核 skill 设为默认启用。
5. **多引擎能力差异**：Codex/Claude Code/Cursor/HTTP 对 toolDefinitions、native tools、approval 的支持不同。对策：CapabilityRegistry 输出 engine-agnostic selection，adapter 分层降级，worker.db 仍是权威。
6. **与 FEAT-037 重叠**：不能重写 session store。对策：本计划只消费 session summary/status，不改 session_entries 语义。

## 范围

本计划只覆盖 worker runtime 决策层，不覆盖：

- `aiworker init` / Soul 模板 / 外部 agent adapter / 云端 Soul 更新（见 PLAN-041）；
- Web UI 重构；
- 发布流程；
- 新 channel adapter；
- 大规模 schema 重写；
- 具体项目业务规则；
- 直接复制 `ttpos-bot` issue quality rubric。

## 备选方案

1. **硬编码规则路由**：实现快，但无法跨项目/engine 泛化，也不符合 Hermes-style 自我迭代目标。不推荐。
2. **只扩大 system prompt**：成本最低，但 token 膨胀、不可观测、不可回放，容易把 skill/MCP 全塞进上下文。不推荐。
3. **先做完整 MCP tool registry**：能直接提升能力选择，但没有 intent/quality 事件会缺少学习闭环。建议排在 S2。
4. **直接上强 enforcement**：能立刻拦低质回复，但会改变聊天行为且难调试。建议从 observe-only 过渡。

## 批注

2026-04-30：用户批准接管开发。先实施 S1（Context Manager + 决策事件骨架 observe-only），因为它能先把 Hermes-style runtime primitives 的承载点固化下来，再逐步接入 capability、intent、quality 和 learning。

### S1 实施切片

- 抽出 `ContextManager` / `RunContextComposer`，保持当前 system prompt 内容和 history/token-budget 行为不变。
- 新增 observe-only 决策事件 payload 类型：
  - `orchestrator.intent_decision`
  - `orchestrator.capability_decision`
  - `orchestrator.quality_gate`
- S1 只发默认/骨架事件，不让分类、能力选择或 gate 改变执行路径。
- 扩展 evolution observer，让上述决策事件进入 `evolution_observations`，供后续 proposer / retrospect 使用。
- 聚焦测试覆盖：
  - system prompt 和 project persona 注入不回归；
  - 默认 intent/capability/quality 事件按顺序发出；
  - gateway-origin conversation id 映射仍可透传；
  - evolution observer 持久化新增决策事件。

### S1 完成记录

2026-04-30：S1 已落地。

- `ContextManager` 负责 `.aiworker` persona/memory 短快照和当前 skill prompt exposure。
- `RunContextComposer` 负责把 system prompt 与现有 history/token-budget 逻辑组合成 engine-agnostic chat context。
- `orchestrator.intent_decision`、`orchestrator.capability_decision`、`orchestrator.quality_gate` 已按 observe-only 默认 payload 发出。
- `evolution_observations` 已持久化上述新增决策事件。
- 当前仍不执行真实 intent classifier、CapabilityRegistry、质量评分、repair 或 block；这些留给 S2-S4 分段复审后实现。

### S2 完成记录

2026-04-30：S2 已落地。

- 新增 observe-only `CapabilityRegistry`，聚合 brain skill descriptor、内置 `load_skill` / `memory_search`、`.aiworker/mcp.json` 和 `.aiworker/toolsets.json`。
- `orchestrator.capability_decision` 改为来自 registry snapshot + planner，记录 available builtin/MCP/skill/toolset 与 selected skill/builtin/MCP 信息。
- S2 仍不把 registry 输出强制传给 executor，不改变实际 tool exposure。
- 新增 registry 单元测试覆盖 project-scope `mcp.json` / `toolsets.json` 解析与 selection 结果。
