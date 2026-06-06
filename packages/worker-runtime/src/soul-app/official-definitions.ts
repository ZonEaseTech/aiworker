export interface OfficialSoulAppDefinition {
  id: string
  descriptorPath: string
}

export const OFFICIAL_SOUL_APPS = [
  {
    descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
    id: 'aiworker-freeform',
  },
  {
    descriptorPath: 'souls/google-ads/dist/soul.descriptor.json',
    id: 'google-ads',
  },
  {
    descriptorPath: 'souls/hr-manager/dist/soul.descriptor.json',
    id: 'hr-manager',
  },
  {
    descriptorPath: 'souls/product-manager/dist/soul.descriptor.json',
    id: 'product-manager',
  },
  {
    descriptorPath: 'souls/software-support/dist/soul.descriptor.json',
    id: 'software-support',
  },
] as const satisfies readonly OfficialSoulAppDefinition[]
