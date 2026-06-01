import type { WorkerConfigSummaryRow } from './config-mapper'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'

import { useEffect, useState } from 'react'
import { fetchWorkerConfig } from './broker-client'
import { summarizeWorkerConfig } from './config-mapper'

/**
 * Configuration modules for the mounted SDK common workbench (方案 C, US-007).
 *
 * Read-only worker configuration summary: reads the broker worker-config response
 * (`GET /api/workers/:id/config`) via the locator-injected worker id and renders
 * one packages/ui row per config key. Engine readiness and the skills/mcp/entry
 * overlays layer on here in later slices.
 */
export function WorkbenchConfig({ workerId }: { workerId: null | string }) {
  const [rows, setRows] = useState<WorkerConfigSummaryRow[]>([])

  useEffect(() => {
    if (!workerId)
      return undefined
    let cancelled = false
    fetchWorkerConfig(workerId)
      .then((values) => {
        if (!cancelled)
          setRows(summarizeWorkerConfig(values))
      })
      .catch(() => {
        // The config summary is a best-effort read-only surface; a failed fetch
        // leaves it empty rather than tearing down the workbench.
      })
    return () => {
      cancelled = true
    }
  }, [workerId])

  if (rows.length === 0)
    return null

  return (
    <ItemGroup data-aiworker-config="worker-configuration-summary">
      {rows.map(row => (
        <Item data-aiworker-config-key={row.configKey} key={row.configKey}>
          <ItemContent>
            <ItemTitle>{row.configKey}</ItemTitle>
            <ItemDescription>{`${row.kind} · ${row.enabled ? 'enabled' : 'disabled'} · ${row.source}`}</ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}
