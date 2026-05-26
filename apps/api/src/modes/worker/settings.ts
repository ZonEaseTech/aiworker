import type { LocalEngineReadinessSettings, LocalSettingsConfig } from '@zonease/aiworker-shared'
import { spawnSync } from 'node:child_process'
import { localSettingsConfigSchema } from '@zonease/aiworker-shared'
import { getSetting, listSettings, setSetting } from '@zonease/aiworker-storage-sqlite/worker'

export const LOCAL_SETTINGS_KEY = 'local-settings'

const ENGINE_COMMANDS = [
  { id: 'codex', name: 'Codex CLI', command: 'codex' },
  { id: 'claude-code', name: 'Claude Code', command: 'claude' },
  { id: 'cursor', name: 'Cursor Agent', command: 'cursor-agent' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen' },
] as const

const DEFAULT_CONNECTORS: LocalSettingsConfig['connectors'] = [
  { enabled: false, id: 'ats', name: 'ATS / HRIS', status: 'not_configured' },
  { enabled: false, id: 'docs', name: 'Docs workspace', status: 'not_configured' },
  { enabled: false, id: 'issue-tracker', name: 'Issue tracker', status: 'not_configured' },
  { enabled: false, id: 'ci', name: 'CI / release evidence', status: 'not_configured' },
  { enabled: false, id: 'cloud', name: 'Cloud account', status: 'not_configured' },
  { enabled: false, id: 'crm', name: 'CRM', status: 'not_configured' },
]

export function loadLocalSettings(): LocalSettingsConfig {
  const row = listSettings().find(setting => setting.key === LOCAL_SETTINGS_KEY)
  const parsed = row ? localSettingsConfigSchema.safeParse(row.valueJson) : null
  if (parsed?.success)
    return normalizePendingMcpSettings(parsed.data)
  return saveLocalSettings(defaultLocalSettings())
}

export function readLocalEngineSettings(): LocalEngineReadinessSettings {
  const row = getSetting(LOCAL_SETTINGS_KEY)
  const parsed = row ? localSettingsConfigSchema.safeParse(row.valueJson) : null
  if (parsed?.success) {
    return {
      byok: {
        apiKeyRefPresent: parsed.data.byok.apiKeyRef.trim().length > 0,
        model: parsed.data.byok.model,
        provider: parsed.data.byok.provider,
      },
      engineId: parsed.data.engineId,
      engines: parsed.data.engines,
      executionMode: parsed.data.executionMode,
    }
  }
  return {
    byok: {
      apiKeyRefPresent: false,
      model: 'gpt-4o',
      provider: 'openai-compatible',
    },
    engineId: 'codex',
    engines: [],
    executionMode: 'byok',
  }
}

export function readLocalConnectorSettings(): Pick<LocalSettingsConfig, 'connectors'> {
  const row = getSetting(LOCAL_SETTINGS_KEY)
  const parsed = row ? localSettingsConfigSchema.safeParse(row.valueJson) : null
  if (parsed?.success) {
    return {
      connectors: parsed.data.connectors,
    }
  }
  return {
    connectors: defaultConnectors(),
  }
}

export function saveLocalSettings(settings: LocalSettingsConfig): LocalSettingsConfig {
  const parsed = localSettingsConfigSchema.parse(normalizePendingMcpSettings(settings))
  setSetting(LOCAL_SETTINGS_KEY, parsed)
  return parsed
}

function normalizePendingMcpSettings(settings: LocalSettingsConfig): LocalSettingsConfig {
  return {
    ...settings,
    externalMcpServers: settings.externalMcpServers.map(server => ({
      ...server,
      enabled: false,
    })),
    localMcpServer: {
      ...settings.localMcpServer,
      enabled: false,
    },
  }
}

function defaultLocalSettings(): LocalSettingsConfig {
  const engines = scanLocalEngines()
  const firstInstalled = engines.find(engine => engine.installed)
  return {
    appearance: 'system',
    byok: {
      apiKeyRef: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      provider: 'openai-compatible',
    },
    connectors: defaultConnectors(),
    engineId: firstInstalled?.id ?? 'codex',
    engines,
    executionMode: firstInstalled ? 'local-cli' : 'byok',
    externalMcpServers: [
      { command: '', enabled: false, id: 'team-context', name: 'Team context MCP' },
      { command: '', enabled: false, id: 'evidence-search', name: 'Evidence search MCP' },
    ],
    language: 'en',
    localMcpServer: {
      enabled: false,
      url: 'http://127.0.0.1:4319/mcp',
    },
    updatedAt: new Date().toISOString(),
  }
}

function defaultConnectors(): LocalSettingsConfig['connectors'] {
  return DEFAULT_CONNECTORS.map(connector => ({ ...connector }))
}

export function scanLocalEngines(): LocalSettingsConfig['engines'] {
  return ENGINE_COMMANDS.map((engine) => {
    const found = commandOutput('bash', ['-lc', `command -v ${engine.command}`]).trim()
    if (!found) {
      return {
        command: engine.command,
        id: engine.id,
        installed: false,
        name: engine.name,
        path: null,
        version: null,
      }
    }
    const version = commandOutput(found, ['--version']).split('\n')[0]?.trim() || 'installed'
    return {
      command: engine.command,
      id: engine.id,
      installed: true,
      name: engine.name,
      path: found,
      version,
    }
  })
}

function commandOutput(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 2500 })
  if (result.status !== 0)
    return ''
  return result.stdout.toString()
}
