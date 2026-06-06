import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'

const DEFAULT_LOGTO_CONFIG_PATH = 'tmp/.logto'
const LOGTO_PROOF_APP_NAME = 'AIWorker Local Auth Proof'

export interface LogtoM2MConfig {
  endpoint: string
  issuer: string
  managementApiIndicator?: string
  managementEndpoint?: string
  m2mAppId: string
  m2mAppSecret: string
  tenantId?: string
}

export interface LogtoProofApplication {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface ManualLogtoConfiguration {
  manualConfiguration: {
    appName: string
    applicationType: 'Traditional'
    issuer: string
    postLogoutRedirectUri: string
    reason: string
    redirectUri: string
    stage: LogtoManualConfigurationStage
    status: LogtoManualConfigurationStatus
  }
}

type LogtoFetch = (input: Request | string | URL, init?: RequestInit) => Promise<Response>
type LogtoConfigReader = (path: string) => Promise<string> | string
type LogtoManualConfigurationStage = 'configuration' | 'create' | 'lookup' | 'secret-read' | 'token' | 'update'
type LogtoManualConfigurationStatus = 'invalid_response' | 'not_configured' | 'request_failed' | number

interface LogtoApplication {
  id: string
  secret?: string
}

interface LogtoManagementConfig {
  apiIndicator: string
  endpoint: string
}

interface LogtoManagementFailure {
  reason: string
  stage: LogtoManualConfigurationStage
  status: LogtoManualConfigurationStatus
}

export async function loadLogtoM2MConfigFile(input: {
  configPath?: string
  readText?: LogtoConfigReader
} = {}): Promise<LogtoM2MConfig> {
  const configPath = input.configPath ?? DEFAULT_LOGTO_CONFIG_PATH
  const readText = input.readText ?? ((path: string) => readFile(path, 'utf8'))
  return loadLogtoM2MConfigText(await readText(configPath))
}

export function loadLogtoM2MConfigText(text: string): LogtoM2MConfig {
  const values = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue

    const index = trimmed.indexOf('=')
    if (index <= 0)
      continue

    values.set(trimmed.slice(0, index), trimmed.slice(index + 1))
  }

  const tenantId = optionalValue(values, 'LOGTO_TENANT_ID')
  const config: LogtoM2MConfig = {
    endpoint: normalizeEndpoint(requireValue(values, 'LOGTO_ENDPOINT')),
    issuer: requireValue(values, 'LOGTO_ISSUER'),
    m2mAppId: requireValue(values, 'LOGTO_M2M_APP_ID'),
    m2mAppSecret: requireValue(values, 'LOGTO_M2M_APP_SECRET'),
  }
  if (tenantId)
    config.tenantId = tenantId

  const derivedManagementEndpoint = tenantId ? `https://${tenantId}.logto.app/` : undefined
  const derivedManagementApiIndicator = tenantId ? `https://${tenantId}.logto.app/api` : undefined
  const managementEndpoint = optionalValue(values, 'LOGTO_MANAGEMENT_ENDPOINT') ?? derivedManagementEndpoint
  const managementApiIndicator = optionalValue(values, 'LOGTO_MANAGEMENT_API_INDICATOR') ?? derivedManagementApiIndicator

  if (managementEndpoint)
    config.managementEndpoint = normalizeEndpoint(managementEndpoint)
  if (managementApiIndicator)
    config.managementApiIndicator = normalizeApiIndicator(managementApiIndicator)

  return config
}

export function redactLogtoConfigForOutput(config: LogtoM2MConfig) {
  return { ...config, m2mAppSecret: '[REDACTED]' }
}

export function redactLogtoProofApplication(result: LogtoProofApplication | ManualLogtoConfiguration) {
  if ('manualConfiguration' in result)
    return result

  return { ...result, clientSecret: '[REDACTED]' }
}

export async function ensureLogtoProofApplication(input: {
  config: LogtoM2MConfig
  fetch?: LogtoFetch
  hostBrowserBaseUrl: string
}): Promise<LogtoProofApplication | ManualLogtoConfiguration> {
  const fetchImpl = input.fetch ?? ((request, init) => fetch(request, init))
  const hostBrowserBaseUrl = input.hostBrowserBaseUrl.replace(/\/+$/, '')
  const redirectUri = `${hostBrowserBaseUrl}/auth/callback`
  const postLogoutRedirectUri = `${hostBrowserBaseUrl}/host`
  const manualConfiguration = (failure: LogtoManagementFailure) =>
    buildManualConfiguration(input.config, redirectUri, postLogoutRedirectUri, failure)
  const management = resolveManagementConfig(input.config)
  if (!management) {
    return manualConfiguration({
      reason: 'missing_management_api_config',
      stage: 'configuration',
      status: 'not_configured',
    })
  }

  const token = await requestManagementToken(input.config, management, fetchImpl)
  if (isManagementFailure(token))
    return manualConfiguration(token)

  const app = await ensureProofApplication(management, fetchImpl, token, redirectUri, postLogoutRedirectUri)
  if (isManagementFailure(app))
    return manualConfiguration(app)

  if (app.secret)
    return { clientId: app.id, clientSecret: app.secret, redirectUri }

  const secret = await readApplicationSecret(management, fetchImpl, token, app.id)
  if (isManagementFailure(secret))
    return manualConfiguration(secret)

  return { clientId: app.id, clientSecret: secret, redirectUri }
}

