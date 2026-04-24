import process from 'node:process'
import { z } from 'zod'

/**
 * Gateway 进程的运行时配置。
 *
 * - `port` / `host`:Bun.serve 绑定地址;默认回环 127.0.0.1 防止无意暴露。
 * - `internalSharedSecret`:远程(非 loopback)连接必须在 `auth.token` 字段中
 *   提供它作为 bearer;loopback 连接放行即便 token 为空字符串。gateway 同时
 *   通过它签发/验证 worker node 的 bearer,统一由 ops 保管。
 * - `masterKeyHex`:AES-256-GCM 主密钥(`fleet.db.registered_workers` 的 at-rest
 *   密钥)。`workers.pair` / `token.rotate` 都要求它非空;纯 loopback 且关闭
 *   launch/pair 的情况下可缺省。
 * - `fleetDbPath`:`fleet.db` 路径。
 * - `canLaunch` + supervisor 子配置:当 `AIWORKER_GATEWAY_CAN_LAUNCH=true` 时
 *   `workers.launch` 有效,否则返回 `feature_disabled`。
 * - `maxWorkers`:`registered_workers` 的硬上限——`workers.pair` / `workers.launch`
 *   在插入前校验。
 */
export interface GatewayConfig {
  port: number
  host: string
  internalSharedSecret?: string
  masterKeyHex?: string
  fleetDbPath: string
  canLaunch: boolean
  maxWorkers?: number
  nodeEnv: string
  supervisor: {
    dockerHost: string
    image?: string
    network: string
    workerDataRoot?: string
    workerMemoryLimit?: string
    workerCpuLimit?: number
    launchBaseUrlTemplate: string
  }
}

const envSchema = z.object({
  AIWORKER_GATEWAY_PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  AIWORKER_GATEWAY_HOST: z.string().min(1).default('127.0.0.1'),
  INTERNAL_SHARED_SECRET: z.string().min(16).optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  AIWORKER_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'AIWORKER_MASTER_KEY must be 32-byte hex (64 hex chars)')
    .optional(),
  AIWORKER_FLEET_DB_PATH: z.string().default('./data/fleet.db'),
  AIWORKER_GATEWAY_CAN_LAUNCH: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  AIWORKER_MAX_WORKERS: z.coerce.number().int().positive().optional(),
  DOCKER_HOST: z.string().default('/var/run/docker.sock'),
  AIWORKER_IMAGE: z.string().optional(),
  AIWORKER_NETWORK: z.string().default('aiworker_default'),
  WORKER_DATA_ROOT: z.string().optional(),
  WORKER_MEMORY_LIMIT: z.string().optional(),
  WORKER_CPU_LIMIT: z.coerce.number().optional(),
  AIWORKER_LAUNCH_BASE_URL_TEMPLATE: z.string().default('http://{containerName}:3001'),
}).superRefine((cfg, ctx) => {
  if (!cfg.AIWORKER_GATEWAY_CAN_LAUNCH)
    return
  // canLaunch=true 时必须有 INTERNAL_SHARED_SECRET 以注入新拉起的 worker 容器。
  if (!cfg.INTERNAL_SHARED_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['INTERNAL_SHARED_SECRET'],
      message: 'INTERNAL_SHARED_SECRET is required when AIWORKER_GATEWAY_CAN_LAUNCH=true',
    })
  }
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
        message: `${key} is required when AIWORKER_GATEWAY_CAN_LAUNCH=true`,
      })
    }
  }
})

/** 从 `process.env` 解析出一份配置;启动入口和 smoke 脚本都走这里。 */
export function loadGatewayConfigFromEnv(): GatewayConfig {
  const parsed = envSchema.parse(process.env)
  return {
    port: parsed.AIWORKER_GATEWAY_PORT,
    host: parsed.AIWORKER_GATEWAY_HOST,
    internalSharedSecret: parsed.INTERNAL_SHARED_SECRET,
    masterKeyHex: parsed.AIWORKER_MASTER_KEY,
    fleetDbPath: parsed.AIWORKER_FLEET_DB_PATH,
    canLaunch: parsed.AIWORKER_GATEWAY_CAN_LAUNCH,
    maxWorkers: parsed.AIWORKER_MAX_WORKERS,
    nodeEnv: parsed.NODE_ENV,
    supervisor: {
      dockerHost: parsed.DOCKER_HOST,
      image: parsed.AIWORKER_IMAGE,
      network: parsed.AIWORKER_NETWORK,
      workerDataRoot: parsed.WORKER_DATA_ROOT,
      workerMemoryLimit: parsed.WORKER_MEMORY_LIMIT,
      workerCpuLimit: parsed.WORKER_CPU_LIMIT,
      launchBaseUrlTemplate: parsed.AIWORKER_LAUNCH_BASE_URL_TEMPLATE,
    },
  }
}
