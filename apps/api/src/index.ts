import consola from 'consola'

/**
 * apps/api 的唯一入口——worker 模式。
 *
 * PLAN-013 S5 之后 dashboard 模式已整体迁到 `@aiworker/gateway`。
 * 本镜像(worker image)用 `AIWORKER_MODE=worker` 变量同运维脚本保持兼容,
 * 但不再有模式分叉:启动必经 createWorkerApp。
 */
export async function boot() {
  const { createWorkerApp } = await import('./modes/worker')
  const { app, port } = await createWorkerApp()
  consola.success(`[worker] listening on :${port}`)
  return { app, port }
}

// eslint-disable-next-line antfu/no-top-level-await -- Bun entry point needs { fetch, port } available synchronously at module export time
const { app, port } = await boot()

export default { fetch: app.fetch, port }
export { app }
