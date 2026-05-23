import process from 'node:process'

const HOST_INTERNAL_ENV_PREFIXES = ['AIWORKER_', 'WORKER_', 'OD_'] as const

export function sanitizeEngineEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(base)) {
    if (HOST_INTERNAL_ENV_PREFIXES.some(prefix => key.startsWith(prefix)))
      continue
    result[key] = value
  }
  return result
}
