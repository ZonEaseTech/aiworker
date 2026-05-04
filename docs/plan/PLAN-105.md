# PLAN-105 Project Brain 注入贯穿 4 个 executor adapter

- **status**: completed
- **createdAt**: 2026-05-04 23:30
- **approvedAt**: 2026-05-04 23:30
- **completedAt**: 2026-05-05 00:35
- **relatedTask**: BUG-056, BUG-057

## 现状

QA-004（0.6.0 published claude-code 端到端调试）证据指向同一根因：orchestrator
`ContextManager` / `RunContextComposer` 已正确把 `AGENT.md / SOUL.md / USER.md /
MEMORY.md / ROLLUP.md / capability-packs / scope manifest / brain skills` 拼成
`role=system` 段并塞到 `messages[0]`，但 5 个 executor adapter 在投递子进程时全部
丢弃 system 段：

- `claude-code` adapter `buildBaseArgs` 不拼 `--system-prompt` /
  `--append-system-prompt`，`sendUserMessage` envelope 只取最后 user。
- `codex` / `acp` / `cursor` / `mcp` 4 个 adapter 架构上类似，需要在调查阶段确认
  各自的 system 通道（CLI flag / app-server protocol header / MCP system tool）。

业务证据（决定性）：4 个完全不同的 Soul 在同一 prompt 下 self-intro 几乎一致，
都是 claude-code default system 的"软件工程助手"叙事，与 SOUL/AGENT/MEMORY 配置
完全无关。

并发症：`orchestrator/intent-classifier.ts` 与 `orchestrator/quality-gate.ts`
通过同一条 adapter 通道发 LLM 请求；它们的 prompt 拼装完全没有 system 段、没有
JSON schema 指令、没有 retry，也就 100% 失败回退 heuristic（`reason: SyntaxError:
JSON Parse error: Unexpected identifier "React"`）。即便 -056 修了 adapter 通道，
不修 -057 仍然没用。

涉及文件：

| 层 | 文件 | 关键行 |
|----|------|------|
| ContextManager | `packages/core/src/worker/orchestrator/context-manager.ts` | L42-75 / L97-114 |
| Orchestrator | `packages/core/src/worker/orchestrator/service.ts` | L275-276 / L1027-1032 |
| Intent classifier | `packages/core/src/worker/orchestrator/intent-classifier.ts` | L46-81 |
| Quality gate | `packages/core/src/worker/orchestrator/quality-gate.ts` | L23-34 |
| Capability registry | `packages/core/src/worker/orchestrator/capabilities.ts` | L99 |
| claude-code | `packages/core/src/worker/executor/engines/claude-code/{executor,protocol}.ts` | L243-260 / L98-107 |
| codex / acp / cursor / mcp | `packages/core/src/worker/executor/engines/{codex,acp,cursor,mcp}/*` | 待调查 |

## 方案

**用户决策**：BUG-056 全 engine 适配；BUG-057 一并修；不做向后兼容（0.6.x 未投入
生产）。

### Phase A — 调查（先于编码）

1. 对 5 个 engine 列出当前 `messages` → 子进程的 marshaling 路径，确认：
   - 是否丢弃 role=system 段；
   - 子进程 / app-server / MCP 协议是否原生支持 system；
   - 多轮 / `--resume` / session 持久化下 system 是否需要每轮重发。
2. 用 `/home/ben/projects/debug-aiworker/qa-2026-05-04/bin/claude` 已有的 fake
   shim 思路，落地一个 in-repo `tests/fixtures/fake-engine` 通用 harness（claude-
   code 必须，其他 engine 视改动量）。

### Phase B — adapter system prompt 注入

按 engine 形态分别落地：

1. **claude-code**：
   - `buildBaseArgs` 加 `--append-system-prompt <joined-system-text>`（多 system
     段 `\n\n---\n\n` 拼接，长度超限时截断保护 high-priority sections）。
   - 显式禁用 `--resume`（默认每轮 stateless 投递，AIWorker 自己管 history）；或
     每轮 re-send append-system-prompt 覆盖。先按 stateless 实现（更可观测）。
   - `sendUserMessage` 仅发 last-user envelope（不再合并 history 到一条 user
     text）。history 用 prior `--append-system-prompt` 段携带，或转 user/assistant
     pairs 通过 stream-json envelope 顺序投递（择更稳形态）。
