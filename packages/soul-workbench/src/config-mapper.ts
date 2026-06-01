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
