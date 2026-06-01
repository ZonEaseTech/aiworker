import type { EngineReadinessRow, WorkerConfigSummaryRow } from './config-mapper'

import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { useEffect, useState } from 'react'

import { fetchEngineTargets, fetchWorkerConfig } from './broker-client'
import { summarizeEngineTargets, summarizeWorkerConfig } from './config-mapper'

/**
 * Configuration modules for the mounted SDK common workbench (方案 C, US-007).
 *
 * Read-only configuration surface, one section per broker route:
 * - worker-configuration-summary ← `GET /api/workers/:id/config` (locator worker id);
 * - engine-target-readiness ← `GET /api/engine/targets` (daemon-global).
 *
 * Each section renders packages/ui rows and hides itself when empty. The
 * skills/mcp/entry overlay sections layer on here in later slices.
 */
export function WorkbenchConfig({ workerId }: { workerId: null | string }) {
  const [configRows, setConfigRows] = useState<WorkerConfigSummaryRow[]>([])
  const [engineRows, setEngineRows] = useState<EngineReadinessRow[]>([])

  useEffect(() => {
    if (!workerId)
      return undefined
    let cancelled = false
    fetchWorkerConfig(workerId)
      .then((values) => {
        if (!cancelled)
          setConfigRows(summarizeWorkerConfig(values))
      })
      .catch(() => {
        // Best-effort read-only surface; a failed fetch leaves it empty.
      })
    return () => {
      cancelled = true
    }
  }, [workerId])

  useEffect(() => {
    let cancelled = false
    fetchEngineTargets()
      .then((engines) => {
        if (!cancelled)
          setEngineRows(summarizeEngineTargets(engines))
      })
      .catch(() => {
        // Best-effort read-only surface; a failed fetch leaves it empty.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {configRows.length > 0
        ? (
            <ItemGroup data-aiworker-config="worker-configuration-summary">
              {configRows.map(row => (
                <Item data-aiworker-config-key={row.configKey} key={row.configKey}>
                  <ItemContent>
                    <ItemTitle>{row.configKey}</ItemTitle>
                    <ItemDescription>{`${row.kind} · ${row.enabled ? 'enabled' : 'disabled'} · ${row.source}`}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          )
        : null}
      {engineRows.length > 0
        ? (
            <ItemGroup data-aiworker-config="engine-target-readiness">
              {engineRows.map(row => (
                <Item data-aiworker-engine-target={row.id} key={row.id}>
                  <ItemContent>
                    <ItemTitle>{row.name}</ItemTitle>
                    <ItemDescription>{row.installed ? 'installed' : 'not installed'}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          )
        : null}
    </>
  )
}
