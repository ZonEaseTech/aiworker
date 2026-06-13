import type { LocalEngineReadinessSettings, LocalEngineStatus, LocalSettingsConfig } from '@zonease/aiworker-soul-descriptor'
import type { InspectEngineCredential } from '@zonease/aiworker-worker-runtime'
import { SECRET_FORMAT_ALTERNATION } from '@zonease/aiworker-engine-bridge'
import { AppError, localSettingsConfigSchema } from '@zonease/aiworker-soul-descriptor'
import { getSetting, listSettings, setSetting } from '@zonease/aiworker-storage-sqlite/worker'
import { inspectLocalEngineCredential, resolveEngineAuthReadiness, scanLocalEngines } from '@zonease/aiworker-worker-runtime'

export const LOCAL_SETTINGS_KEY = 'local-settings'

// 引擎扫描的依赖注入缝:默认始终是真实的 scanLocalEngines(生产路径字节不变),
// 测试通过 setEngineScanner 注入 fake,避免在 defaultLocalSettings / rescan 路由里
// shell 出真实的引擎 CLI(codex/claude/cursor-agent --version)。模块级单例,与
// 既有的全局 DB 单例同模式;daemon shutdown 时重置回真实扫描器以隔离测试。
type EngineScanner = () => LocalEngineStatus[]
let activeEngineScanner: EngineScanner = scanLocalEngines

export function setEngineScanner(scanner: EngineScanner | null): void {
  activeEngineScanner = scanner ?? scanLocalEngines
}

// 凭证探测的依赖注入缝:默认始终是真实的 inspectLocalEngineCredential(生产路径字节不变),
// 测试通过 setEngineAuthProbe 注入 fake,避免在 defaultLocalSettings 的引擎选择点真读
// ~/.codex/auth.json 等凭证文件。镜像 setEngineScanner 的模块级单例模式;daemon shutdown
// 不持有它,由测试 afterEach 复位回真实探测以隔离测试。
let activeEngineAuthProbe: InspectEngineCredential = inspectLocalEngineCredential

export function setEngineAuthProbe(probe: InspectEngineCredential | null): void {
  activeEngineAuthProbe = probe ?? inspectLocalEngineCredential
}

// daemon 路由与 defaultLocalSettings 共用的扫描入口,始终走当前激活的扫描器。
export function scanEnginesForDaemon(): LocalEngineStatus[] {
  return activeEngineScanner()
}

const DEFAULT_CONNECTORS: LocalSettingsConfig['connectors'] = [
  { enabled: false, id: 'ats', name: 'ATS / HRIS', status: 'not_configured' },
  { enabled: false, id: 'docs', name: 'Docs workspace', status: 'not_configured' },
  { enabled: false, id: 'issue-tracker', name: 'Issue tracker', status: 'not_configured' },
  { enabled: false, id: 'ci', name: 'CI / release evidence', status: 'not_configured' },
  { enabled: false, id: 'cloud', name: 'Cloud account', status: 'not_configured' },
  { enabled: false, id: 'crm', name: 'CRM', status: 'not_configured' },
]

/**
 * BYOK 执行元数据的唯一 builder。CLI 和 daemon 均通过 ./settings 子路径导入此函数，
 * 确保两个 surface 的 BYOK 调用元数据来源相同（Principle #2, T2.1 single source of truth）。
 * 纯函数，不读 DB、不扫引擎 — 仅从 LocalSettingsConfig 派生，保持 daemon/CLI 共用安全。
 *
 * 输出 shape 与 worker.ts resolvedExecutionMetadata BYOK 分支完全一致：
 *   { byok, engineCommand: null, engineId: byok.provider, engineName: null, executionMode: 'byok' }
 */
export function deriveByokExecutionMetadata(settings: LocalSettingsConfig): Record<string, unknown> {
  return {
    byok: settings.byok,
    engineCommand: null,
    engineId: settings.byok.provider,
    engineName: null,
    executionMode: 'byok',
  }
}

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

const SECRET_REFERENCE_PREFIXES = ['$', 'env:', 'secretref:'] as const
// Value-format alternation (PEM/JWT/ghp_/gho_/github_pat_/AKIA/AIza) sourced from the
// shared engine-bridge constant. Bearer/sk- appended for BYOK ref-body detection.
// No flags: used only in .test() — adding 'g' would make .test() stateful via lastIndex.
const LITERAL_SECRET_RE = new RegExp(`${SECRET_FORMAT_ALTERNATION}|Bearer\\s+[\\w.~+/-]{12,}|sk-[\\w-]{8,}`)

function isSafeSecretReference(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed === '[REDACTED]')
    return true
  const prefix = SECRET_REFERENCE_PREFIXES.find(candidate => trimmed.startsWith(candidate))
  if (!prefix)
    return false
  // Guard against prefix disguise, e.g. 'env:OPENAI_API_KEY=sk-...' or '$X=literal':
  // the reference body must name a lookup target, not embed an assignment or a
  // literal secret value.
  const body = trimmed.slice(prefix.length)
  if (body.includes('='))
    return false
  return !LITERAL_SECRET_RE.test(body)
}

function normalizeLocalSettingsPersistenceError(error: unknown): unknown {
  if (!(error instanceof Error))
    return error

  if (error.message.startsWith('Literal secrets are not allowed in Worker metadata:')) {
    return new AppError(
      'LOCAL_SETTINGS_SECRET',
      422,
      'Local settings must store secret references, not literal secrets.',
    )
  }

  if (error.message.startsWith('Full native MCP files are not allowed in Worker metadata:')) {
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
  const engines = activeEngineScanner()
  // auth-aware 默认:先选已登录(authReady)引擎,其次回退首个 installed(零配置不破),
  // 一个都没装才退 byok 引导态。扫描器按 LOCAL_ENGINE_DEFINITIONS 顺序返回,故同为
  // authReady 时 tiebreak 稳定(codex 先于 claude-code)。installed-but-unauthed 仍走
  // local-cli,引导态(doctor warn / 首回合可操作引导)由 1b-2 / 1b-4 在下游交付。
  const authReady = engines.find(engine => resolveEngineAuthReadiness(engine, activeEngineAuthProbe))
  const selected = authReady ?? engines.find(engine => engine.installed)
  return {
    appearance: 'system',
    byok: {
      apiKeyRef: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      provider: 'openai-compatible',
    },
    connectors: defaultConnectors(),
    engineId: selected?.id ?? 'codex',
    engines,
    executionMode: selected ? 'local-cli' : 'byok',
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
