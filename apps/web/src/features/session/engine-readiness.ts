import type { LocalSettingsConfig } from '@zonease/aiworker-shared'
import type { messagesFor } from '../i18n'

export interface EngineReadiness {
  detail: string
  label: string
  ready: boolean
}

type WorkerMessages = ReturnType<typeof messagesFor>

export function resolveEngineReadiness(settings: LocalSettingsConfig | null, copy: WorkerMessages): EngineReadiness {
  if (!settings)
    return { detail: copy.workspace.engineLoading, label: copy.workspace.engineLoading, ready: false }
  if (settings.executionMode === 'byok') {
    const configured = settings.byok.provider.trim().length > 0 && settings.byok.model.trim().length > 0 && settings.byok.apiKeyRef.trim().length > 0
    return {
      detail: configured ? copy.workspace.byokReady(settings.byok.provider, settings.byok.model) : copy.workspace.byokNeedsKey,
      label: `${settings.byok.provider} · ${settings.byok.model}`,
      ready: configured,
    }
  }
  const engine = settings.engines.find(item => item.id === settings.engineId)
  if (!engine) {
    return {
      detail: copy.workspace.engineMissing(settings.engineId),
      label: settings.engineId,
      ready: false,
    }
  }
  return {
    detail: engine.installed ? copy.workspace.engineReadyDetail(engine.name) : copy.workspace.engineNotInstalled(engine.name),
    label: `${engine.name}${engine.installed ? '' : ` · ${copy.common.notInstalled}`}`,
    ready: engine.installed,
  }
}