async function requestManagementToken(
  config: LogtoM2MConfig,
  management: LogtoManagementConfig,
  fetchImpl: LogtoFetch,
): Promise<string | LogtoManagementFailure> {
  const response = await safeFetch('token', fetchImpl, new URL('/oidc/token', management.endpoint), {
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: management.apiIndicator,
      scope: 'all',
    }),
    headers: {
      authorization: `Basic ${Buffer.from(`${config.m2mAppId}:${config.m2mAppSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })
  if (isManagementFailure(response))
    return response
  if (!response.ok)
    return managementRequestFailure('token', response.status)

  const body = await safeResponseJson(response, 'token')
  if (isManagementFailure(body))
    return body
  if (!isJsonRecord(body)) {
    return {
      reason: 'invalid_management_api_response',
      stage: 'token',
      status: 'invalid_response',
    }
  }
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    return {
      reason: 'missing_access_token',
      stage: 'token',
      status: 'invalid_response',
    }
  }

  return body.access_token
}

async function ensureProofApplication(
  management: LogtoManagementConfig,
  fetchImpl: LogtoFetch,
  token: string,
  redirectUri: string,
  postLogoutRedirectUri: string,
): Promise<LogtoApplication | LogtoManagementFailure> {
  const existing = await findProofApplication(management, fetchImpl, token)
  if (isManagementFailure(existing))
    return existing

  if (existing) {
    const updated = await updateProofApplication(management, fetchImpl, token, existing.id, redirectUri, postLogoutRedirectUri)
    return isManagementFailure(updated) ? updated : existing
  }

  return createProofApplication(management, fetchImpl, token, redirectUri, postLogoutRedirectUri)
}

async function findProofApplication(
  management: LogtoManagementConfig,
  fetchImpl: LogtoFetch,
  token: string,
): Promise<LogtoApplication | false | LogtoManagementFailure> {
  const response = await safeFetch('lookup', fetchImpl, new URL('/api/applications', management.endpoint), {
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
  })
  if (isManagementFailure(response))
    return response
  if (!response.ok)
    return managementRequestFailure('lookup', response.status)

  const body = await safeResponseJson(response, 'lookup')
  if (isManagementFailure(body))
    return body
  const applications = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
      ? (body as { data: unknown[] }).data
      : []
  const app = applications.find(item =>
    item
    && typeof item === 'object'
    && (item as { name?: unknown }).name === LOGTO_PROOF_APP_NAME
    && typeof (item as { id?: unknown }).id === 'string'
  ) as { id: string } | undefined

  return app ? { id: app.id } : false
}

