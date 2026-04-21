import process from 'node:process'
import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  FLEET_DB_PATH: z.string().default('./data/fleet.db'),
  AIWORKER_MASTER_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'AIWORKER_MASTER_KEY must be 32-byte hex (64 hex chars)'),
  DOCKER_HOST: z.string().default('/var/run/docker.sock'),
  AIWORKER_IMAGE: z.string().default('aiworker-runtime:dev'),
  AIWORKER_NETWORK: z.string().default('aiworker_default'),
  WORKER_DATA_ROOT: z.string().default('/var/lib/aiworker'),
  WORKER_MEMORY_LIMIT: z.string().default('256m'),
  WORKER_CPU_LIMIT: z.coerce.number().default(0.5),
  FLEET_MIGRATIONS_FOLDER: z.string().default('./drizzle/fleet'),
})

export const dashboardConfig = schema.parse(process.env)
