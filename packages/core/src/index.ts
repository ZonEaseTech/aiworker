/**
 * `@aiworker/core` — transport-agnostic worker runtime。
 *
 * 封装 brain provider、executor provider、channel adapter、orchestrator、
 * gateway-client、cron、approvals、secrets、bootstrap、config 校验/写入/热重载
 * 等所有 worker 业务逻辑。**不**依赖 Hono / Scalar / Fastify 等具体 HTTP 框架；
 * apps/api 在 core 之上挂上 OpenAPIHono 路由，apps/cli 直接消费 core 完成 CLI 流程。
 *
 * 公共面对齐 PLAN-011 时期的 `apps/api/src/lib.ts` 桥面，增加了 Hono 路由所需
 * 的内部 helper（buildInfo / handleBrainTest 等），让路由层只 import 一次。
 */

// Worker mode env access。CLI / 路由层都从这里取 workerEnv。
export { getWorkerEnv, type WorkerEnv, workerEnv } from './config/worker'

// Worker bootstrap：mint identity、seed config、首次启动打印 bootstrap 行。
export {
  type BootstrapOptions,
  DEFAULT_EMPTY_CONFIG,
  type IdentityLoadResult,
  loadOrMintIdentity,
  loadOrSeedConfig,
  mintApiToken,
  mintWorkerId,
  printBootstrapIfJustMinted,
  type StoredConfig,
} from './worker/bootstrap'

// Channel registry：路由 / 管理 API 都通过这个枚举 + 注册表挂 adapter。
export { ChannelRegistry, getChannelAdapter } from './worker/channels/registry'

// Config secret 路径枚举 / hydrate / redact 工具。
export { enumerateSecretPaths, hydrateSecrets, redactSecrets } from './worker/config/secret-paths'

// Cron service（PLAN-014 §F4）：runtime 启动 / dispose 时挂载。
export { type CronOrchestratorLike, CronService, type CronServiceDeps } from './worker/cron/service'
export type { CronJobInput, CronJobPatch, CronJobRecord } from './worker/cron/types'

// Event bus type：调用方可以订阅 runtime.bus。
export { WorkerEventBus } from './worker/events/bus'

// Engine availability probe：CLI / 管理 API 共用。
export {
  getAvailabilityProbe,
  resetAvailabilityProbeForTests,
} from './worker/executor/availability'

// Gateway-client（PLAN-013 S4）：worker node 主动接入 gateway 的 WS 客户端。
export {
  type GatewayNode,
  type GatewayNodeOptions,
  type NodeHandlers,
  type OrchestratorLike,
  startGatewayNode,
  stopGatewayNode,
  type WebSocketCtor,
  type WebSocketLike,
} from './worker/gateway-client'
export { buildCronHandlers, type CronServiceLike } from './worker/gateway-client/methods/cron'

// Worker management：config 读写、token rotate、各类 *_test 探针、buildInfo。
export { handleBrainTest } from './worker/management/brain-test'
export { handleChannelTest } from './worker/management/channel-test'
export {
  ConfigVersionConflictError,
  InvalidConfigError,
  mirrorConfigToYaml,
  putConfig,
  type PutConfigOptions,
  readConfig,
  type StoredWorkerConfig,
} from './worker/management/config'
export { handleExecutorTest } from './worker/management/executor-test'
export { buildInfo } from './worker/management/info'
export { handleTokenRotate, type RotateTokenCurrentState, type RotateTokenResponse } from './worker/management/rotate'
export { deleteSecret, listSecrets, putSecret } from './worker/management/secrets'
export type { WorkerModeState } from './worker/management/state'

// Orchestrator 内部 store + ProcessManager（hot-reload 跨实例持久化）。
export { ApprovalStore } from './worker/orchestrator/approvals'
export { ProcessManager } from './worker/orchestrator/process-manager'

// Runtime builder + 类型。
export { type BuildRuntimeDeps, buildWorkerRuntime, type WorkerRuntime } from './worker/runtime'

// Secrets vault：master key 加密的 worker 持久化 secret。
export { getSecretsVault, resetSecretsVaultForTests, SecretsVault } from './worker/secrets'
export { timingSafeEqualStrings } from './worker/secrets/crypto'
