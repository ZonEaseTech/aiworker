import type { WorkerConfig } from '@aiworker/shared'
import process from 'node:process'
import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  WORKER_ID: z.string().regex(/^w_[0-9a-hjkmnp-tv-z]{12}$/),
  WORKER_DB_PATH: z.string().default('/var/lib/aiworker/worker.db'),
  WORKER_MIGRATIONS_FOLDER: z.string().default('./drizzle/worker'),
  WORKER_CONFIG_JSON: z.string().transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as WorkerConfig
    }
    catch (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `WORKER_CONFIG_JSON is not valid JSON: ${String(err)}` })
      return z.NEVER
    }
  }),
  WORKER_CONFIG_VERSION: z.coerce.number().default(1),
})

export const workerConfigEnv = schema.parse(process.env)
export const workerConfig: WorkerConfig = workerConfigEnv.WORKER_CONFIG_JSON
