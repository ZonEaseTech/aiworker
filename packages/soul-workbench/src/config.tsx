import type { EngineReadinessRow, WorkerConfigSummaryRow, WorkerOverlayAsset } from './config-mapper'

import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { useEffect, useState } from 'react'

import { fetchEngineTargets, fetchWorkerConfig, fetchWorkerOverlay } from './broker-client'
import { selectOverlayAssets, summarizeEngineTargets, summarizeWorkerConfig } from './config-mapper'

// Overlay modules render the worker's descriptor-baseline + DB overlay assets,
// grouped by kind, from the worker-config `overlay.assets`.
const OVERLAY_SECTIONS: ReadonlyArray<{ config: string, kind: string }> = [
  { config: 'skills-overlay', kind: 'skill' },
  { config: 'mcp-overlay', kind: 'mcp-client' },
  { config: 'entry-files', kind: 'entry-file' },
]

/**
 * Configuration modules for the mounted SDK common workbench (方案 C, US-007).
 *
 * Read-only configuration surface, one section per broker route / overlay kind:
 * - worker-configuration-summary ← `GET /api/workers/:id/config` config values;
 * - engine-target-readiness ← `GET /api/engine/targets` (daemon-global);
 * - skills-overlay / mcp-overlay / entry-files ← `GET /api/workers/:id/config`
 *   `overlay.assets`, grouped by kind.
 *
 * Each section renders packages/ui rows and hides itself when empty.
 */
export function WorkbenchConfig({ workerId }: { workerId: null | string }) {
  const [configRows, setConfigRows] = useState<WorkerConfigSummaryRow[]>([])
  const [engineRows, setEngineRows] = useState<EngineReadinessRow[]>([])
  const [overlayAssets, setOverlayAssets] = useState<WorkerOverlayAsset[]>([])

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
    fetchWorkerOverlay(workerId)
      .then((assets) => {
        if (!cancelled)
          setOverlayAssets(assets)
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
      {OVERLAY_SECTIONS.map((section) => {
        const rows = selectOverlayAssets(overlayAssets, section.kind)
        if (rows.length === 0)
          return null
        return (
          <ItemGroup data-aiworker-config={section.config} key={section.config}>
            {rows.map(row => (
              <Item data-aiworker-overlay-asset={row.id} data-aiworker-overlay-kind={section.kind} key={`${section.kind}:${row.id}`}>
                <ItemContent>
                  <ItemTitle>{row.id}</ItemTitle>
                  <ItemDescription>{`${section.kind} · ${row.enabled ? 'enabled' : 'disabled'}${row.target ? ` · ${row.target}` : ''}`}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )
      })}
    </>
  )
}
