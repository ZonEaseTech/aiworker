import type { LocalSettingsConfig } from '@zonease/aiworker-soul-descriptor'
import type { messagesFor } from '../i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

const engineIconSrcById: Record<string, string> = {
  'claude-code': '/engine-icons/claude.svg',
  'codex': '/engine-icons/openai.svg',
  'cursor': '/engine-icons/cursor.svg',
  'gemini': '/engine-icons/gemini.svg',
  'hermes': '/engine-icons/hermesagent.svg',
  'hermes-agent': '/engine-icons/hermesagent.svg',
  'opencode': '/engine-icons/opencode.svg',
  'qwen': '/engine-icons/qwen.svg',
}

export function engineIconSrc(engineId: string): null | string {
  return engineIconSrcById[engineId] ?? null
}

export function selectedEngineLabel(settings: LocalSettingsConfig, copy: WorkerMessages): string {
  if (settings.executionMode === 'byok')
    return `${settings.byok.provider} · ${settings.byok.model}`
  const engine = settings.engines.find(item => item.id === settings.engineId)
  return engine ? `${engine.name}${engine.installed ? '' : ` · ${copy.common.notInstalled}`}` : settings.engineId
}
