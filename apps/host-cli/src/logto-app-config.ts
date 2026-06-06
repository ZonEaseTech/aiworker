import { Buffer } from 'node:buffer'

const LOGTO_PROOF_APP_NAME = 'AIWorker Local Auth Proof'

export interface LogtoM2MConfig {
  endpoint: string
  issuer: string
  m2mAppId: string
  m2mAppSecret: string
}

export interface LogtoProofApplication {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface ManualLogtoConfiguration {
  manualConfiguration: {
    applicationType: 'Traditional'
    issuer: string
    postLogoutRedirectUri: string
    redirectUri: string
  }
}

type LogtoFetch = (input: Request | string | URL, init?: RequestInit) => Promise<Response>

interface LogtoApplication {
  id: string
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

  return {
    endpoint: requireValue(values, 'LOGTO_ENDPOINT'),
    issuer: requireValue(values, 'LOGTO_ISSUER'),
    m2mAppId: requireValue(values, 'LOGTO_M2M_APP_ID'),
    m2mAppSecret: requireValue(values, 'LOGTO_M2M_APP_SECRET'),
  }
}

export function redactLogtoConfigForOutput(config: LogtoM2MConfig) {
  return { ...config, m2mAppSecret: '[REDACTED]' }
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
  const token = await requestManagementToken(input.config, fetchImpl)
  const app = await ensureProofApplication(input.config, fetchImpl, token, redirectUri, postLogoutRedirectUri)
  if (!app)
    return buildManualConfiguration(input.config, redirectUri, postLogoutRedirectUri)

  const secret = await readApplicationSecret(input.config, fetchImpl, token, app.id)
  if (!secret)
    return buildManualConfiguration(input.config, redirectUri, postLogoutRedirectUri)

  return { clientId: app.id, clientSecret: secret, redirectUri }
}

async function requestManagementToken(config: LogtoM2MConfig, fetchImpl: LogtoFetch): Promise<string> {
  const response = await fetchImpl(new URL('/oidc/token', config.endpoint), {
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: new URL('/api', config.endpoint).toString().replace(/\/$/, ''),
      scope: 'all',
    }),
    headers: {
      authorization: `Basic ${Buffer.from(`${config.m2mAppId}:${config.m2mAppSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })
  if (!response.ok)
    throw new Error(`Logto Management API token request failed with status ${response.status}`)

  const body = await response.json() as { access_token?: unknown }
  if (typeof body.access_token !== 'string' || body.access_token.length === 0)
    throw new Error('Logto Management API token response is missing access_token')

  return body.access_token
}

async function ensureProofApplication(
  config: LogtoM2MConfig,
  fetchImpl: LogtoFetch,
  token: string,
  redirectUri: string,
  postLogoutRedirectUri: string,
): Promise<LogtoApplication | null> {
  const existing = await findProofApplication(config, fetchImpl, token)
  if (existing === null)
    return null

  if (existing) {
    const updated = await updateProofApplication(config, fetchImpl, token, existing.id, redirectUri, postLogoutRedirectUri)
    return updated ? existing : null
  }

  return createProofApplication(config, fetchImpl, token, redirectUri, postLogoutRedirectUri)
}

async function findProofApplication(
  config: LogtoM2MConfig,
  fetchImpl: LogtoFetch,
  token: string,
): Promise<LogtoApplication | false | null> {
  const response = await fetchImpl(new URL('/api/applications', config.endpoint), {
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
  })
  if (response.status === 401 || response.status === 403)
    return null
  if (!response.ok)
    throw new Error(`Logto application lookup failed with status ${response.status}`)

  const body = await response.json() as unknown
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
  config: LogtoM2MConfig,
  fetchImpl: LogtoFetch,
  token: string,
  redirectUri: string,
  postLogoutRedirectUri: string,
): Promise<LogtoApplication | null> {
  const response = await fetchImpl(new URL('/api/applications', config.endpoint), {
    body: JSON.stringify(proofApplicationPayload(redirectUri, postLogoutRedirectUri)),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  if (response.status === 401 || response.status === 403)
    return null
  if (!response.ok)
    throw new Error(`Logto application create failed with status ${response.status}`)

  const body = await response.json() as { id?: unknown }
  return typeof body.id === 'string' ? { id: body.id } : null
}

async function updateProofApplication(
  config: LogtoM2MConfig,
  fetchImpl: LogtoFetch,
  token: string,
  appId: string,
  redirectUri: string,
  postLogoutRedirectUri: string,
): Promise<boolean> {
  const response = await fetchImpl(new URL(`/api/applications/${encodeURIComponent(appId)}`, config.endpoint), {
    body: JSON.stringify(proofApplicationPayload(redirectUri, postLogoutRedirectUri)),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'PATCH',
  })
  if (response.status === 401 || response.status === 403)
    return false
  if (!response.ok)
    throw new Error(`Logto application update failed with status ${response.status}`)

  return true
}

async function readApplicationSecret(
  config: LogtoM2MConfig,
  fetchImpl: LogtoFetch,
  token: string,
  appId: string,
): Promise<string | null> {
  const response = await fetchImpl(new URL(`/api/applications/${encodeURIComponent(appId)}/secrets`, config.endpoint), {
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
  })
  if (response.status === 401 || response.status === 403)
    return null
  if (!response.ok)
    throw new Error(`Logto application secret read failed with status ${response.status}`)

  const body = await response.json() as unknown
  if (!Array.isArray(body))
    return null

  const first = body.find(item =>
    item
    && typeof item === 'object'
    && typeof (item as { value?: unknown }).value === 'string'
  ) as { value: string } | undefined
  return first?.value ?? null
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
): ManualLogtoConfiguration {
  return {
    manualConfiguration: {
      applicationType: 'Traditional',
      issuer: config.issuer,
      postLogoutRedirectUri,
      redirectUri,
    },
  }
}

function requireValue(values: Map<string, string>, key: string): string {
  const value = values.get(key)
  if (!value)
    throw new Error(`Missing ${key} in Logto config`)

  return value
}
