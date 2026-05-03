# PLAN-069 Executor tiny probe hard timeout

- **status**: completed
- **createdAt**: 2026-05-02 22:02
- **approvedAt**: 2026-05-03 00:00
- **completedAt**: 2026-05-03 10:38
- **relatedTask**: BUG-046

## 现状

1. `handleExecutorTest()` 在 `probe=true` 时会调用
   `state.runtime.executor.run()` 并传入 5 秒后 abort 的 `AbortSignal`。
2. `runTinyProbe()` 目前直接 `for await` executor stream；如果某个 executor
   adapter 不响应 abort，底层 `next()` 可以永远不 settle，导致 worker API
   请求也不返回。
3. Worker Admin Test 的 executor 按钮只依赖 TanStack mutation 的 pending 状态；
   当 API 不返回或浏览器 fetch 无 timeout 时，按钮会一直 disabled。
4. 当前 core 测试只覆盖正常输出、throw、error event 与截断，没有覆盖
   “stream 忽略 abort 且不产生事件”的路径。
5. 当前 Web API / TestPanel 测试没有覆盖 executor test 请求 timeout 或错误后
   按钮恢复。

## 方案

1. 在 core tiny probe 内增加管理层 hard timeout：异步迭代每次取 event 时都与
   deadline race；超时后 abort controller，尽力调用 iterator `return()` 清理，
   并返回 `status: degraded`、`tinyProbe.ok=false`、`probeError` 为 timeout 文案。
2. 保持 API shape 不变，不新增公开配置；仅给 `handleExecutorTest()` 增加测试用
   内部 timeout override，生产路径仍使用 5 秒预算。
3. 在 Web `testExecutor()` 客户端增加 executor-test 请求 timeout；即使后端或
   网络没有返回，mutation 也会 settle 为可读错误。
4. 在 Worker Admin TestPanel 的 executor 错误态增加 tiny probe timeout 场景下的
   简短处理提示，并确保 mutation error 后按钮恢复可点击。
5. 补 focused tests：core 覆盖忽略 abort 的 stream，Web API 覆盖请求 timeout，
   Web component 覆盖错误态按钮恢复与提示。

## 风险

1. JS 无法强制取消一个完全不 cooperative 的 pending promise；hard timeout 可以
   让 API 返回，但底层 adapter 若不响应 abort，仍可能短暂留有悬挂工作。这里会
   尽力 `abort()` + `return()`，真正的 engine 子进程清理仍归 adapter 所有。
2. Web 客户端 timeout 不能设得太短，否则真实 Codex executor 首次启动会被误判；
   应设置为明显高于 5 秒 probe timeout 的预算。
3. 需要避免把 timeout 文案做成新的 API contract；断言应围绕 degraded/ok=false
   和包含 timeout 语义。

## 范围

- `packages/core/src/worker/management/executor-test.ts`
- `packages/core/src/worker/management/executor-test.test.ts`
- `apps/web/src/worker/api.ts`
- `apps/web/src/worker/api.test.ts`
- `apps/web/src/worker/features/test/test-panel.tsx`
- `apps/web/src/worker/features/test/test-panel.test.tsx`
- `docs/task/BUG-046.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## 非范围

- 不改 executor engine adapter 的运行协议或子进程管理。
- 不改 `/api/worker/executor/test` 请求/响应公开 schema。
- 不处理 `BUG-045` task lifecycle、`BUG-047` no-token admin UX 或
  `BUG-048` init legacy home collision。
- 不做真实 Codex-backed Worker Admin smoke，除非 focused tests 暴露无法覆盖的
  行为。

## 验证

- Passed: `bun test packages/core/src/worker/management/executor-test.test.ts`
- Passed: `bun run --filter '@zonease/aiworker-web' test -- src/worker/api.test.ts src/worker/features/test/test-panel.test.tsx`
- Passed: `bun run --filter '@zonease/aiworker-core' typecheck`
- Passed: `bun run --filter '@zonease/aiworker-web' typecheck`
- Passed: `bunx eslint packages/core/src/worker/management/executor-test.ts packages/core/src/worker/management/executor-test.test.ts apps/web/src/worker/api.ts apps/web/src/worker/api.test.ts apps/web/src/worker/features/test/test-panel.tsx apps/web/src/worker/features/test/test-panel.test.tsx`
- Passed: `git diff --check`

## 结果

- Tiny probe stream iteration now has a hard management-layer deadline even
  when an executor stream ignores abort and never yields.
- Probe timeout responses remain HTTP 200 with `status: degraded`,
  `tinyProbe.ok=false`, and a timeout `probeError`.
- Worker Admin executor test requests now abort after a client-side budget and
  the Test panel shows a timeout recovery hint while re-enabling the button.
