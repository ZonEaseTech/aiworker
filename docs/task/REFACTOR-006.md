# REFACTOR-006 orchestrator API 入参 zod 校验 + 历史消息分页窗口

- **status**: completed
- **priority**: P2
- **owner**: (unassigned)
- **createdAt**: 2026-04-27
- **completedAt**: 2026-04-27
- **root issue**: BKD `nnid9urk`（ultrareview 暴露的 P2 健壮性 / 性能问题）
- **branch**: bkd/rnnpnbh8

## Description

代码审查发现 orchestrator 入口两处缺防线：

1. `apps/api/src/worker/orchestrator/routes.ts` 的 `POST /tasks` 仅做 `body.prompt.trim()` 长度判定，没有 zod schema 入口校验。MB 级 prompt 可以直灌进 SQLite + LLM；非 JSON body 也只能靠 hono 默认抛 500。
2. `packages/core/src/worker/orchestrator/service.ts::loadConversationMessages` 全量取一条 conversation 的所有 message 入 LLM prompt，没有 limit。长会话下 token 与 IO 双爆。`loadRecentMessages` 已存在但只在分类器里用了。

## 改动

### 1. routes 层 zod schema

`apps/api/src/worker/orchestrator/routes.ts`：

```ts
const submitTaskBody = z.object({
  prompt: z.string().trim().min(1, 'prompt is required').max(8000, 'prompt exceeds 8000 characters'),
})
```

- `trim` 进 schema，避免空白绕过 `min(1)`。
- `max(8000)` 限制：覆盖常见 OpenAI/Anthropic 单段 user message 上限，同时是 SQLite 单行的舒适区；超过时返回 `400 invalid-body` + `details: { prompt: [...] }`，调用方看得到具体原因。
- 移除原 `AppError.badRequest`，改走与 `routes/management` 一致的 `{ error: { code, message, details } }` 格式。

### 2. orchestrator history 窗口

`packages/core/src/worker/orchestrator/service.ts::run()`：

- 新私有方法 `loadHistoryWindow(conversationId)` 取 `config.orchestrator?.maxHistoryMessages ?? DEFAULT_MAX_HISTORY_MESSAGES (20)` 条最近消息，复用 `loadRecentMessages`（已 `desc(messages.id) limit N` 然后 reverse，时间序仍是早→晚）。
- 删掉 `loadConversationMessages`（无 limit 全量取）。
- `buildSystemPrompt(priorSummary)` 接受 conversation summary：当未来某个总结 trick 把早期上下文压缩到 `conversations.summary` 后，可以塞进 system prompt 弥补窗口截断。MVP 暂时只读 `conversation.summary` 字段（已存在），未实际写入。

### 3. WorkerConfig 加 `orchestrator` 块

- `packages/shared/src/fleet/config.ts` 加 `OrchestratorConfig { maxHistoryMessages?: number }` + `DEFAULT_MAX_HISTORY_MESSAGES = 20`。
- `WorkerConfig.orchestrator?: OrchestratorConfig`（可选，旧 config 视同缺省）。
- `packages/core/src/worker/management/config-schema.ts` 加 `orchestratorConfigSchema`：`maxHistoryMessages: z.number().int().min(1).max(200).optional()`。上限 200 足够任何"长会话也想看完整 transcript"的需求；下限 1（不能 0，run() 至少要拿到当前一轮 user message 自己）。

## 测试

- `apps/api/src/worker/orchestrator/routes.test.ts`（新增）：6 个用例覆盖空串 / 纯空白 / 超长 / 边界 8000 / 正常 trim / 非 JSON。
- `packages/core/src/worker/orchestrator/service.history.test.ts`（新增）：3 个用例覆盖默认 20 / 自定义 5 / 总数低于 cap 不截断。executor 用 capturing stub 抓 `messages` 数组断言长度与首尾。

## 影响面

- 行为兼容：旧 config 不带 `orchestrator` 字段仍能 load（schema optional）；旧 prompt < 8000 chars 仍 201。
- 单条 prompt 超 8000 字符的调用方需改为分块发送或先 summary——历史上没有这种 caller，dashboard / cli 都在 4KB 以内。
- 长会话首次 run() 行为变更：原来灌 N 条历史，现在最多灌 20。如果某个测试依赖"全量历史进 LLM"的副作用会受影响，已 grep 全仓无此假设。

## Acceptance criteria

1. `POST /tasks` 空 prompt → 400 `invalid-body`，不进 orchestrator。
2. `POST /tasks` 8001 字符 prompt → 400 `invalid-body`，details 含 `prompt`。
3. `POST /tasks` `'  hello  '` → 201，submitTask 收到 trim 后的 `'hello'`。
4. 50 条历史 + 缺省 config → run() 收到 1 system + 20 history，最末是新 user message。
5. 50 条历史 + `orchestrator.maxHistoryMessages = 5` → run() 收到 1 system + 5 history。
6. `bun run typecheck` 全 workspace pass；`bun test` core/api/shared 全绿；`bun run lint` 无新增报错。

## 验证

- `bun test apps/api/src/worker/orchestrator/routes.test.ts` → 6 pass
- `bun test packages/core/src/worker/orchestrator/service.history.test.ts` → 3 pass
- `bun test packages/core/src/worker/orchestrator/` → 39 pass（含原 36 + 新 3）
- `bun run typecheck` → 9 workspaces pass
- 全 workspace `bun run test` 全绿（gateway 87 / core 406 / api 38 / web 24+13 skip / shared 18）。