async function createProofApplication(
  management: LogtoManagementConfig,
  fetchImpl: LogtoFetch,
  token: string,
  redirectUri: string,
  postLogoutRedirectUri: string,
): Promise<LogtoApplication | LogtoManagementFailure> {
  const response = await safeFetch('create', fetchImpl, new URL('/api/applications', management.endpoint), {
    body: JSON.stringify(proofApplicationPayload(redirectUri, postLogoutRedirectUri)),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  if (isManagementFailure(response))
    return response
  if (!response.ok)
    return managementRequestFailure('create', response.status)

  const body = await safeResponseJson(response, 'create')
  if (isManagementFailure(body))
    return body
  if (!isJsonRecord(body)) {
    return {
      reason: 'invalid_management_api_response',
      stage: 'create',
      status: 'invalid_response',
    }
  }
  if (typeof body.id !== 'string') {
    return {
      reason: 'missing_application_id',
      stage: 'create',
      status: 'invalid_response',
    }
  }

  return typeof body.secret === 'string' && body.secret.length > 0
    ? { id: body.id, secret: body.secret }
    : { id: body.id }
}

async function updateProofApplication(
  management: LogtoManagementConfig,
  fetchImpl: LogtoFetch,
  token: string,
  appId: string,
  redirectUri: string,
  postLogoutRedirectUri: string,
): Promise<true | LogtoManagementFailure> {
  const response = await safeFetch('update', fetchImpl, new URL(`/api/applications/${encodeURIComponent(appId)}`, management.endpoint), {
    body: JSON.stringify(proofApplicationPayload(redirectUri, postLogoutRedirectUri)),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'PATCH',
  })
  if (isManagementFailure(response))
    return response
  if (!response.ok)
    return managementRequestFailure('update', response.status)

  return true
}

async function readApplicationSecret(
  management: LogtoManagementConfig,
  fetchImpl: LogtoFetch,
  token: string,
  appId: string,
): Promise<string | LogtoManagementFailure> {
  const response = await safeFetch('secret-read', fetchImpl, new URL(`/api/applications/${encodeURIComponent(appId)}/secrets`, management.endpoint), {
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
  })
  if (isManagementFailure(response))
    return response
  if (!response.ok)
    return managementRequestFailure('secret-read', response.status)

  const body = await safeResponseJson(response, 'secret-read')
  if (isManagementFailure(body))
    return body
  if (!Array.isArray(body)) {
    return {
      reason: 'invalid_secret_response',
      stage: 'secret-read',
      status: 'invalid_response',
    }
  }

  const first = body.find(item =>
    item
    && typeof item === 'object'
    && typeof (item as { value?: unknown }).value === 'string'
  ) as { value: string } | undefined
  if (!first) {
    return {
      reason: 'missing_application_secret',
      stage: 'secret-read',
      status: 'invalid_response',
    }
  }

  return first.value
}

async function safeFetch(
  stage: LogtoManualConfigurationStage,
  fetchImpl: LogtoFetch,
  input: URL,
  init: RequestInit,
): Promise<Response | LogtoManagementFailure> {
  try {
    return await fetchImpl(input, init)
  }
  catch {
    return {
      reason: 'management_api_request_failed',
      stage,
      status: 'request_failed',
    }
  }
}

async function safeResponseJson(
  response: Response,
  stage: LogtoManualConfigurationStage,
): Promise<Record<string, unknown> | unknown[] | LogtoManagementFailure> {
  try {
    return await response.json() as Record<string, unknown> | unknown[]
  }
  catch {
    return {
      reason: 'invalid_management_api_response',
      stage,
      status: 'invalid_response',
    }
  }
}

function resolveManagementConfig(config: LogtoM2MConfig): LogtoManagementConfig | null {
  const managementEndpoint = config.managementEndpoint ?? (config.tenantId ? `https://${config.tenantId}.logto.app/` : undefined)
  const managementApiIndicator = config.managementApiIndicator ?? (config.tenantId ? `https://${config.tenantId}.logto.app/api` : undefined)
  if (!managementEndpoint || !managementApiIndicator)
    return null

  return {
    apiIndicator: normalizeApiIndicator(managementApiIndicator),
    endpoint: normalizeEndpoint(managementEndpoint),
  }
}

function proofApplicationPayload(redirectUri: string, postLogoutRedirectUri: string) {
  return {
    description: 'Local proof application for AIWorker Host Logto integration.',
    name: LOGTO_PROOF_APP_NAME,
    oidcClientMetadata: {
      postLogoutRedirectUris: [postLogoutRedirectUri],
      redirectUris: [redirectUri],
    },
    type: 'Traditional',
  }
}

function buildManualConfiguration(
  config: LogtoM2MConfig,
  redirectUri: string,
  postLogoutRedirectUri: string,
  failure: LogtoManagementFailure,
): ManualLogtoConfiguration {
  return {
    manualConfiguration: {
      appName: LOGTO_PROOF_APP_NAME,
      applicationType: 'Traditional',
      issuer: config.issuer,
      postLogoutRedirectUri,
      reason: failure.reason,
      redirectUri,
      stage: failure.stage,
      status: failure.status,
    },
  }
}

function managementRequestFailure(stage: LogtoManualConfigurationStage, status: number): LogtoManagementFailure {
  return {
    reason: 'management_api_request_failed',
    stage,
    status,
  }
}

function isManagementFailure(value: unknown): value is LogtoManagementFailure {
  return Boolean(
    value
    && typeof value === 'object'
    && 'reason' in value
    && 'stage' in value
    && 'status' in value,
  )
}

function isJsonRecord(value: Record<string, unknown> | unknown[]): value is Record<string, unknown> {
  return !Array.isArray(value)
}

function optionalValue(values: Map<string, string>, key: string): string | undefined {
  const value = values.get(key)
  return value && value.length > 0 ? value : undefined
}

function requireValue(values: Map<string, string>, key: string): string {
  const value = values.get(key)
  if (!value)
    throw new Error(`Missing ${key} in Logto config`)

  return value
}

function normalizeEndpoint(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, '')}/`
}

function normalizeApiIndicator(apiIndicator: string): string {
  return apiIndicator.replace(/\/+$/, '')
}
