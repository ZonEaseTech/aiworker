import type { WorkerApiToken } from '@aiworker/shared'
import type { WorkerDatabase } from '../../db/worker'
import process from 'node:process'
import { eq } from 'drizzle-orm'

import { workerIdentity } from '../../db/worker/schema'

/**
 * First-boot only: print the worker id and bootstrap token exactly once to
 * stdout. The operator copies the token off the container logs and stores it
 * for future dashboard admission. Subsequent boots never re-emit — this is
 * what `justMinted` guards against.
 *
 * Written straight to stdout (not `consola`) so the output is stable and easy
 * for log-scraping tooling to grep, and to avoid consola's optional levels
 * hiding the line.
 */
export function printBootstrapIfJustMinted(
  workerId: string,
  token: WorkerApiToken,
  db: WorkerDatabase,
  justMinted: boolean,
  stdout: { write: (chunk: string) => void } = process.stdout,
): void {
  if (!justMinted)
    return

  stdout.write(`[worker] id=${workerId}\n`)
  stdout.write(`[worker] AIWORKER_BOOTSTRAP_TOKEN=${token}\n`)
  stdout.write(`[worker] save this token; it will not be printed again.\n`)

  db.update(workerIdentity)
    .set({ bootstrapShownAt: new Date().toISOString() })
    .where(eq(workerIdentity.pk, 'default'))
    .run()
}
