import type { LocalSettingsConfig } from '@zonease/aiworker-soul-descriptor'
import type { messagesFor } from '../i18n'
import { apiUrl } from '../../shared/api/base-path'

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
  // Engine icons are `public/` assets served at the root `/engine-icons/...`
  // path. An absolute path ignores the document `<base href>`, so under the Host
  // tunnel it must be prefixed with the worker base to reach the Worker route
  // instead of the Host root (404). apiUrl is a no-op at the standalone root.
  const src = engineIconSrcById[engineId]
  return src ? apiUrl(src) : null
}

export function selectedEngineLabel(settings: LocalSettingsConfig, copy: WorkerMessages): string {
  if (settings.executionMode === 'byok')
    return `${settings.byok.provider} · ${settings.byok.model}`
  const engine = settings.engines.find(item => item.id === settings.engineId)
  return engine ? `${engine.name}${engine.installed ? '' : ` · ${copy.common.notInstalled}`}` : settings.engineId
}
