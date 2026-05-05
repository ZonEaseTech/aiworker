# PLAN-111 Worker API surface 修复（OpenAPI / serve preflight / debug env）

- **status**: pending
- **createdAt**: 2026-05-05 04:25
- **relatedTask**: BUG-065, TODO-016, TODO-014

## 现状

QA-005 在 worker REST 与 process surface 上发现 3 个互锁缺陷：

1. **BUG-065 P2**：`apps/api/src/modes/worker.ts:168-220` main app 是 `OpenAPIHono`，调用 `app.doc('/openapi.json')`，但 6 个 sub-router（orchestrator / evolution / events / brain / management / channels）全部是 plain `Hono`；其中 70+ endpoint 都是 `app.get(...)` / `app.post(...)`，没有任何 `.openapi(routeDef, handler)` 调用。结果 `/openapi.json` 返回 `paths: {}`，`/docs` Scalar UI 渲染 0 endpoint，违反 AGENTS.md "API 文档以代码为准" 规则。
2. **TODO-016 P2**：`apps/cli/src/commands/worker/serve.ts:145` `Bun.serve({ port })` 失败时不会抛回 CLI；当端口已被占用时，`setsid + > log 2>&1 &` 包装把错误吞掉，shell 拿到的 `$!` 是 setsid wrapper 已退出，调用方无法判别 serve 是否真的起来。`/health` 在端口冲突场景下命中"前一个 serve"，token 不一致级联 401，根因被掩盖。
3. **TODO-014 P3**：`packages/core/src/worker/executor/safe-env.ts:89-93` `BLOCK_PREFIXES = ['AIWORKER_', 'INTERNAL_', 'WORKER_']`。这个 block 是为了防止 `AIWORKER_MASTER_KEY` / `AIWORKER_JOIN_TOKEN` 泄漏到 engine subprocess。但同样 block 掉了 release-debug skill 依赖的 `AIWORKER_DEBUG_*` / `DEBUG_ROOT` 类调试环境变量，导致 fake-claude shim 拿不到 `AIWORKER_DEBUG_DUMP_DIR`，dump 写到 `/tmp/dump`，evidence 收集静默失败。

涉及文件：

| 层 | 文件 |
|----|------|
| worker app bootstrap | `apps/api/src/modes/worker.ts` |
| sub-routers | `apps/api/src/worker/{management,orchestrator,evolution,events,brain,channels}/routes.ts` |
| CLI serve handler | `apps/cli/src/commands/worker/serve.ts` |
| safe-env | `packages/core/src/worker/executor/safe-env.ts` |
| 现有测试 | `serve.test.ts`、`serve.integration.test.ts`、`safe-env.test.ts`、`apps/api/src/worker/**/*.test.ts` |

## 方案

### A. BUG-065 — OpenAPIHono 全量上线（最小可观察修复）

完整重写 70+ endpoint 的 zod schema 工作量过大。本轮采用 **two-step minimal fix**：

1. **Step 1**：把 6 个 sub-router 的 `Hono` 改为 `OpenAPIHono`，主 app `app.doc('/openapi.json')` 在挂载所有 sub-router 之后调用。这一步本身不会让 paths 自动填充（因为依然是 plain `.get`），但为 step 2 解锁。
2. **Step 2**：把以下 **核心 10 个 endpoint** 改写成 `.openapi(routeDef, handler)`，覆盖 admin UI / fleet 客户端最依赖的路径，达到 BUG-065 验收 "paths >= 10"：
   - `GET /health`（main app）
   - `GET /api/worker/info`（management）
   - `GET /api/worker/brain/summary`（brain）
   - `GET /api/worker/brain/admission`（brain list）
   - `GET /api/worker/brain/admission/:id`（brain show）
   - `POST /api/worker/brain/admission/:id/approve`（brain approve）
   - `POST /api/worker/brain/admission/:id/apply`（brain apply）
   - `GET /api/worker/sessions`（management）
   - `POST /api/worker/orchestrator/chat`（orchestrator submit）
   - `GET /api/worker/events/stream`（events SSE — schema 用 `text/event-stream` content type）
3. zod schema 复用 `@zonease/aiworker-shared` 已有 schema（admission proposal / decisions / chat envelope）；新建 schema 仅当 shared 未导出时。
4. 其余 plain `.get` endpoint 保留现状，留 follow-up `PLAN-XXX OpenAPI doc completeness` 收尾。
5. `/openapi.json` 增加 `tags`：`channels`、`orchestrator`、`brain`、`evolution`、`events`、`management`，便于 Scalar UI 分组。
6. 测试：snapshot test 校验 `/openapi.json` paths 至少包含上述 10 条；schema 字段非空。

### B. TODO-016 — serve port preflight + pid file + /health self-id

1. `apps/cli/src/commands/worker/serve.ts` 在 `Bun.serve` 之前增加 `tryBindPreflight(host, port)`：
   - 用 `Bun.listen` 或 `net.createServer`(node:net) 测试性 listen，立刻 close。
   - 失败（EADDRINUSE / EACCES）时 console.error + 给出 `lsof -tiTCP:${port} -sTCP:LISTEN` 提示文案 + `process.exit(1)`。
   - 成功 close 后立即 spawn `Bun.serve`；race condition 极小（同一进程内 ms 级），可接受。
