import process from 'node:process'
import { z } from 'zod'

export type AppMode = 'dashboard' | 'worker'

const commonSchema = z.object({
  AIWORKER_MODE: z.enum(['dashboard', 'worker']),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  INTERNAL_SHARED_SECRET: z.string().min(16),
})

export const commonConfig = commonSchema.parse(process.env)

export const APP_MODE: AppMode = commonConfig.AIWORKER_MODE
