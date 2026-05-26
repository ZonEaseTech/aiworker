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
