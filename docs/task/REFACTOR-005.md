# REFACTOR-005 worker.db 关键查询路径补索引

- **status**: completed
- **priority**: P2
- **owner**: bkd/crwsk2q7
- **createdAt**: 2026-04-27
- **completedAt**: 2026-04-27
- **bkd issue**: `crwsk2q7`（root issue: `nnid9urk`）

## Description

代码审查发现 `packages/storage-sqlite/src/worker/schema.ts` 多张表在热路径 where / order by 上没有索引，对应到大量场景：

| 表 | 字段 | 热路径调用点 |
|---|---|---|
| `messages` | `conversationId` | `apps/api/src/worker/orchestrator/routes.ts:35`、`packages/core/src/worker/orchestrator/service.ts:295`、`packages/core/src/worker/conversation/router.ts:92` |
| `conversations` | `(channel, chatId, threadId, status)` | `findOpenConversation`（`conversation/router.ts:13-15`）—— 每条入站消息至少一次 |
| `conversations` | `lastActiveAt` | `apps/api/src/worker/orchestrator/routes.ts:29` `ORDER BY ... DESC LIMIT 200` |
| `cron_jobs` | `(enabled, nextRunAt)` | `packages/core/src/worker/cron/service.ts:190` 每分钟 tick `WHERE enabled=true AND nextRunAt<=now` 全表扫 |
| `evolution_observations` | `noticedAt` | `apps/api/src/worker/evolution/routes.ts:9` `ORDER BY ... DESC LIMIT 200`、`evolution/proposer.ts:45` |
| `agent_tasks` | `createdAt` | `apps/api/src/worker/orchestrator/routes.ts:16` `ORDER BY ... DESC LIMIT 200` |
| `execution_logs` | `conversationId` | `evolution/proposer.ts:68` `WHERE conversationId IN (?)` |

会话/事件/cron 单 worker 长期累积量大，全表扫成本随 row count 线性增长。给定 worker.db 体积上限基本只受 SQLite 5TB 上限和磁盘约束，迟早会拖死。

## Outcomes

`packages/storage-sqlite/src/worker/schema.ts` 在原表第二参数里追加 7 个 index。`bun run db:generate:worker` 出 `drizzle/worker/0003_rare_cloak.sql`：

```sql
CREATE INDEX `agent_tasks_created_at_idx` ON `agent_tasks` (`created_at`);
CREATE INDEX `conversations_lookup_idx` ON `conversations` (`channel`,`chat_id`,`thread_id`,`status`);
CREATE INDEX `conversations_last_active_at_idx` ON `conversations` (`last_active_at`);
CREATE INDEX `cron_jobs_due_idx` ON `cron_jobs` (`enabled`,`next_run_at`);
CREATE INDEX `evolution_observations_noticed_at_idx` ON `evolution_observations` (`noticed_at`);
CREATE INDEX `execution_logs_conversation_id_idx` ON `execution_logs` (`conversation_id`);
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`);
```

设计说明：

- **`conversations_lookup_idx` 设计成 `(channel, chat_id, thread_id, status)` 复合**：覆盖 `findOpenConversation` 的两种 where（带 / 不带 threadId）。带 threadId 时四列全等值；不带 threadId 时 SQLite 仍能用前 2 列做索引扫描（验证在新增烟测里）。把 `status` 放最后是因为它只有两个枚举值，选择性差，前面 chat 维度先收敛。
- **`cron_jobs_due_idx` 用 `(enabled, next_run_at)` 复合**：tick 每分钟一次的 `WHERE enabled=true AND next_run_at<=now` 是 range scan，复合索引让 planner 直接定位"enabled=1 段内 next_run_at <= now"的连续区间。
- **DESC 排序索引未单独标 `desc()`**：SQLite 对单列普通索引可以反向扫，无需为 `ORDER BY ... DESC` 重复建。

### 烟测

`packages/storage-sqlite/src/worker/index.test.ts`（新文件，9 个 case）做两件事：

1. 对每个新加的索引跑一次 `EXPLAIN QUERY PLAN`，断言 plan 文本里出现对应 index 名（含 `conversations_lookup_idx` 在不带 threadId 的 3 列前缀查询里仍命中）。
2. 100k messages 单 conversation 点查（99k 噪声 + 1k 目标）的 wallclock 应 < 100ms（实测 bun:sqlite + WAL 在 ~1-2ms，留 100ms buffer 兼容慢 CI）。

`storage-sqlite` 之前没 test runner，本次给 `package.json` 加了 `"test": "bun test"`，纳入 root 的 `bun run --filter '*' test` 里。

## 验证

```
$ bun run typecheck   # 9/9 包 0 error
$ bun run test        # 9 包全绿
  - storage-sqlite: 9/9 (新增)
  - core:           403/403
  - api:             32/32
  - gateway:         87/87
  - 其它包均不变
```

## ActiveForm

补 worker.db 关键查询路径上的索引并出 migration

## Dependencies

- **blocked by**：（无）
- **blocks**：（无；纯加速，不改 query 语义）

## Notes

- 这次没碰 `fleet.db`。fleet schema 当前只有 `registered_workers` + `audit_events`，audit_events 短期还没大到要补索引；如果后续 audit 量上来再单开 task。
- `(enabled, next_run_at)` 这样的复合索引在新建表时无开销；存量 worker.db 在 `runWorkerMigrations` 时 `CREATE INDEX` 会扫一遍现有行——大 worker.db 第一次 boot 会有几秒到几十秒延时，正常。
- 后续若 `evolution_observations` 引入定期压实（REFACTOR-003 follow-up），可考虑把 noticedAt 索引改成 partial index，先观察。
