import { bootstrapWorkerApp } from '@aiworker/api/lib'
import consola from 'consola'

export interface ServeOptions {
  port?: number
}

/**
 * `aiw serve` — boot the existing worker HTTP surface. Behaviour is
 * bit-for-bit compatible with `AIWORKER_MODE=worker bun src/index.ts`:
 * same bootstrap, same routes, same hot-reload contract. Intended for
 * production parity; use `aiw run` for CLI-only (no HTTP) workflows.
 */
export async function runServe(options: ServeOptions = {}): Promise<void> {
  const { app, port: envPort, state } = await bootstrapWorkerApp()
  const port = options.port ?? envPort

  Bun.serve({ port, fetch: app.fetch })
  consola.success(`[aiw serve] worker ${state.workerId} listening on :${port} (config v${state.configVersion})`)
}