2. **codex / acp / cursor / mcp**：分别在 Phase A 调查后选择最贴近 protocol 的
   注入路径，落代码 + 单元测试。共享一份 `composeSystemPromptText` helper，避免
   多处重复拼接。
3. brain memories 注入策略与 hot-load：保持 ContextManager 已有路径不变（PLAN-
   102 brief compiler 接入留作 follow-up plan，本轮范围不含）。
4. 把"实际注入到 LLM 的 system 文本"通过 orchestrator 事件（如
   `orchestrator.system_prompt_injected`）emit，方便后续 audit / Worker Admin UI
   观察。事件不写 worker.db conversations 表（PLAN-103 边界），仅作 ephemeral
   observability。

### Phase C — decision pipeline LLM schema

1. `intent-classifier.ts` `buildIntentPrompt`：构造 system 段：

   ```text
   You are an internal classifier. Output ONLY a JSON object matching:
   {"intent":"answer"|"planning"|...,"sessionAction":"...","risk":"low"|"med"|"high","confidence":0..1,"reason":"..."}
   No markdown. No prose. No code fence.
   ```

   走 adapter 注入；首次 `JSON.parse` 失败追加 strict re-prompt 重试一次；最终仍
   失败再 fallback heuristic + emit reason 含 `llm-retry-exhausted`。
2. `quality-gate.ts` `buildQualityGatePrompt`：同形态加 system + schema + 1 次
   retry。
3. `capabilities.ts`：本轮**不接 LLM**，但把 reason 文案从硬编码 observe-only 改
   为显式声明"by design 走 deterministic registry，LLM 入口留 follow-up"。
4. `controlExecutor` 推荐独立配置：在 `docs/cli.md` / `docs/architecture.md` 加
   说明，但 schema / 默认值不动（沿用 PLAN-097 已落地路径）。

## 风险

1. **claude-code 协议假设**：调查 phase 必须先用 fake shim 抓 0.6.0 path
   `--append-system-prompt` 与 stream-json 的实际行为；如果 protocol 已变化，
   adapter 修法需重新设计。
2. **disable --resume 影响多轮 latency**：每轮 re-send system + history 会增
   token；stateless 策略对长会话有 token 增量，但与产品定位（每轮 brain 可能
   reload）一致。Latency 数据要在验证阶段记录。
3. **跨 engine 蔓延**：5 engine 同时改动面较大；如果某个 engine（如 mcp）原生不
   支持 system 段，本轮可能需要降级方案（合并到 user prompt 头并显式标注），并
   在 plan 内说明。
4. **测试基础设施**：fake-engine harness 第一次落地，可能与 TODO-008（Soul brain
   executor validation harness）重叠；本轮先落 minimum viable harness，TODO-008
   留 follow-up。
5. **审计完整性**：`orchestrator.system_prompt_injected` 事件如果太冗长，会污染
   event bus；落地时控制 payload size（hash + 长度 + 关键 section ids）。

## 范围

- `packages/core/src/worker/executor/engines/{claude-code,codex,acp,cursor,mcp}/*`
- `packages/core/src/worker/orchestrator/{intent-classifier,quality-gate,capabilities}.ts`
- `packages/core/src/worker/orchestrator/service.ts`（如需 emit 新事件）
- `packages/shared/src/orchestrator/*`（如需新 zod 事件 schema）
- `tests/fixtures/fake-engine/*` 或 `packages/core/src/worker/executor/__tests__/*`
- focused unit + integration tests
- docs/cli.md / docs/architecture.md / docs/executor-engines.md（按需补 system
  注入路径说明）

## 非范围

- BrainBriefCompiler 接入 orchestrator system prompt 路径（PLAN-102 P1 留 follow-
  up plan）。
- capability registry 接 LLM（本轮明确 by design 走 deterministic）。
- 把 system prompt 写回 worker.db conversations / messages 表（PLAN-103 边界，
  follow-up）。
- channel inbound（telegram / lark / whatsapp）任何修改。

## 验证

- 5 engine 各自的 adapter unit tests：system 段实际进入子进程 / app-server /
  MCP 调用 payload。
- claude-code integration test 通过 fake-engine harness 验证 stdin/argv 含
  system；多轮验证每轮 system 重发。
