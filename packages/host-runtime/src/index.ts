export const hostRuntimePackage = {
  name: '@zonease/aiworker-host-runtime',
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
  type HostAuthInput,
  type HostAuthMethod,
  type HostAuthProvider,
  type HostAuthProviderKind,
  type HostAuthResult,
  type HostIdentity,
  type HostIdentityGrant,
  type LocalBearerAuthProviderOptions,
} from './host/identity-provider'
export {
  createHostRuntime,
  type CreateHostSoulWorkerInput,
  type CreateHostSoulWorkerResult,
  type HostOfficialSoulAppBootstrap,
  HostRuntime,
  type HostRuntimeOptions,
} from './host/runtime'
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
  findHostCapability,
  findHostSoul,
  getHostedSoulApp,
  hostedSoulAppFromRow,
  type HostSoulCatalog,
  installSoulAppFromPath,
  installSoulDescriptor,
  listHostCapabilitiesForSoul,
  listHostedSoulApps,
  listHostSoulCatalog,
  runSoulAppHealthcheck,
  type SoulAppRegistryContext,
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
  LOCAL_ENGINE_DEFINITIONS,
  type LocalEngineDefinition,
  LocalEngineResolutionError,
  type ResolvedLocalCliEngine,
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
  AppError,
  mintWorkerId,
  slugify,
  WORKER_ID_ALPHABET,
  WORKER_ID_PATTERN,
} from '@zonease/aiworker-soul-protocol'
