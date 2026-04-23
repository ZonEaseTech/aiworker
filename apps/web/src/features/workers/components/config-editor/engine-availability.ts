import type { EngineAvailability, EngineKind } from '@aiworker/shared'

/** 前端用的轻量可达性图谱：`${kind}` / `${kind}:${agent}` → 状态行。 */
export type EngineAvailabilityMap = Map<string, EngineAvailability>

/** 将从后端拉回的列表转成 picker 消费的 Map。 */
export function buildAvailabilityMap(list: EngineAvailability[] | undefined): EngineAvailabilityMap {
  const out: EngineAvailabilityMap = new Map()
  if (!list)
    return out
  for (const entry of list) {
    const key = entry.agent ? `${entry.kind}:${entry.agent}` : entry.kind
    out.set(key, entry)
  }
  return out
}

/**
 * 若 engine 本身存在 agent 子分类（如 acp），返回聚合状态：
 *  - 任意一个 agent `ready`  → `ready`（至少一个 agent 可用）
 *  - 全部 `not-found`        → `not-found`
 *  - 其它混合情况            → `login-required`
 * 不带 agent 的引擎就直接返回 map 里的那一条。
 */
export function resolveEngineStatus(
  map: EngineAvailabilityMap,
  engine: EngineKind,
): EngineAvailability['status'] | undefined {
  const direct = map.get(engine)
  if (direct)
    return direct.status
  const agentEntries = [...map.values()].filter(v => v.kind === engine)
  if (agentEntries.length === 0)
    return undefined
  if (agentEntries.some(v => v.status === 'ready'))
    return 'ready'
  if (agentEntries.every(v => v.status === 'not-found'))
    return 'not-found'
  return 'login-required'
}
