/**
 * Pure mappers for the mounted workbench configuration modules (方案 C, US-007).
 *
 * Read-only summaries over the broker's worker-config response
 * (`GET /api/workers/:id/config`). Transport-independent so they can be unit
 * tested without a daemon and reused by every config panel.
 */

export interface WorkerConfigValue {
  configKey?: string
  source?: string
  value?: {
    enabled?: unknown
    kind?: unknown
    target?: unknown
  }
}

export interface WorkerConfigSummaryRow {
  configKey: string
  enabled: boolean
  kind: string
  source: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Summarise worker config values into one display row per config key. */
export function summarizeWorkerConfig(values: WorkerConfigValue[]): WorkerConfigSummaryRow[] {
  return values.map(value => ({
    configKey: readString(value.configKey),
    enabled: value.value?.enabled === true,
    kind: readString(value.value?.kind) || 'unknown',
    source: readString(value.source) || 'unknown',
  }))
}

export interface EngineTarget {
  id?: string
  installed?: unknown
  name?: string
  version?: string
}

export interface EngineReadinessRow {
  id: string
  installed: boolean
  name: string
}

/**
 * Summarise local engine targets (`GET /api/engine/targets`) into readiness rows.
 * Read-only — engine selection/mutation is a separate concern.
 */
export function summarizeEngineTargets(engines: EngineTarget[]): EngineReadinessRow[] {
  return engines.map(engine => ({
    id: readString(engine.id),
    installed: engine.installed === true,
    name: readString(engine.name) || readString(engine.id),
  }))
}

export interface WorkerOverlayAsset {
  enabled?: unknown
  id?: string
  kind?: string
  target?: string
}

export interface OverlayAssetRow {
  enabled: boolean
  id: string
  target: string
}

/**
 * Select the worker overlay assets of one kind (`skill` / `mcp-client` /
 * `entry-file`) from the worker-config `overlay.assets` for the skills, MCP and
 * entry-files modules. Read-only.
 */
export function selectOverlayAssets(assets: WorkerOverlayAsset[], kind: string): OverlayAssetRow[] {
  return assets
    .filter(asset => asset.kind === kind)
    .map(asset => ({
      enabled: asset.enabled === true,
      id: readString(asset.id),
      target: readString(asset.target),
    }))
}
