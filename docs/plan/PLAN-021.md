# PLAN-021 Worker 项目级落位 + 上下文连贯 + skill/MCP per-worker + 自我迭代闭环

- **status**: implementing
- **createdAt**: 2026-04-27 18:00
- **approvedAt**: 2026-04-27 18:30
- **relatedTask**: FEAT-031

## 现状

### 1. Worker 落位与配置

- `packages/fs-layout/src/index.ts:32-49` 统一管理路径派生。`AIWORKER_HOME` 显式设置 > 默认 `~/.aiworker`。`WORKER_DB_PATH` / `WORKER_DATA_ROOT` 可显式覆盖（BUG-001 已解耦）。
- 多 worker per host 的存储隔离已具备（gateway supervisor 为 launch-local 容器 mount `<WORKER_DATA_ROOT>/<container>:/var/lib/aiworker`，每 worker 一份独立 master key）。
- 缺：自动按 cwd 探测 `<project>/.aiworker/`、user/project/local 三层 scope 解析、`.gitignore` 模板。

### 2. 会话上下文（"降智"主因）

- `packages/storage-sqlite/src/worker/schema.ts:26-66`：`conversations(channel, chat_id, thread_id)` 三元组路由；`messages` 永久保存；`conversations.summary` 字段存在但**无任何代码自动填充**。
- `packages/core/src/worker/orchestrator/service.ts:295-318`：每次 `run()` 取 `loadRecentMessages(conversationId, 20)`（硬截断），system prompt 仅 `workerId + summary + skill 列表`。
- `submitTask()`（service.ts:397-422）：每个 task 自建 `chat_id='task:{id}'` 的独立 conversation——chat 教过的人格、约定，task 派发时**完全看不到**。
- `packages/core/src/worker/conversation/router.ts:8-16`：仅按 `channel + chat_id [+ thread_id]` 查 open 会话；同一用户跨 channel 会被识别为不同人。
- `packages/core/src/worker/executor/engines/claude-code/executor.ts:88-138`：claude-code engine 仅给 CLI 发 last user message + `--replay-user-messages`，让 claude CLI 自管理 `~/.claude/projects/<conversationId>` 历史。**worker 历史与 engine 历史双轨不同步**。

### 3. Skill / MCP per-worker 现状

- `skill_bindings`（schema.ts:84-100）：已是 per-worker 表（`source` + `brain_name` + `skill_name`，`enabled` flag）。当前由 brain provider 全量列出，无 per-channel 覆盖。
- 系统提示中 skill **仅注入 name + description**（service.ts:305-318，brain.listSkills 全量列），无 progressive disclosure / 按需 load body。
- `packages/core/src/worker/executor/providers/mcp.ts:26-67`：`McpExecutor` 只实现 `listTools` + `tools/call`，无 chat；orchestrator 的 tool 调用走 executor.run() 内部，**没有走 MCP**——MCP 当前是「另一种 executor」而非「额外工具源」。
- `worker_config` 顶层无 `mcp.servers` 字段；apps/api 也没有「per-channel skill 启用」的 schema。

### 4. 自我迭代现状

- **半成品已落**（FEAT-006 + PLAN-006）：
  - `evolution_observations` 表（schema.ts:114-126）记录 conversation 触发的 observation
  - `pattern-miner.ts`：基于 tool-call 序列做 n-gram 统计
  - `proposer.ts:38-80`：扫近 N 条 observation 的 conversation 的 `execution_logs.tool_name` 序列，调用 pattern-miner，把高频序列以 `skill_drafts(status='pending')` 形式落盘
  - `skill_drafts` 表（schema.ts:102-112）+ approval workflow 的 schema 已经在
- **缺 Hermes 关键设计**：
  - LLM 综合（当前只是 n-gram 统计，不是「让 model 总结这 5 次 tool-call 该写成什么 skill」）
  - 三态记忆分离（仅 declarative skills + episodic conversations，无 procedural SKILL.md 文件 + MEMORY.md/USER.md/ROLLUP.md）
  - 容量硬上限驱动 consolidate
  - 半自动 offer（agent 在 chat 里主动询问 user "要不要保存为 skill / memory"）
  - Sandbox（FEAT-002 仍 pending）+ rollback

