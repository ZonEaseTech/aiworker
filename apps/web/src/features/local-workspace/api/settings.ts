import type { LocalSettingsConfig } from '@zonease/aiworker-soul-protocol'

import { localJson } from '../../../shared/api/local-client'

export function saveSettings(input: Partial<LocalSettingsConfig>): Promise<{ settings: LocalSettingsConfig }> {
  return localJson('/api/settings', { method: 'PATCH', body: JSON.stringify(input) })
}

export function rescanEngines(): Promise<{ engines: LocalSettingsConfig['engines'], settings: LocalSettingsConfig }> {
  return localJson('/api/engine/targets/rescan', { method: 'POST', body: JSON.stringify({}) })
}

export function testEngine(engineId: string): Promise<{ result: { engineId: string, message: string, status: 'fail' | 'pass' } }> {
  return localJson(`/api/engine/targets/${encodeURIComponent(engineId)}/test`, { method: 'POST', body: JSON.stringify({}) })
}
