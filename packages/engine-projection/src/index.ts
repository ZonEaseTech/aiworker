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
