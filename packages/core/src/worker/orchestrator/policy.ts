import type { ToolPolicy, ToolPolicyAction } from '@zonease/aiworker-shared'

/**
 * 评估某个 tool 名在给定 `toolPolicy` 下的 action（PLAN-014 F2）。
 *
 * 规则：
 * - `policy` 缺省 → 始终 `auto`（向前兼容旧 config）。
 * - `rules[]` 顺序匹配，第一条命中即用。
 * - 都不命中走 `policy.default`。
 *
 * `pattern` 当前支持：
 * - 字面量精确匹配（`"Read"` 只匹配 `Read`）。
 * - 通配符 `*`（`"*"` 匹配所有；`"fs.*"` 匹配 `fs.read` / `fs.write`）。
 *
 * 复杂 glob（`?`、字符类、`{a,b}`、`**`）暂未支持——TODO：等需求出现再加
 * minimatch 依赖。
 */
export function evaluateToolPolicy(toolName: string, policy: ToolPolicy | undefined): ToolPolicyAction {
  if (!policy)
    return 'auto'
  for (const rule of policy.rules) {
    if (matchToolPattern(rule.pattern, toolName))
      return rule.action
  }
  return policy.default
}

/**
 * Glob-ish 匹配：`*` → `.*`，其它字符正则转义。空 pattern 视作不匹配。
 *
 * 行内独立导出方便单测覆盖各种 pattern 形态。
 */
export function matchToolPattern(pattern: string, name: string): boolean {
  if (pattern.length === 0)
    return false
  if (pattern === '*')
    return true
  if (!pattern.includes('*'))
    return pattern === name
  // 把字面量字符 escape，再把 `*` 替换成 `.*`，最后两端锚定。
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
  return re.test(name)
}
