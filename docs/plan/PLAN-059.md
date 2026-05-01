# PLAN-059 Worker info runtimeVersion 发布版本注入

- **status**: completed
- **createdAt**: 2026-05-02
- **approvedAt**: 2026-05-02
- **completedAt**: 2026-05-02 01:14
- **relatedTask**: BUG-038

## 现状

1. `packages/core/src/worker/management/info.ts` 仍用 `WORKER_RUNTIME_VERSION = '0.2.0'` 生成 `WorkerInfo.runtimeVersion`。
2. `apps/api/src/worker/management/routes.ts` 的 `/api/worker/info` 和 `apps/cli/src/commands/serve.ts` 的 gateway `workers.info` handler 都调用同一个 `buildInfo`，所以 HTTP bridge 与 `fleet info` 会一起返回 stale 值。
3. CLI 自身的 `--version` 已从 `apps/cli/package.json` 读取发布版本；当前发布包版本是 `0.4.10`，但 worker info 链路没有把这个版本传入 runtime。
4. API OpenAPI doc 里仍有 `version: '0.2.0'`，它与 worker info 字段的旧注释绑定，也会继续误导 operator。

## 方案

1. 让 `buildInfo` 从调用方传入 `runtimeVersion`，移除 core 内部硬编码的 stale 常量。
2. 在 worker bootstrap / management route 之间传递同一份 runtime version；源码直跑时使用明确的 dev fallback，避免伪装成发布版本。
3. 在 `aiworker serve` 注册时把 CLI package 版本注入到 serve/bootstrap/gateway info 路径，保证发布包启动的 worker 上报同一个版本。
4. 同步 OpenAPI doc version 与 `WorkerInfo.runtimeVersion`，避免两个对外信号再次分叉。
5. 更新 focused tests，至少覆盖 `buildInfo` 不再断言 stale literal，并覆盖 management route 能返回注入版本。

## 范围

- 修改 core worker info builder。
- 修改 API worker bootstrap / management route 的版本传递。
- 修改 CLI `serve` 调用方传入 package version。
- 更新相关 focused tests 与 BUG-038 状态记录。
- 不改 executor protocol `clientInfo.version`，那是 engine protocol client metadata，语义与 worker published runtime version 不同。

## 风险

1. **版本来源分散**：如果 API 源码直跑、CLI 发布包、未来容器镜像各自传值规则不同，可能产生新 skew。方案用 bootstrap option 集中汇入，未来镜像也可显式注入。
2. **测试过拟合当前版本**：测试不应硬断言 `0.4.10`，应使用测试注入值。
3. **字段语义误读**：本轮保留 `runtimeVersion` 字段语义为 AIWorker worker runtime / CLI distribution version，不把 executor CLI 版本塞进来。

## 验证

- `bun test packages/core/src/worker/management/info.test.ts`
- `bun test apps/api/src/worker/management/routes.test.ts`
- `bun test apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## 备选方案

1. Core 直接 import `apps/cli/package.json`：不采用，会让 transport-agnostic core 反向依赖 app package。
2. 只读 `process.env.AIWORKER_RUNTIME_VERSION`：可作为未来部署入口，但本轮不作为唯一机制，避免隐藏在 env 里导致测试和源码路径不明确。
3. 重命名 `runtimeVersion`：不采用，现有 API/CLI 已依赖该字段；BUG-038 的目标是让它成为可信版本信号。

## 批注

- 2026-05-02：调查完成，等待用户批准实施。
- 2026-05-02：用户批准，开始实施。
- 2026-05-02：实现完成。core 不再硬编码 worker info 版本；CLI `serve` 注入 package version；HTTP info、OpenAPI doc 和 gateway `workers.info` 共享同一版本值。
