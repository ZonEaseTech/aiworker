export const soulProtocolPackage = {
  name: '@zonease/aiworker-soul-protocol',
  descriptor: 'dist/soul.descriptor.json',
  sections: [
    'protocol',
    'identity',
    'compatibility',
    'capabilities',
    'configuration',
    'workbench',
    'api',
    'engine',
    'health',
    'extensions',
    'external',
  ],
} as const