### 5. fs-layout 已有但未被 orchestrator 用上的 API

- `resolveAgentMdPath()` / `resolveSoulMdPath()` / `resolveUserMdPath()` / `resolveMemoriesDir()` / `resolveSkillsDir()` 全部已在 fs-layout 内导出，`ensureWorkerHome()` 启动时会种 `AGENT.md` / `SOUL.md` / `USER.md` 模板。
- orchestrator 的 system prompt 拼接（service.ts:305-318）**只读 summary + brain.listSkills**，根本没 inject 这三份 markdown——这是个低成本高回报的死活。

## 方案

总目标：把 worker 演进为「项目级落位、上下文连贯、skill/MCP 灵活可控、可自演化」的形态，engine 保持 user 级共享。按 5 个 phase 推进，每个 phase 产出一个独立 PLAN（待 master 批准后再起草）+ 配套 task。

### Phase A — 项目级落位（基础设施）

> 落地子方案：PLAN-022（待起）

**fs-layout 改造**：

- 新增 `resolveProjectRoot(cwd)`：从 cwd 向上找包含 `.aiworker/` 的最近祖先，止于 git 根 / fs 根。
- 新增 `resolveAiworkerScope(opts)`：返回 `{ scope: 'user' | 'project', home, layers }`，优先级：CLI flag > `AIWORKER_HOME` env > `<cwd>/.aiworker/` > 向上搜 > `~/.aiworker/`。
- `resolveWorkerHome(workerId)` 等保持签名不变，内部基于 scope 解析。
- 新增 layout 模板：`<project>/.aiworker/{AGENT.md, SOUL.md, USER.md, MEMORY.md, ROLLUP.md, skills/, memories/, mcp.json, local/{worker.db, workspaces/, identity.json, .secrets-key}}`。`local/` 强制 gitignore。

**Engine 仍 user 级**：

- `~/.claude.json` / `~/.codex/` 等 engine credential **不下沉**，project worker 直接继承 host 的 engine（已是当前 spawn + PATH 行为，无需改）。
- `~/.aiworker/secrets-vault` 提供「user 级 secrets」可选 inherit，避免每开新项目重配 OpenAI key（具体策略 Phase A 决策）。

**CLI 改造**：

- `aiworker init` 默认在 `pwd` 创建 `.aiworker/`（要求 `pwd` 为 git repo，否则报错；显式 `--global` 走原 `~/.aiworker/`）。
- 新增 `aiworker scope` 命令打印命中的 layer 路径（类 `git config --list --show-origin`）。
- `.aiworker/local/.gitignore` 自动写入。

### Phase B — 上下文连贯（消除"降智"）

> 落地子方案：PLAN-023（待起）

**B1. Conversation router 加 dmScope**（参 OpenClaw `session.mainKey`）：

- `worker_config.conversation`：`{ dmScope: 'main' | 'per-peer' | 'per-channel-peer' | 'per-account-channel-peer', identityLinks: { 'telegram:123': 'canonical:alice', ... } }`
- `router.ts` 按 dmScope 计算 `sessionKey`，写入 `conversations.session_key`（新列），lookup 由 `(channel, chat_id, thread_id)` 改为 `session_key`。
- 默认 `main` —— 单 worker 单 project 单主 session，跨 channel 同人自动连贯。

**B2. Task ↔ Chat 共享主 session**：

- `submitTask()` 默认改为续接当前主 session，task 体现为 `messages.kind='task-marker'`（仅审计，不影响 LLM 上下文）；保留 `submitTask({ isolated: true })` 选项。
- `chat_id='task:{id}'` 退化为 `messages.task_id` 引用，不再造独立 conversation。

**B3. Auto-compaction + summary 自动填充**（参 OpenClaw compaction）：

