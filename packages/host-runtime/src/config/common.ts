import process from 'node:process'
import { z } from 'zod'

const commonSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const commonConfig = commonSchema.parse(process.env)
