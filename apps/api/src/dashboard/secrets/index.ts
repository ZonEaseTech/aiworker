import { dashboardConfig } from '../../config/dashboard'
import { getFleetDb } from '../../db/fleet'
import { SecretsVault } from './vault'

let instance: SecretsVault | null = null

export function getSecretsVault(): SecretsVault {
  if (!instance)
    instance = new SecretsVault(dashboardConfig.AIWORKER_MASTER_KEY, getFleetDb())
  return instance
}

export { SecretsVault } from './vault'
