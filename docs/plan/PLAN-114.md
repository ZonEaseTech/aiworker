# PLAN-114 Brain Governance Kernel 决策落盘

- **status**: completed
- **createdAt**: 2026-05-05 22:58
- **approvedAt**: 2026-05-05 22:58
- **completedAt**: 2026-05-05 22:58
- **relatedTask**: DOC-005

## 现状

1. 主线已快进到 `7adc00a`。最新 0.8.0 QA-006 在 5 Souls × 12 turns × 2 engines
   的矩阵里确认 Soul/persona/scope/risk policy 注入有效，但 Brain decision events
   全部是 heuristic + observe-only。
2. FEAT-054 / PLAN-097..103 已经在 Brain 层落了大量结构：
   - Soul module registry / per-Soul ownership；
   - scope manifest / business-scope bootstrap；
   - artifact registry；
   - Soul-specific schema packs；
   - admission proposal / decision tables 与 CLI/API/UI MVP；
   - Brain brief compiler；
   - Worker/Fleet Brain summary surface。
3. PLAN-109 / PLAN-110 又进一步强化了 memory body 注入、admission read-path、
   secret redaction、Soul vague-context guidance、dead-loop detector、risk heuristic
   与 quality gate budget。
4. 这些实现证明 Project Brain 是核心资产，但也让产品边界变危险：开发者很容易沿着
   artifact registry / schema pack / admission / decision pipeline 继续加 hardcoded
   business workflow，把 AIWorker 做成领域自动化平台或半个 executor runtime。
5. 0.8.0 验证已经立出三个相关缺陷：
   - `BUG-066`：Brain decision layer 是 heuristic-only / observe-only，不应被称为
     已有 LLM-backed Brain decider。
   - `BUG-068`：admission proposal 缺 LLM-discoverable entry point，外部 executor
     native memory 可能绕过 AIWorker admission。
   - `BUG-074`：LLM 可声称 proposal 已提交，但 AIWorker admission DB 为空。

## 决策

AIWorker Brain 层采用 **Governance Brain Kernel** 边界：

- Brain Kernel 是 scope context、长期资产、证据索引、admission、redaction、audit、
  projection 与数据面隔离的治理内核。
- Brain Kernel 不是 HR / finance / legal / developer / ops 的硬编码领域 workflow
  engine，不内建业务语义判断，不替代 LLM 的规划和解释。
- hard logic owns invariants, LLM owns semantics。
- External executor 继续拥有 tool loop、MCP / skills / plugins、sandbox、approval、
  native session、subagent、auth 与 user/host-level config；AIWorker 只通过薄 adapter
  调用、观察、投影和收口权限。

## 方案

1. 在 `docs/architecture.md` 的 Product Positioning 下新增
   `Brain Governance Kernel 决策`：
   - 明确 hard logic 只守 scope、provenance、admission、redaction、rollback、
     audit、token/source budget、fleet/worker 数据面隔离等治理不变量；
   - 明确领域含义判断、下一步计划、业务对象解释交给 LLM / executor；
   - 明确 AIWorker 不接管 executor native capability。
2. 用表格重解释现有 Brain 组件：
   - Soul module = LLM-readable role package；
   - scope manifest = business scope identity；
   - artifact registry = evidence index；
   - schema pack = vocabulary / validation hints；
   - admission = durable mutation permission boundary；
   - brief compiler = projection layer；
   - decision events = truthfulness / observability contract。
3. 写入新增 Brain hard logic 前的四个自检：
   - invariant test；
   - mutation test；
   - executor-boundary test；
   - truthfulness test。
4. 修正 `docs/architecture.md` 中 admission state 仍写成 roadmap / 未落 DB 的过期
   表述，改为 PLAN-101 / PLAN-103 已落地 worker.db MVP，后续扩展仍需独立 PMA。
5. 在 `AGENTS.md` 的能力边界里加短规则，让未来开发者和 agent 在开工前看到同一
   红线。
6. 同步 `DOC-005` / `PLAN-114` / indexes / changelog。

## 风险

1. **过度收缩风险**：把 Brain Kernel 写轻后，开发者可能误以为 Project Brain 不再是
   核心资产。文档必须说明 Brain 仍 owns governance / durable assets / projection /
   operator approval，只是不 owns 领域语义。
2. **历史计划误读风险**：PLAN-099/100/101/102 的名称容易让人继续把 artifact /
   schema / admission / compiler 理解成业务引擎。新架构段落要逐一重新解释这些组件。
3. **产品承诺风险**：如果不明确 BUG-066 的现实，后续 README/UI/CLI 仍可能暗示
   Brain decision LLM 已工作。文档必须要求 source/mode 诚实标注。
4. **executor bypass 风险**：BUG-068/074 说明外部 executor native memory 可能与
   AIWorker Brain 竞争。文档要强调 native memory 不是 canonical Brain，成功与否以
   AIWorker brain tables/filesystem 为准。

## 范围

- `docs/architecture.md`
- `AGENTS.md`
- `docs/task/DOC-005.md`
- `docs/task/index.md`
- `docs/plan/PLAN-114.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不实现 LLM-backed Brain decider。
- 不修复 BUG-066 / BUG-067 / BUG-068 / BUG-074。
- 不新增 admission LLM-facing tool。
- 不改 DB schema、runtime、CLI、API 或 UI 行为。
- 不重写历史 PMA 计划；历史实现通过新架构决策重新解释。

## 验证

- `git diff --check`
- 文档内容人工核对：
  - Brain hard logic 边界明确；
  - admission state 与当前实现一致；
  - decision layer 未被误写成 LLM-backed；
  - Brain/Executor capability 仍隔离。

## 进度

- 2026-05-05 22:58：完成调查。主线已拉取到 `7adc00a`；`DOC-005` / `PLAN-114`
  槽位可用；QA-006 / BUG-066 / BUG-068 / BUG-074 是本决策的直接证据。
- 2026-05-05 22:58：完成落盘。`docs/architecture.md` 新增 Governance Brain
  Kernel 决策，`AGENTS.md` 增加短红线，PMA task/plan/changelog/index 同步。
