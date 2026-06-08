export {
  cleanupWorkspaceProjectionReceipt,
  computeWorkspaceProjectionFreshnessMarker,
  engineAssetProjectionReceiptPath,
  listBaselineAssets,
  projectEngineAssetsToWorkspace,
  readBaselineAssetContent,
  resolveSoulAppEngineTarget,
} from './workspace-projection'
export type {
  BaselineAssetContent,
  BaselineAssetStoreKind,
  EngineAssetProjectionInput,
  EngineAssetSource,
  ReservedOverlayProjectionConfig,
  WorkerOverlayProjectionAsset,
  WorkspaceProjectionFreshnessInput,
  WorkspaceProjectionReceiptCleanupInput,
  WorkspaceProjectionReceiptCleanupResult,
} from './workspace-projection'

export const engineProjectionPackage = {
  name: '@zonease/aiworker-engine-projection',
  owns: [
    'workspace-assets',
    'skills',
    'native-mcp-files',
    'entry-files',
    'projection-receipts',
    'receipt-cleanup',
  ],
} as const
