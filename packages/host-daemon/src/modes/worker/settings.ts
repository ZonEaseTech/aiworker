import type { LocalEngineReadinessSettings, LocalSettingsConfig } from '@zonease/aiworker-soul-protocol'
import { scanLocalEngines } from '@zonease/aiworker-host-runtime'
import { AppError, localSettingsConfigSchema } from '@zonease/aiworker-soul-protocol'
import { getSetting, listSettings, setSetting } from '@zonease/aiworker-storage-sqlite/worker'

export const LOCAL_SETTINGS_KEY = 'local-settings'
export { scanLocalEngines }

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
  assertSafeSecretRefs(parsed)
  try {
    setSetting(LOCAL_SETTINGS_KEY, parsed)
  }
  catch (error) {
    throw normalizeLocalSettingsPersistenceError(error)
  }
  return parsed
}

function assertSafeSecretRefs(settings: LocalSettingsConfig): void {
  if (isSafeSecretReference(settings.byok.apiKeyRef))
    return
  throw new AppError(
    'LOCAL_SETTINGS_SECRET',
    422,
    'Local settings must store BYOK API key references, not literal secrets.',
  )
}

function isSafeSecretReference(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length === 0 || trimmed === '[REDACTED]' || trimmed.startsWith('$') || trimmed.startsWith('env:') || trimmed.startsWith('secretref:')
}

function normalizeLocalSettingsPersistenceError(error: unknown): unknown {
  if (!(error instanceof Error))
    return error

  if (error.message.startsWith('Literal secrets are not allowed in Host metadata:')) {
    return new AppError(
      'LOCAL_SETTINGS_SECRET',
      422,
      'Local settings must store secret references, not literal secrets.',
    )
  }

  if (error.message.startsWith('Full native MCP files are not allowed in Host metadata:')) {
    return new AppError(
      'LOCAL_SETTINGS_INVALID',
      422,
      'Local settings must store references, not full native MCP files.',
    )
  }

  return error
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
