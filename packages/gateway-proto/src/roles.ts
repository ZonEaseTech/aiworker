import { z } from 'zod'

/**
 * 连接的角色常量：
 * - operator：终端操作员（aim CLI / Web Console / 自动化客户端）
 * - node：worker 运行时容器
 */
export const ROLES = {
  OPERATOR: 'operator',
  NODE: 'node',
} as const

export type Role = typeof ROLES[keyof typeof ROLES]

export const roleSchema: z.ZodType<Role> = z.union([
  z.literal(ROLES.OPERATOR),
  z.literal(ROLES.NODE),
])
