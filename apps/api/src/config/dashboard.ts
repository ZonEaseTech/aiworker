import process from 'node:process'
import { z } from 'zod'

/**
 * PLAN-004 3.4: The docker-supervisor only ever runs when the operator opts
 * in via `MANAGER_CAN_LAUNCH=true`. The image / network / resource-limit
 * knobs are therefore optional; they only become *required* when the flag
 * is on, enforced via `.superRefine` below so a default-config manager
 * stays a pure registry with no docker surface.
 */
const schema = z.object({
  PORT: z.coerce.number().default(3000),
  FLEET_DB_PATH: z.string().default('./data/fleet.db'),
  AIWORKER_MASTER_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'AIWORKER_MASTER_KEY must be 32-byte hex (64 hex chars)'),
  FLEET_MIGRATIONS_FOLDER: z.string().default('./drizzle/fleet'),

  MANAGER_CAN_LAUNCH: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),

  // Launch-local-only settings. Optional by default; required when
  // MANAGER_CAN_LAUNCH=true (see superRefine).
  DOCKER_HOST: z.string().default('/var/run/docker.sock'),
  AIWORKER_IMAGE: z.string().optional(),
  AIWORKER_NETWORK: z.string().default('aiworker_default'),
  WORKER_DATA_ROOT: z.string().optional(),
  WORKER_MEMORY_LIMIT: z.string().optional(),
  WORKER_CPU_LIMIT: z.coerce.number().optional(),
  /**
   * Template used to derive the externally-reachable baseUrl for a worker
   * spawned via /launch-local. `{containerName}` is substituted with the
   * generated container alias. Example: `http://{containerName}:3001` for
   * a single-host deploy where the manager reaches workers over the shared
   * docker network.
   */
  AIWORKER_LAUNCH_BASE_URL_TEMPLATE: z.string().default('http://{containerName}:3001'),
}).superRefine((cfg, ctx) => {
  if (!cfg.MANAGER_CAN_LAUNCH)
    return
  const required: Array<['AIWORKER_IMAGE' | 'WORKER_DATA_ROOT' | 'WORKER_MEMORY_LIMIT' | 'WORKER_CPU_LIMIT', unknown]> = [
    ['AIWORKER_IMAGE', cfg.AIWORKER_IMAGE],
    ['WORKER_DATA_ROOT', cfg.WORKER_DATA_ROOT],
    ['WORKER_MEMORY_LIMIT', cfg.WORKER_MEMORY_LIMIT],
    ['WORKER_CPU_LIMIT', cfg.WORKER_CPU_LIMIT],
  ]
  for (const [key, value] of required) {
    if (value === undefined || value === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when MANAGER_CAN_LAUNCH=true`,
      })
    }
  }
})

export const dashboardConfig = schema.parse(process.env)
