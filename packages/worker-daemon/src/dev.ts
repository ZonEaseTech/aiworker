import process from 'node:process'

process.env.WORKER_DB_PATH ??= '/tmp/aiworker-workspace-dev/aiworker.db'
process.env.WORKER_WORKSPACE_ROOT ??= '/tmp/aiworker-workspace-dev/workers'

// eslint-disable-next-line antfu/no-top-level-await -- dev entry point mirrors production
const indexModule = await import('./index')

export default indexModule.default
export const { app } = indexModule
