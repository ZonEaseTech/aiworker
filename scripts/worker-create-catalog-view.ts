export const INTERNAL_OFFICIAL_SOUL_CATALOG_VIEW_ENV = 'AIWORKER_INTERNAL_OFFICIAL_SOUL_CATALOG_VIEW'
export const DEV_SAMPLING_OFFICIAL_SOUL_CATALOG_VIEW = 'dev-sampling'

export const DEV_SAMPLING_WORKER_CREATE_ENV = {
  [INTERNAL_OFFICIAL_SOUL_CATALOG_VIEW_ENV]: DEV_SAMPLING_OFFICIAL_SOUL_CATALOG_VIEW,
} as const

export function withDevSamplingCatalogEnv(
  env: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    ...env,
    ...DEV_SAMPLING_WORKER_CREATE_ENV,
  }
}