- `messages.kind: 'message' | 'compaction' | 'task-marker'`（新增列）。
- 触发条件：`historyTokens > windowRatio * limit`（默认 0.7）。
- Summarizer：调当前 executor，将「最早 N 条 message」摘要为一条 `kind='compaction'` message，写入 `conversations.summary`，老消息保留底层（不删）但 LLM 调用时只送摘要。
- 摘要前可选跑「pre-compaction memory flush」：让 model 主动写出关键信息到 `MEMORY.md`，再做 compaction。

**B4. Engine 端单一权威源**（消除双轨）：

- claude-code engine 退出 `--replay-user-messages` 模式，改用 `--input-format stream-json` + 完整 message history 传入。worker.db 成为唯一权威记录。
- `~/.claude/projects/` 仅作为 engine 端临时 cache，丢失不影响 worker 上下文。
- BUG-021 单独追踪此项变更（潜在性能影响，需 perf 验证）。

### Phase C — Bootstrap context（三态记忆）

> 落地子方案：future child plan（PLAN-024 已用于 Phase A hardening / BUG-021）

**C1. System prompt bootstrap 注入**（参 Hermes frozen snapshot）：

- 每次 `run()` 开头组装：`system = [SOUL.md] + [AGENT.md] + [USER.md] + [MEMORY.md] + [ROLLUP.md] + [conversation summary] + [skill descriptors]`
- session 启动时一次性 snapshot 这五份 markdown（frozen）；session 内即使文件改动也不重拼，**下个 session 才生效**——保 prompt cache。
- 文件不存在时 graceful skip。容量硬上限：MEMORY.md ≤ 2KB / USER.md ≤ 1.5KB（参 Hermes），超限触发 consolidator（Phase E）。

**C2. 三态分离**：

- **Procedural**：`<project>/.aiworker/skills/<name>/SKILL.md`（agentskills.io 兼容，YAML frontmatter + body，<500 行）—— 注入 prompt 仅 name + description（Phase D 详谈），按需 `load_skill(name)` 拉 body。
- **Declarative**：`SOUL.md`（性格预设）+ `AGENT.md`（行为约定）+ `USER.md`（用户偏好）+ `MEMORY.md`（长期事实）+ `ROLLUP.md`（cron 蒸馏的近期 decisions/todos）—— 全部 frozen snapshot 注入。
- **Episodic**：`messages` 表 + `<project>/.aiworker/memories/YYYY-MM-DD.md`（每日笔记，FTS5 索引按需检索）—— 不全量注入，提供 `memory_search(query)` tool。

**C3. memory_search 工具**：

- 复用 SQLite FTS5（zero deps），index `messages` + `memories/*.md`。
- 可选 embedding（Phase C 不强制，留挂载点）。
- 注入为 orchestrator tool，agent 自行调用。

### Phase D — Skill / MCP per-worker 灵活配置

> 落地子方案：future child plan

**D1. MCP per-worker 配置**：

- `worker_config.mcp.servers`：`Record<name, { command, args, env, transport: 'stdio' | 'streamable-http' | 'sse', url?, headers? }>`，secret 走 ref（参 OpenClaw `apiKey: { source: 'env', provider, id }`）。
- 启动时为每个 server 拉起 MCP client（复用 `packages/core/src/adapters/mcp/client.ts`），把所有 tool 合并到 orchestrator 的 tool registry。
- per-channel allow/deny：`worker_config.channels[<channel>].mcp.{allow,deny}` —— 一开始就上，避开 OpenClaw 的历史缺口（Issue #63399）。

**D2. Skill loading progressive disclosure**（参 OpenClaw roadmap Issue #39945）：

- snapshot 仅 `<name>` + `<description>` + `<location>` 注入 system prompt（紧凑列表）。
- 提供 `load_skill(name)` tool 让 agent 按需拉 SKILL.md 全文 → 省 token + 减小 prompt-injection 攻击面。
- 加载顺序（高 → 低 override）：channel-level binding > worker-level binding (`skill_bindings`) > project bundled (`<project>/.aiworker/skills/`) > user bundled (`~/.aiworker/skills/`) > package bundled。

**D3. per-channel skill allowlist**：

