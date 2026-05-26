export const engineBridgePackage = {
  name: '@zonease/aiworker-engine-bridge',
  owns: [
    'adapter-registry',
    'process-manager',
    'invocation-state',
    'event-pipeline',
    'reattach',
    'cancel',
    'reconciler',
    'redaction',
  ],
} as const
