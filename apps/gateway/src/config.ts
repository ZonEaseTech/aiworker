import process from 'node:process'
import { z } from 'zod'

/**
 * Gateway 进程的运行时配置。
 *
 * - `port` / `host`：Bun.serve 绑定地址；默认回环 127.0.0.1 防止无意暴露。
 * - `internalSharedSecret`：远程（非 loopback）连接必须在 `auth.token` 字段中
 *   提供它作为 bearer；loopback 连接放行即便 token 为空字符串。与 dashboard
 *   的 `INTERNAL_SHARED_SECRET` 共用，便于运维统一保管。
 * - `masterKeyHex`：AES-256-GCM 主密钥。PLAN-013 S2 本波还没实现 `workers.pair`
 *   / `token.rotate`，所以此项仅在 S5 真正接入 pair 流程后才必需；这里保持
 *   optional 以便纯 loopback 情景可跑。
 * - `fleetDbPath`：`fleet.db` 路径；gateway 对其**只读**读取
 *   `registered_workers`，不写 schema、不跑 migration。
 */
export interface GatewayConfig {
  port: number
  host: string
  internalSharedSecret?: string
  masterKeyHex?: string
  fleetDbPath: string
}

const envSchema = z.object({
  AIWORKER_GATEWAY_PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  AIWORKER_GATEWAY_HOST: z.string().min(1).default('127.0.0.1'),
  INTERNAL_SHARED_SECRET: z.string().min(16).optional(),
  AIWORKER_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'AIWORKER_MASTER_KEY must be 32-byte hex (64 hex chars)')
    .optional(),
  AIWORKER_FLEET_DB_PATH: z.string().default('./data/fleet.db'),
})

/** 从 `process.env` 解析出一份配置；启动入口和 smoke 脚本都走这里。 */
export function loadGatewayConfigFromEnv(): GatewayConfig {
  const parsed = envSchema.parse(process.env)
  return {
    port: parsed.AIWORKER_GATEWAY_PORT,
    host: parsed.AIWORKER_GATEWAY_HOST,
    internalSharedSecret: parsed.INTERNAL_SHARED_SECRET,
    masterKeyHex: parsed.AIWORKER_MASTER_KEY,
    fleetDbPath: parsed.AIWORKER_FLEET_DB_PATH,
  }
}
