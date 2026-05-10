import consola from 'consola'

export async function boot() {
  const { createWorkerApp } = await import('./modes/worker')
  const { app, port } = await createWorkerApp()
  consola.success(`[workspace-daemon] listening on :${port}`)
  return { app, port }
}

// eslint-disable-next-line antfu/no-top-level-await -- Bun entry point needs { fetch, port } at module export time
const { app, port } = await boot()

export default { fetch: app.fetch, port }
export { app }