- `skill_bindings` 加 `channel` 列（nullable，null = worker-wide）+ `chat_id` 列（nullable，null = channel-wide）。
- 同名 skill 高优先级 override 低（不 merge）。
- 配置 UI/API 在 apps/api 暴露 `PUT /api/worker/config/skills` 校验后写入。

### Phase E — 自我迭代闭环（基于现有 evolution）

> 落地子方案：future child plan

**E1. LLM-driven skill synthesizer**：

- 替换 `proposer.ts` 当前的纯 pattern-miner 路径，改为「pattern-miner 找候选 → LLM 综合成 SKILL.md draft」。
- 触发器多源（参 Hermes）：任务完成且 ≥5 tool calls / pattern 检测到 ≥3 次相似 / 用户显式 `/save-as-skill` / 周期性（每 ~10 turns）。
- agent 在 chat 中主动 offer："要把这套流程保存为 skill `<name>` 吗？" → user approve 才写 `skill_drafts(status='pending')`，再走 D3 的 channel 启用。

**E2. Memory consolidator**：

- 容量硬上限（MEMORY.md ≤ 2KB）触发 → 调 LLM 把 MEMORY.md 重写为更紧凑形式，去重、合并、删过时。
- USER.md 同机制。
- 写盘前 diff 落 `memories/.history/`，可一键 rollback。

**E3. ROLLUP cron job**：

- 复用 `cron_jobs` 表，固定一条 `id='_evolution_rollup'`，cron `0 3 * * *`（每日 3 点）。
- 跑独立 conversation：`memory_search` 找近 24 小时的 decisions/todos → 综合 markdown → 写 `<project>/.aiworker/ROLLUP.md`（覆盖）。
- 永不进 compaction（活在 session 之外）。

**E4. Skill safety review + rollback**：

- agent 写 SKILL.md 前过 review pipeline：YAML frontmatter 校验 + 危险命令静态扫描（rm -rf / curl | sh / network exfil 等）+ 体积上限。
- 落盘走 `<project>/.aiworker/skills/<name>/SKILL.md`，git 跟踪自带版本；额外维护 `<name>/.history/` 用于 rollback。
- 高风险 skill 标 `requires_sandbox: true`，依赖 FEAT-002（sandbox runtime，仍 P3 pending）—— 不阻塞 E4，仅在 FEAT-002 落地后强制 sandbox 执行。

### Phase 推进顺序与决策点

推荐顺序：**A（基础）→ B（连贯性，杀手价值）→ D（per-worker 能力配置，用户核心诉求）→ C（三态记忆，bootstrap 注入）→ E（自演化闭环，依赖前四）**。

理由：
- B 的 dmScope + auto-compaction 解决用户体感「降智」，价值最直接，可独立验证。
- D 直接对应用户「每个 worker 独立配 skill / MCP」核心诉求。
- C 是 D/E 的前置（没有 SOUL/AGENT/MEMORY 注入，三态记忆无意义）。
- E 是终极目标但依赖前面所有基建，最后做。

## 风险

1. **claude-code 退出 `--replay-user-messages`（B4）的性能影响**：每轮发送完整 history 可能放大 token，需 perf 测试 + prompt cache 验证。回退策略：在 worker_config 加开关 `executor.claudeCode.legacyReplayMode: boolean`。
2. **dmScope=main 隐私边界**（B1）：跨 channel 同人共享主 session 可能让群聊内容泄露到私聊。**默认值改为 `per-channel-peer`** 更安全；`main` 仅作为 single-user 自托管推荐。需用户拍板。
3. **fs-layout 改造的兼容性**（A）：现有部署（systemd + docker）依赖 `AIWORKER_HOME=/var/lib/aiworker` 的硬路径，project scope 探测必须**仅在未显式设值时启用**，确保零回归。
4. **MCP per-worker（D1）secret 注入**：MCP server 配置里的 token / cookie 必须走 ref，禁止明文进 `worker_config.configJson`（与现有 SecretsVault 不变量一致）。否则 BUG-018 同类问题复发。
5. **agent 自演化的安全边界**（E）：自动写盘容易 prompt-inject 攻击（恶意 user 诱导 agent 写危险 SKILL.md / MEMORY.md）。E1 必须半自动（user approve），E2 容量驱动 + rollback，E4 静态扫描——三道闸不可省。
6. **多 phase 时间跨度**：5 个 phase 每个对应一个 PLAN，预计 2-4 周完成。中途 schema 频繁变化，需要严格 drizzle migration（`drizzle.worker.config.ts` 不混用）。
7. **Workspace 已隔离 vs project scope 重复**：PLAN-007 已让 conversation 独占 `$WORKER_DATA_ROOT/workspaces/<conversationId>/`。Phase A 的 project scope 与 workspace 隔离是两层概念（一个是 worker home 落位，一个是 engine cwd），需要在文档明确不重叠。

