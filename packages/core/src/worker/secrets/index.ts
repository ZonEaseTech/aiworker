import { getWorkerDb } from '@aiworker/storage-sqlite/worker'
import { workerEnv } from '../env'
import { SecretsVault } from './vault'

let instance: SecretsVault | null = null

export function getSecretsVault(): SecretsVault {
  if (!instance)
    instance = new SecretsVault(workerEnv.AIWORKER_MASTER_KEY, getWorkerDb())
  return instance
}

/** Test-only hook — lets test suites reset the singleton between cases. */
export function resetSecretsVaultForTests(): void {
  instance = null
}

export { SecretsVault } from './vault'
