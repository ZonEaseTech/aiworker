# PLAN-195 Worker artifact metadata index

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 17:06
- **approvedAt**: 2026-05-09 17:06
- **completedAt**: 2026-05-09 17:12
- **relatedTask**: REFACTOR-029

## Current State

worker 运行结果目前没有统一的 artifact metadata 表。`agent_tasks` 表只承载 run
状态与结果；messages 保存对话文本；Brain artifacts 是 Project Brain registry，
不应被复用为 workbench 的通用产物索引。

Open Design 的可借鉴点不是表结构逐字复制，而是边界：

- 实际文件留在 project/workspace folder；
- SQLite 保存 metadata；
- web 通过 daemon API 读取 project files / conversations / run state；
- run 与 artifact 的关系是 workbench 默认面，而不是治理层附属面。

## Proposal

S2A 建立最小 artifact metadata 基础：

1. Storage
   - 新增 `worker_artifacts`：
     - `id`
     - `run_id`
     - `conversation_id`
     - `relative_path`
     - `kind`
     - `title`
     - `mime_type`
     - `size_bytes`
     - `hash`
     - `source`
     - `status`
     - `metadata`
     - `created_at`
     - `updated_at`
   - `relative_path` 唯一；run/conversation/status/updated_at 建索引。

2. Core
   - 新增 `WorkerArtifactService`：
     - `registerArtifact(input)`
     - `listArtifacts(filters)`
     - `getArtifact(id)`
   - `relativePath` 必须是非空相对路径，拒绝绝对路径、`.`、`..` escape。

3. API
   - `GET /api/worker/artifacts?runId=&conversationId=&status=&limit=`
   - `GET /api/worker/artifacts/:id`
   - 注册到 Worker OpenAPI path registry。

4. Web API
   - 增加 `WorkerArtifact` type；
   - 增加 `listWorkerArtifacts()` / `getWorkerArtifact()` client 方法，避免与 Brain
     artifact registry client 混名；
   - 仅做 API client 层测试，不改 UI。

## Risks

- **过早建模**：如果 artifact kind 设计太细，会提前绑定 HR/developer/PM 领域。本 slice 只保留通用 `kind` 字符串。
- **路径安全**：artifact metadata 不能允许绝对路径或 `..` escape，否则后续 raw serving 容易继承风险。
- **双 registry 误读**：`worker_artifacts` 是 workbench 产物索引，不是 Brain artifact registry；命名和 API route 必须避免混用。

## Verification

- `bun run --filter '@zonease/aiworker-storage-sqlite' test -- src/worker/index.test.ts`
- `bun run --filter '@zonease/aiworker-core' test -- src/worker/artifacts/service.test.ts`
- `bun run --filter '@zonease/aiworker-api' test -- src/worker/artifacts/routes.test.ts src/modes/worker.openapi.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/api.test.ts`
- package typecheck for changed packages
- `git diff --check`
- code-review-graph change review

## Progress

- 2026-05-09 17:06：认领 S2A；范围收敛为 worker artifact metadata index，不做文件写入和 UI 改造。
- 2026-05-09 17:12：完成 `worker_artifacts` schema/migration、core service、worker REST
  read surface、web API client 与 focused tests；CRG `detect-changes` 为 risk 0.50、0
  affected flows，impact-radius 提示 DB/API 高半径后已补跑 run service/API/CLI 邻近测试。
