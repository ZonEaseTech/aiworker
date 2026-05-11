import type { LocalSettingsConfig } from '@zonease/aiworker-shared'
import type { messagesFor } from '../i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

export function selectedEngineLabel(settings: LocalSettingsConfig, copy: WorkerMessages): string {
  if (settings.executionMode === 'byok')
    return `${settings.byok.provider} · ${settings.byok.model}`
  const engine = settings.engines.find(item => item.id === settings.engineId)
  return engine ? `${engine.name}${engine.installed ? '' : ` · ${copy.common.notInstalled}`}` : settings.engineId
}
