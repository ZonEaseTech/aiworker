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
  deprecatedSecret?: string
  id: string
}

interface LogtoApplicationListPage {
  applications: Array<{ id: string, name: string }>
  page?: number
  pageSize?: number
  pageSizeParameter?: 'pageSize' | 'page_size'
  total?: number
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

  const secret = await readApplicationSecret(management, fetchImpl, token, app.id)
  if (isManagementFailure(secret)) {
    if (app.deprecatedSecret)
      return { clientId: app.id, clientSecret: app.deprecatedSecret, redirectUri }

    return manualConfiguration(secret)
  }

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
  let page = 1
  let pageSize: number | undefined
  let pageSizeParameter: 'pageSize' | 'page_size' = 'page_size'

  while (true) {
    const response = await safeFetch('lookup', fetchImpl, applicationLookupUrl(management, page, pageSize, pageSizeParameter), {
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
    const applicationPage = parseApplicationListPage(body)
    if (isManagementFailure(applicationPage))
      return applicationPage

    const app = applicationPage.applications.find(item => item.name === LOGTO_PROOF_APP_NAME)
    if (app)
      return { id: app.id }

    if (!hasNextApplicationListPage(applicationPage))
      return false

    page = applicationPage.page + 1
    pageSize = applicationPage.pageSize
    pageSizeParameter = applicationPage.pageSizeParameter
  }
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

  const deprecatedSecret = typeof body.secret === 'string' && body.secret.trim().length > 0
    ? body.secret.trim()
    : undefined

  return deprecatedSecret
    ? { deprecatedSecret, id: body.id }
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
    isJsonRecord(item)
    && typeof item.value === 'string'
    && item.value.trim().length > 0
  ) as { value: string } | undefined
  if (!first) {
    return {
      reason: 'missing_application_secret',
      stage: 'secret-read',
      status: 'invalid_response',
    }
  }

  return first.value.trim()
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

async function safeResponseJson(response: Response, stage: LogtoManualConfigurationStage): Promise<LogtoManagementFailure | unknown> {
  try {
    return await response.json() as unknown
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

function applicationLookupUrl(
  management: LogtoManagementConfig,
  page: number,
  pageSize: number | undefined,
  pageSizeParameter: 'pageSize' | 'page_size',
) {
  const url = new URL('/api/applications', management.endpoint)
  if (page > 1) {
    url.searchParams.set('page', String(page))
    if (pageSize)
      url.searchParams.set(pageSizeParameter, String(pageSize))
  }

  return url
}

function parseApplicationListPage(body: unknown): LogtoApplicationListPage | LogtoManagementFailure {
  if (!isJsonRecord(body) || !Array.isArray(body.data))
    return invalidLookupResponse()

  const applications = parseApplicationItems(body.data)
  if (isManagementFailure(applications))
    return applications

  const page = body.page
  const total = body.totalCount ?? body.total
  const pageSizeParameter = typeof body.page_size === 'number' ? 'page_size' : 'pageSize'
  const pageSize = body[pageSizeParameter]
  if (!isPositiveInteger(page) || !isPositiveInteger(pageSize) || !isNonNegativeInteger(total))
    return invalidLookupResponse()

  return {
    applications,
    page,
    pageSize,
    pageSizeParameter,
    total,
  }
}

function parseApplicationItems(rawApplications: unknown[]): Array<{ id: string, name: string }> | LogtoManagementFailure {
  const applications: Array<{ id: string, name: string }> = []
  for (const item of rawApplications) {
    if (!isJsonRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string')
      return invalidLookupResponse()

    applications.push({ id: item.id, name: item.name })
  }

  return applications
}

function hasNextApplicationListPage(page: LogtoApplicationListPage): page is LogtoApplicationListPage & {
  page: number
  pageSize: number
  pageSizeParameter: 'pageSize' | 'page_size'
  total: number
} {
  return typeof page.page === 'number'
    && typeof page.pageSize === 'number'
    && typeof page.pageSizeParameter === 'string'
    && typeof page.total === 'number'
    && page.page * page.pageSize < page.total
}

function invalidLookupResponse(): LogtoManagementFailure {
  return {
    reason: 'invalid_lookup_response',
    stage: 'lookup',
    status: 'invalid_response',
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
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
