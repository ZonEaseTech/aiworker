export interface OfficialSoulAppDefinition {
  id: string
  descriptorPath: string
}

export const ALL_FIRST_PARTY_OFFICIAL_SOUL_APPS = [
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

export const SHIPPED_OFFICIAL_SOUL_APPS = ALL_FIRST_PARTY_OFFICIAL_SOUL_APPS
  .filter(definition => definition.id === 'aiworker-freeform') satisfies readonly OfficialSoulAppDefinition[]

export const DEV_SAMPLING_OFFICIAL_SOUL_APPS = ALL_FIRST_PARTY_OFFICIAL_SOUL_APPS

export const OFFICIAL_SOUL_CATALOG_VIEWS = {
  'dev-sampling': DEV_SAMPLING_OFFICIAL_SOUL_APPS,
  'shipped': SHIPPED_OFFICIAL_SOUL_APPS,
} as const satisfies Record<string, readonly OfficialSoulAppDefinition[]>

export type OfficialSoulCatalogView = keyof typeof OFFICIAL_SOUL_CATALOG_VIEWS

// Backward-compatible public default: "official" means the v1 shipped surface.
export const OFFICIAL_SOUL_APPS = SHIPPED_OFFICIAL_SOUL_APPS
