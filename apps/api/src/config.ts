import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HERMES_API_URL: z.string().default('http://localhost:8642'),
  HERMES_HOME: z.string().default(join(homedir(), '.hermes')),
  OPENCLAW_WS_URL: z.string().default('ws://localhost:18789'),
  OPENCLAW_HOME: z.string().default(join(homedir(), '.openclaw')),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_TIMEOUT_MS: z.coerce.number().default(60_000),
})

export const config = envSchema.parse(process.env)
