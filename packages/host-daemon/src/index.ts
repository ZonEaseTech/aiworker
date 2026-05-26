export const hostDaemonPackage = {
  name: '@zonease/aiworker-host-daemon',
  owns: [
    'local-broker-routes',
    'openapi-broker-contract',
    'cli-web-mounted-soul-api-entry',
  ],
} as const
