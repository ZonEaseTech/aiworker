import consola from 'consola'

import { getWorkerDb } from '../../db/worker'
import { evolutionObservations } from '../../db/worker/schema'

/**
 * Stub proposer. Scheduled run logs how many observations exist.
 * The real pattern-miner → skill-draft generator lands in FEAT-006.
 */
export async function runProposerOnce(): Promise<void> {
  const count = getWorkerDb().select({ c: evolutionObservations.id }).from(evolutionObservations).all().length
  consola.info(`[evolution/proposer] stub: would analyse ${count} observations here (FEAT-006)`)
}

export function startProposerLoop(intervalMs: number = 6 * 60 * 60 * 1000): () => void {
  const handle = setInterval(() => {
    void runProposerOnce()
  }, intervalMs)
  return () => clearInterval(handle)
}
