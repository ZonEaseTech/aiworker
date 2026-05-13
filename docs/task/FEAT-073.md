# FEAT-073 Soul App protocol interaction closure

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-14 00:00
- **plan**: PLAN-305
- **relatesTo**: FEAT-072, packages/shared, apps/api, apps/web, apps/aiworker-hr, apps/aiworker-qa

## 背景

Host 已能发现并渲染 Soul App 声明的 shell descriptor，但 shell action 仍不可点击，
search/settings 也没有统一调用路径。下一步要把 Host mounted 体验从“可见”推进到
“可操作”，同时保持 Soul App 拥有领域语义。

## 目标

- Host 提供 generic action/search local API。
- Host 只调用 manifest 中声明的 action/search provider。
- HR/QA mounted service 实现最小协议 handler。
- Worker Web 通过 generic API 调用 shell action/search，不写 app-specific 分支。
- PMA、验证、browser smoke、code-review-graph 和 conventional commit 收口。

## 非目标

- 不接入真实 Logto。
- 不接入真实 S3/GCP/vault provider。
- 不实现跨 app 编排。
- 不让 Host 创建或持久化 HR profile / QA release gate 领域对象。

## 验收标准

- HR/QA shell primary action 可点击并返回 app-owned result。
- HR/QA shell search 通过 generic search endpoint 返回 app-owned summaries。
- settings intent 通过 app-declared action 调用。
- undeclared action/search 被 Host 拒绝。
- disabled app action/search 被 Host 拒绝。
- focused tests、root gates、browser smoke 和 code-review-graph 通过。

## 验证

- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-hr' typecheck`
- `bun run --filter '@zonease/aiworker-qa' typecheck`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run --filter '@zonease/aiworker-hr' smoke`
- `bun run --filter '@zonease/aiworker-qa' smoke`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- Browser smoke on `http://127.0.0.1:5273/`: clicked `New people profile` and saw `People profile draft opened by HR app.`; searched `ada` and saw `People profile: ada` with `HR app-owned profile match for ada`.
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

`crg:review` exited 0 and reported static test gaps for private mounted helper
symbols such as `serveHostMounted`, `hrProtocolAction`, and `hrProtocolSearch`.
Those paths are covered through the HR/QA mounted-service HTTP tests and the
Host/Web integration tests that exercise the protocol endpoints.
