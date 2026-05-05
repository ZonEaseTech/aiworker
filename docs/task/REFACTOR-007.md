# REFACTOR-007 杂项小修：bus 异常吞 / lark cache / fleet count / secrets key

- **status**: completed
- **priority**: P2
- **owner**: bkd/scj2356z
- **createdAt**: 2026-04-27
- **completedAt**: 2026-05-05 23:48
- **trigger**: 代码审查（root issue `nnid9urk`）落到 `8s9tprje` 协调，scj2356z 子任务

## DOC-006 status sync

`docs/task/index.md` 已将本任务标为 completed，当前代码中也能看到对应实现面：
`WorkerEventBus` 测试、`resetLarkTokenCache`、fleet persistence count/list 优化、
`secretKeySchema`。DOC-006 仅同步文件内 stale `in-review` 状态，不重开实现。

## Description

四处低风险但易留坑的小问题，合一个 issue 一并改。每条都附带测试。

### 1. WorkerEventBus.emit 静默吞 listener 异常

**位置**：`packages/core/src/worker/events/bus.ts:14-19`

**症状**：`for (const l of this.listeners) { try { l(event) } catch {} }` 完全静默。当 evolution observer / proposer / cron 任意异步 listener 抛错时，调试通道被切断——bug 永久不可见。

**修复**：换成 `consola.warn` 上报，保留"一个 listener 抛错不阻断其他 listener"的语义。

### 2. Lark tokenCache 跨 hot-reload 不清理

**位置**：`packages/core/src/worker/channels/adapters/lark.ts:67`

**症状**：`tokenCache` 是模块级 `Map`，`larkAdapter` 又是导出的 `const` 单例对象（非工厂）。`runtime.dispose()` 后旧 token 仍可能在 `expiresAt` 之前被新 runtime 复用——若 hot-reload 同时换掉 `appId` / `appSecret`，新 runtime 拿着旧凭据签出的 token 去 send 即报错。

**修复**：

- 新增 `export function resetLarkTokenCache()`，与 `__larkInternals.resetTokenCache` 共享同一份函数引用。
- `runtime.dispose()` 末尾调一次 `resetLarkTokenCache()`，强制下次 send 重新换 token。
- 不下沉到 ChannelRegistry 实例（worker 进程是 single-tenant，全清是合适的，避免大改 adapter API）。

### 3. Fleet 持久化层用 JS 端聚合代替 SQL

**位置**：`packages/gateway/src/registry/persistence.ts:39-52, 269-275`

**症状**：

- `countRegisteredWorkers` 用 `select().all().length`——千行 fleet 时把整张表拉进 JS 才数行数。
- `listRegisteredWorkers` JS `Array.sort()`——同上，且 SQLite 已经能 `ORDER BY` 下推。

**修复**：

- `countRegisteredWorkers` → `select({ value: count() }).get()`（drizzle-orm `count` helper）。
- `listRegisteredWorkers` → `.orderBy(desc(registeredWorkers.addedAt))`，去掉 JS 端 sort。

### 4. secrets/:key 路径 key 不做格式校验

**位置**：`apps/api/src/worker/management/routes.ts:150-187`

**症状**：路径 param 直接透传给 `vault.put` / `vault.remove`。脏 key（路径分隔符 / 控制字符 / 超长串）会留在 vault 里，且 `worker_config` 里 `{{ secrets.<key> }}` ref 占位符撑死支持 `[A-Za-z0-9._-]{1,128}`，写入合法之外的 key 永远不可被 hydrate。

**修复**：路由入口加 `secretKeySchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/)`，PUT / DELETE 都先校验，不通过返 400 `invalid-key`。

## Acceptance Criteria

1. bus listener throw 时 log 出错（`bus.test.ts` 覆盖）。
2. lark hot-reload 后 token 重新拉（`lark.test.ts` 新增 `resetLarkTokenCache` 端到端 case + 引用一致性 case）。
3. fleet count 上千 workers 时不全表加载（`persistence.test.ts` 覆盖 count 精度 + list 排序下推）。
4. secrets PUT / DELETE 非法 key 返 400（`routes.test.ts` 覆盖空格 / 超长 / DELETE 三条）。

## Notes

- 没有迁移、没有 schema 变更、没有 API 兼容性问题。
- runtime.ts 多了一个 `resetLarkTokenCache()` 调用——dispose 顺序不变（在 cron.stop 之后、processes 释放说明之前）。
- 没有引入 transport-side 依赖到 `packages/core`：仍只 import 自己包内的模块。

## ActiveForm

Polishing four P2 robustness fixes (bus / lark cache / fleet SQL / secrets key)