- intent-classifier / quality-gate unit tests：mock executor 返回有效 JSON →
  source = `*-llm`、reason 不含 `JSON Parse error`；返回脏数据 → retry 一次
  → 最终 fallback heuristic + reason 含 `llm-retry-exhausted`。
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-shared' test`（如有 schema 改动）
- `bun run typecheck` / `bun run lint` 全量
- `bun run test` 全量（最终）

## 进度

- 2026-05-04 23:30：用户批准方案（5 engine 全适配 / BUG-057 一并修 / 不做向后
  兼容）。Plan claimed BUG-056 / BUG-057。
- 2026-05-04 23:45：Phase A 调查完成。实际 chat 路径执行器 4 个（claude-code /
  codex / acp / cursor）需要改 adapter；`http` provider 已正确（`messages.map
  (toOpenAiMessage)` 全角色透传），`cli` / `mcp` providers 的 `run` 未实现 chat
  （`return { type:'error', error:'... not implemented' }`），不在 chat 注入范围。
- 2026-05-05 00:30：Phase B + C 实施完成。
  - 新建 `packages/core/src/worker/executor/engines/common/run-input.ts` +
    单元测试（10 tests）：`extractRunMessages` / `composeSystemPromptText` /
    `renderHistoryAsUserPreamble` 三个共享 helper。
  - claude-code adapter：`buildBaseArgs` 新增 systemPromptText 参数 →
    `--append-system-prompt`；删除 `--resume` 路径；用户 envelope 携带 history
    preamble。9 tests pass，含新 system+history 注入断言。
  - codex adapter：resume / 非 resume 统一发 `fullPrompt`（`<System>...
    </System>` XML 化），SOUL/MEMORY 编辑在每轮 fresh re-render。11 tests pass。
  - acp adapter：`session/prompt` content blocks 改为 `[system_block, history
    _block, user_block]`；acp-stub 增加 `ACP_PROMPT_TRACE_FILE` env 抓取 prompt
    内容。11 tests pass，含新 prompt block 内容断言。
  - cursor adapter：`composeCursorPrompt` 公共函数把 system + history + user
    折成单条 stdin 文本。11 tests pass。
  - intent-classifier / quality-gate：抽 `runIntentLlm` / `runQualityGateLlm`，
    JSON.parse 失败时追加 strict re-prompt 重试 1 次；最终回退 reason 含
    `llm-retry-exhausted`。intent + quality-gate 各加 2 个 retry / fallback 测试。
- 2026-05-05 00:35：验证通过：core test 573 pass（baseline 554），workspace
  typecheck 9/9 全绿，root lint 0 violation。BUG-056 / BUG-057 完成，状态机切
  到 completed。
  现状：

  | Engine | 现状 | 修复策略 |
  |--------|------|----------|
  | claude-code | 仅取 latestUser；`buildBaseArgs` 不传 system | `--append-system-prompt <persona>`；禁用 `--resume`；user envelope 携带 history preamble |
  | codex | 首轮 `renderCodexPrompt` XML 化全 messages；resume 轮丢弃 system+history | resume / 非 resume 轮统一 re-render system+history 进 prompt |
  | acp | 仅取 latestUser；`session/prompt` 单 content block | `prompt: [system_block, ...history_blocks, latest_user_block]` |
  | cursor | 仅 latestUser 进 stdin；无 system flag | stdin 写"persona/memory + history + user"组合文本 |
  | http (OpenAI-compat) | 已正确 | 无 |
  | cli / mcp | 不实现 chat | 不在 chat 注入范围 |

  共享 helper 落在 `packages/core/src/worker/executor/engines/common/run-input.ts`：
  - `composeSystemPromptText(messages)`：拼接所有 role=system 段（`---` 分隔）
  - `extractRunMessages(messages)`：返回 `{ system, history, latestUser }`
  - `renderHistoryAsUserPreamble(history)`：渲染成 `Recent conversation:\n<role>: <text>` 形态供无 system flag 的 adapter 使用

  BUG-057：`buildIntentPrompt` / `buildGatePrompt` 已正确构造 system + JSON schema
  指令，QA-004 失败的真因是上述 adapter 层 system 被丢；BUG-056 修通后 schema 指令
  天然到达 LLM。本 plan 在此基础上额外加：JSON.parse 失败时 1 次 strict retry
  （追加 "Previous output was not valid JSON. Output JSON only:"），仍失败再
  fallback heuristic + reason 含 `llm-retry-exhausted`。
