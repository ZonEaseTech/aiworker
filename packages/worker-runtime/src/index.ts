export const workerRuntimePackage = {
  name: '@zonease/aiworker-worker-runtime',
  owns: [
    'worker-locator',
    'workspace-locator',
    'session-lifecycle',
    'descriptor-cache-consumption',
    'worker-configuration-orchestration',
    'engine-invocation-orchestration',
  ],
} as const

export {
  getWorkerEnv,
  type WorkerEnv,
  workerEnv,
} from './config/worker'
export {
  createLocalBearerAuthProvider,
  type LocalBearerAuthProviderOptions,
  type WorkerApiAuthInput,
  type WorkerApiAuthMethod,
  type WorkerApiAuthProvider,
  type WorkerApiAuthProviderKind,
  type WorkerApiAuthResult,
  type WorkerApiIdentity,
  type WorkerApiIdentityGrant,
} from './orchestration/identity-provider'
export {
  type CreateSoulWorkerInput,
  type CreateSoulWorkerResult,
  createWorkerOrchestrator,
  type OfficialSoulAppBootstrap,
  WorkerOrchestrator,
  type WorkerOrchestratorOptions,
} from './orchestration/orchestrator'
export {
  bootstrapOfficialSoulApps,
  discardOfficialSoulAppRetiredMetadata,
  OFFICIAL_SOUL_APPS,
  type OfficialRetiredMetadataDiscardResult,
  type OfficialSoulAppBootstrapAction,
  type OfficialSoulAppBootstrapOptions,
  type OfficialSoulAppBootstrapResult,
  type OfficialSoulAppDefinition,
} from './soul-app/official'
export {
  archiveSoulApp,
  deleteSoulApp,
  enableSoulApp,
  findCatalogSoul,
  getHostedSoulApp,
  hostedSoulAppFromRow,
  installSoulAppFromPath,
  installSoulDescriptor,
  listHostedSoulApps,
  listSoulCatalog,
  runSoulAppHealthcheck,
  type SoulAppRegistryContext,
  type SoulCatalog,
  type SoulDescriptorInstallInput,
} from './soul-app/registry'
export { sanitizeEngineEnv, soulAppServiceEnv } from './worker/engine-env'
export {
  type LocalWorkerEvent,
  LocalWorkerEventBus,
  type LocalWorkerEventHandler,
  type LocalWorkerEventKind,
} from './worker/events'
export {
  createExternalEngineExecutor,
  DEFAULT_LOCAL_CLI_ENGINE_TIMEOUT_MS,
  type ExternalEngineExecutorOptions,
  type LocalExecutor,
  LocalExecutorFailure,
  type LocalExecutorInput,
  type LocalExecutorResult,
} from './worker/executor'
export {
  type LocalFileWriteInput,
  type LocalWorkspaceFileEntry,
  LocalWorkspaceFiles,
} from './worker/files'
export {
  CREDENTIAL_PROBEABLE_ENGINE_IDS,
  type InspectEngineCredential,
  inspectLocalEngineCredential,
  LOCAL_ENGINE_DEFINITIONS,
  type LocalEngineDefinition,
  LocalEngineResolutionError,
  type ResolvedLocalCliEngine,
  resolveEngineAuthReadiness,
  resolveLocalCliEngine,
  scanLocalEngines,
  scanLocalEnginesFromCommands,
} from './worker/local-engine-resolver'
export {
  type CreateLocalSessionInput,
  createLocalWorkerRuntime,
  type CreateLocalWorkspaceInput,
  type LocalInvocationEventReattachResult,
  type LocalInvocationReconcileInput,
  type LocalInvocationReconcileResult,
  type LocalInvocationStartResult,
  LocalWorkerRuntime,
  type LocalWorkerRuntimeOptions,
  type LocalWorkerSnapshot,
  type StartLocalInvocationInput,
  type WorkspaceAssetProjectionResult,
} from './worker/runtime'
export {
  freezeSessionEngineMetadata,
  type FrozenSessionEngine,
  type LatestInvocationEngine,
  readFrozenSessionEngine,
  type ResolvedSessionEngine,
  resolveFrozenSessionEngine,
} from './worker/session-engine'
export {
  applyAutoEngineTitle,
  applyAutoTruncatedTitle,
  applyUserTitle,
  readSessionTitleSource,
  type SessionTitlePatch,
  type SessionTitleSource,
  stripSessionTitleSourceMetadata,
} from './worker/session-title-policy'
export {
  AppError,
  mintWorkerId,
  slugify,
  WORKER_ID_ALPHABET,
  WORKER_ID_PATTERN,
} from '@zonease/aiworker-soul-descriptor'
