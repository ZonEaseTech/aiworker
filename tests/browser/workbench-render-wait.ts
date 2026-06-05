import process from 'node:process'

// Workbench render readiness wait. Default 45s tolerates high local/CI load.
export const WORKBENCH_RENDER_TIMEOUT_MS = Number.parseInt(process.env.AIWORKER_BROWSER_WORKBENCH_RENDER_TIMEOUT_MS ?? '', 10) || 45_000
