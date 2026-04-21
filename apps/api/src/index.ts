import consola from 'consola'

import { APP_MODE } from './config/common'

export async function boot() {
  if (APP_MODE === 'dashboard') {
    const { createDashboardApp } = await import('./modes/dashboard')
    const { app, port } = await createDashboardApp()
    consola.success(`[dashboard] listening on :${port}`)
    return { app, port }
  }

  const { createWorkerApp } = await import('./modes/worker')
  const { app, port } = await createWorkerApp()
  consola.success(`[worker] listening on :${port}`)
  return { app, port }
}

// eslint-disable-next-line antfu/no-top-level-await -- Bun entry point needs { fetch, port } available synchronously at module export time
const { app, port } = await boot()

export default { fetch: app.fetch, port }
export { app }
