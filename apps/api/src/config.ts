import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HERMES_API_URL: z.string().default('http://localhost:8642'),
  HERMES_HOME: z.string().default(join(homedir(), '.hermes')),
})

export const config = envSchema.parse(process.env)
