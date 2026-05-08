/**
 * `@zonease/aiworker-core` — transport-agnostic worker runtime。
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
  markBootstrapShown,
  mintApiToken,
  mintWorkerId,
  printBootstrapIfJustMinted,
  type StoredConfig,
} from './worker/bootstrap'

// Brain admission service (PLAN-101)：generated brain change 必须先进 admission
// proposal，state machine pending → approved | rejected → applied | failed；
// MVP 只对 `memory-add` 自动 materialize，其他 kind 进表但不自动落 filesystem。
export {
  type ApplyOptions,
  type ApplyOutcome,
  type ApprovalContext,
  BrainAdmissionService,
  type BrainAdmissionStateError,
  createBrainAdmissionService,
  type ListBrainAdmissionOptions,
  type ReadBrainAdmissionOptions,
} from './worker/brain/admission'

// Brain artifact registry (PLAN-099)：scope-bound business material 登记，
// 不复制内容；CLI / API 通过 ListBrainArtifactsOptions / ReadBrainArtifactsOptions
// 控制 sensitivity 过滤与 ref/hash 默认 redact 行为。
export {
  BrainArtifactRegistry,
  createBrainArtifactRegistry,
  type ListBrainArtifactsOptions,
  type ReadBrainArtifactsOptions,
} from './worker/brain/artifacts'

// Brain brief compiler (PLAN-102)：把 canonical brain（AGENT/SOUL/USER/MEMORY
// /ROLLUP、scope manifest、Soul module、artifact registry、admission service）
// 投影成 task-specific brief。preview-only：orchestrator 不默认替换粗粒度
// persona 拼接，CLI `aiworker brain brief` 给 operator 预览用。
export {
  BrainBriefCompiler,
  type BrainBriefCompilerDeps,
  createBrainBriefCompiler,
} from './worker/brain/brief'

// Brain diagnostics：CLI / 管理 API 共用的只读 source 摘要。
export { type BrainSourceDiagnostic, describeBrainSource } from './worker/brain/diagnostics'

// Brain Journal trace (PLAN-174)：worker-local append-only proof-loop trace.
// It records task / decision / gate / executor observations without admitting
// anything into canonical Brain memory.
export {
  type BrainGateVerdict,
  type BrainGateVerdictAction,
  type BrainGateVerdictReason,
  type BrainGateVerdictReasonMode,
  type BrainGateVerdictReasonSource,
  type BrainJournalAuthorityMode,
  type BrainJournalEventDto,
  type BrainJournalEventKind,
  type BrainJournalMessageRef,
  BrainJournalService,
  type BrainJournalServiceDeps,
  type BrainJournalTrace,
  buildGateVerdict,
  createBrainJournalService,
  describeExecutorAuthority,
  type ReadBrainJournalOptions,
  recordBrainJournalEvent,
  type RecordBrainJournalEventInput,
} from './worker/brain/journal'

// Brain Engine reviewer (PLAN-176)：bounded no-tools evaluator for result
// review, evidence gaps, unsupported claims, and lesson candidates.
export {
  type BrainEngineLessonCandidate,
  type BrainEngineReviewAction,
  type BrainEngineReviewInput,
  type BrainEngineReviewResult,
  DEFAULT_BRAIN_ENGINE_REVIEW_BUDGET_MS,
  reviewTaskWithBrainEngine,
} from './worker/brain/reviewer'

// Brain Inbox (PLAN-178)：turn Brain Engine lesson candidates into pending
// Brain admission proposals without writing canonical memory automatically.
export {
  BrainInboxService,
  type BrainInboxCandidate,
  type BrainInboxProposalResult,
  createBrainInboxService,
  type ProposeBrainInboxFromTaskOptions,
} from './worker/brain/inbox'

// Authority preflight (PLAN-179)：truthful high-risk warning for ambient
// executor authority. It does not claim sandbox or permission-broker control.
export {
  type AuthorityPreflightResult,
  type AuthorityPreflightSignal,
  detectAuthorityPreflight,
  operatorAuthorityMode,
  type OperatorAuthorityMode,
} from './worker/brain/authority'

// Brain summary 聚合（PLAN-103）：从 worker.db 读 admission / artifact 计数 +
// scope manifest 状态，喂给 buildInfo 与 fleet UI；不复制 payload / artifact
// ref / canonical brain 文本。
export { type BrainSummaryDecisionPipelineConfig, buildBrainSummary } from './worker/brain/summary'

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

export {
  DEFAULT_EXECUTOR_PROFILE,
  DEFAULT_PROFILES,
  type ResolvedVariant,
  resolveVariant,
} from './worker/executor/default-profiles'

// Gateway-client（PLAN-013 S4）：worker node 主动接入 gateway 的 WS 客户端。
export {
  type GatewayNode,
  type GatewayNodeEnrollOptions,
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
  applyConfigUpdate,
  type ApplyConfigUpdateArgs,
  type ApplyConfigUpdateResult,
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
// PLAN-116 decision pipeline truthfulness ring buffer.
export {
  getDecisionPipelineSnapshot,
  recordConversationClassifier,
  recordIntentDecision,
  recordQualityGate,
  resetDecisionPipelineStats,
} from './worker/orchestrator/decision-pipeline-stats'

export { ProcessManager } from './worker/orchestrator/process-manager'

// Runtime builder + 类型。
export { type BuildRuntimeDeps, buildWorkerRuntime, type WorkerRuntime } from './worker/runtime'

// Secrets vault：master key 加密的 worker 持久化 secret。
export { getSecretsVault, resetSecretsVaultForTests, SecretsVault } from './worker/secrets'
export { timingSafeEqualStrings } from './worker/secrets/crypto'

export {
  type ClosedTranscriptMaintenanceItem,
  type ClosedTranscriptMaintenanceOptions,
  type ClosedTranscriptMaintenanceResult,
  type EngineBindingSummary,
  getSessionStatus,
  listSessionStatuses,
  type ListSessionStatusOptions,
  planClosedTranscriptMaintenance,
  runClosedTranscriptMaintenance,
  type SessionEntryStatus,
  type SessionStatusDto,
  type SessionStatusPage,
} from './worker/sessions/status'