2. 新增 `--pid-file <path>` CLI flag：写当前 `process.pid` 到指定路径；SIGTERM/SIGINT 时清理。CLI 注册 in `apps/cli/src/aiworker.ts` 的 `serve` 命令。
3. `/health` 响应增加：`workerHome` 路径（`workerEnv.WORKER_DB_PATH` 的 dirname）、`projectScope` 字段（resolveAiworkerScope），便于 curl 不带 token 自检"对不对"。注意不要泄漏 token；只暴露路径。
4. 测试：
   - `serve.test.ts`：mock listen 失败 → exit 1 + 错误文案含 port 与 pid 提示。
   - `serve.test.ts`：传 `--pid-file /tmp/x.pid` → 写文件，shutdown 清理。
   - `worker.test.ts` 或 `worker-bootstrap.test.ts`：`/health` 返回新字段。

### C. TODO-014 — debug env passthrough（narrow allowlist）

不能直接把 `AIWORKER_` 加到 `PASSTHROUGH_PREFIXES`（会泄漏 `AIWORKER_MASTER_KEY` / `AIWORKER_JOIN_TOKEN`）。改用 **explicit-allow override**：

1. `safe-env.ts` 引入 `EXPLICIT_PASSTHROUGH_PREFIXES = ['AIWORKER_DEBUG_', 'DEBUG_']` —— 这两个 prefix 名义上仅用于调试，若真泄漏也是 ops 自己写进 env 的。
2. `buildFilteredEnv` 顺序改为：
   1. 计算 `explicitlyAllowed = EXPLICIT_PASSTHROUGH_PREFIXES.some(p => name.startsWith(p))`
   2. 如果 `explicitlyAllowed` → 直接放行（绕过 BLOCK / passthrough 检查）。
   3. 否则走原 `isBlocked` → `isPassthrough` 流程。
3. `EXPLICIT_PASSTHROUGH_PREFIXES` 仅作用于 `buildSafeChildEnv`（engine subprocess）。`buildSafeGitEnv` 不受影响（git 工作流不需要 debug env）。
4. `safe-env.test.ts` 增加：
   - `AIWORKER_DEBUG_DUMP_DIR=/x` → 子进程能拿到。
   - `DEBUG_ROOT=/x` → 子进程能拿到。
   - `AIWORKER_MASTER_KEY=abc` → 子进程拿不到（仍被 BLOCK_PREFIXES 命中）。
   - `AIWORKER_JOIN_TOKEN=abc` → 仍 block（避免 release-debug skill 误把 secret 塞进 engine）。
5. 文档：`docs/architecture.md` `## 安全` 段或新增 `docs/cli.md#executor-debug-env` 简短说明 explicit-allow 的语义。

## 风险

1. **OpenAPIHono sub-router 改造**：sub-router 内部已经依赖 plain `Hono` 的 middleware 链。`OpenAPIHono extends Hono` 是 100% drop-in；中间件签名兼容。但 `app.route('/api/worker/brain', sub)` 在 OpenAPIHono 之间的合并行为已被 `@hono/zod-openapi` 显式支持，需要注意 `sub.openapi(...)` 注册的 path 是 sub 的本地 path（`/admission`），mount 后变成 `/api/worker/brain/admission`。
2. **port preflight race**：同 host 多进程并发时仍可能出现"preflight 通过 → bind 时被抢"；但比静默 success 强；保留 `Bun.serve` 自身错误回到 try/catch。
3. **explicit-allow 安全收口**：把 `AIWORKER_DEBUG_*` 列入 explicit allow 是一次小型 trust extension。我们在测试里固化"`AIWORKER_MASTER_KEY` 不能被 explicit-allow 旁路"，并在 docs/cli.md 写明。
4. **/health 暴露路径**：`workerHome` 是非敏感路径；token / secret 不外泄。`projectScope` 也非敏感。

## 范围

- `apps/api/src/modes/worker.ts` + 6 sub-router（OpenAPIHono 升级 + 10 个 typed endpoint）
- `apps/cli/src/commands/worker/serve.ts` + CLI 入口（preflight / --pid-file）
- `apps/cli/src/aiworker.ts`（注册 `--pid-file` flag）
- `packages/core/src/worker/executor/safe-env.ts` + 测试
- focused unit + integration tests + OpenAPI snapshot test
- `docs/cli.md`（serve flags / executor debug env）+ `docs/architecture.md`（OpenAPI 段补充 typed endpoint scope）

## 非范围

- 全 70+ endpoint 全量 typed 化（留 follow-up plan）
- `/health` 暴露 worker.db 内容或更多状态
- 跨 worker 的端口注册中心 / leader election（与 fleet 控制面已独立）

## 验证

- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run typecheck` / `bun run lint` 全量
- 手工 smoke：本地 `aiworker serve --port 19999` → curl `/openapi.json` paths 应 ≥ 10；`aiworker serve --port 19999` 占用后再次启动 → exit 1 + 明确错误；env `AIWORKER_DEBUG_DUMP_DIR=/tmp/x` + `DEBUG_ROOT=/tmp/x` 通过 engine spawn 抵达 fake-claude shim。

## 进度

- 2026-05-05 04:25：plan created。
