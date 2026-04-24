import process from 'node:process'
import { z } from 'zod'

/**
 * apps/api 目前只有 worker 模式。PLAN-013 S5 之后 dashboard 已整体迁到
 * `@aiworker/gateway`,原 `AIWORKER_MODE` enum 不再需要分叉——这里保持
 * 字段校验(为了让 ops 脚本现有的 `AIWORKER_MODE=worker` 不报错),但只允许
 * `worker` 一个值,并在未来可完全移除。
 */
const commonSchema = z.object({
  AIWORKER_MODE: z.enum(['worker']).default('worker'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  INTERNAL_SHARED_SECRET: z.string().min(16),
})

export const commonConfig = commonSchema.parse(process.env)