## 工作量

- Phase A：~3-4 文件改动（fs-layout + cli init/scope + 模板），低风险，~1 天。
- Phase B：~6-8 文件 + 1 schema migration（messages.kind, conversations.session_key），中风险（路由改动），~2-3 天。
- Phase C：~4-6 文件（bootstrap composer + memory tools），低风险，~1-2 天。
- Phase D：~8-10 文件 + 1 schema migration（skill_bindings.channel/chat_id, mcp.servers），中风险（MCP client 集成），~3-4 天。
- Phase E：~10-15 文件 + LLM 提示工程 + cron 集成，高风险（安全 + LLM 行为不可预测），~4-6 天。

总计 ~11-18 天 dev，加 test/docs 约 3 周。

## 备选方案

**B1 默认 dmScope**：
- `main`（极致连贯，single-user 自托管推荐）
- `per-channel-peer`（多用户场景安全默认，OpenClaw 推荐）
- 推荐 **`per-channel-peer`**，单用户场景文档建议手动切 `main`。

**E1 LLM synthesizer 触发器**：
- 全自动（agent 自决），高效但易失控
- 半自动（user approve，Hermes 风格）
- 推荐 **半自动**，与项目现有 per-tool approvals 哲学一致。

**MCP 集成形态**：
- 独立 MCP executor（当前形态，不参与 chat）
- 多 MCP server 合并到 orchestrator tool registry（参 OpenClaw）
- 推荐 **后者**，让 MCP 真正成为「能力扩展」而非「另一种 chat backend」。

**Engine 用户级 vs 项目级**：
- Engine 全部 user 级（用户已定）
- Engine credential 也可选项目级（如 `<project>/.aiworker/local/.claude.json`）
- 推荐 **全 user 级**，避免 N 项目 N 份 credential 的痛点。`<project>/.aiworker/local/` 仅放 worker 自身产物。

## 批注

### 2026-04-27 18:30 — master plan 批准 + 6 项决策定盘

用户一次性批准 PLAN-021 整体方向，6 项决策点最终值：

| # | 决策 | 终值 | 影响 |
|---|------|------|------|
| 1 | dmScope 默认值 | **`per-channel-peer`** | B1 router 实现按此默认；single-user 自托管文档建议手动切 `main` |
| 2 | E1 LLM synthesizer 触发 | **半自动**（user approve） | E1 必须在 chat 中 offer，等 approve 才写 `skill_drafts` |
| 3 | MCP 集成形态 | **合并到 orchestrator tool registry** | D1 MCP server 拉起后所有 tool 进 orchestrator，与现有 executor tool 同等地位；废弃 `McpExecutor` 作为「另一种 chat backend」的形态 |
| 4 | Engine credential 落位 | **全 user 级** | A 阶段 `<project>/.aiworker/local/` 仅放 worker 自身产物；`~/.claude.json` 等保持 host 级 |
| 5 | Phase 推进顺序 | **A → B → D → C → E**（确认） | 子方案按此顺序起 PLAN-022~026 |
| 6 | 推进节奏 | **一次性批准 master，分批起子 PLAN** | 每个子 PLAN 独立投递审批 + 实现 + 验证后再推下一个 |

下一步：起 PLAN-022（Phase A）+ 配套 task。
