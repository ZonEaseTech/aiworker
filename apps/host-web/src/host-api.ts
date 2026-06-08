export type AssignmentStatus
  = | 'draft'
    | 'provisioning'
    | 'checked_in'
    | 'access_ready'
    | 'ready'
    | 'needs_attention'
    | 'revoked'
    | 'archived'

export interface HostAssignmentSummary {
  assignedEmail: string
  assignmentId?: string
  provisioningAdapterType?: ProvisioningAdapterType
  provisioningTargetMaturity?: ProvisioningTargetMaturity
  provisioningTargetRef?: string
  revokedAt?: null | string
  serverRef: string
  soulReleaseRef: string
  status: AssignmentStatus
  workerId: null | string
  workbenchUrl: null | string
}

export interface CreateHostAssignmentInput {
  adapterRuntimeControlBaseUrl?: string
  assignedEmail: string
  provisioningTarget: {
    adapterType: HostProvisioningTargetOption['adapterType']
    maturity: HostProvisioningTargetOption['maturity']
    ref: string
  }
  soulReleaseRef: string
}

export interface CreateHostAssignmentResult {
  assignment: HostAssignmentSummary
  deliveryReceipt?: {
    adapterType: ProvisioningAdapterType
    command: string
    targetRef: string
  }
  deliveryStatus?: 'delivered'
  expectedCheckInDeadline?: string
  operatorHint?: string
  provisionCommand: string
  provisionToken?: string
}

export type ProvisioningAdapterType = 'aissh' | 'docker' | 'local'
export type ProvisioningTargetMaturity = 'production' | 'preview' | 'dev'
export type ProvisioningTargetHealth = 'ready' | 'degraded' | 'unavailable'

export interface HostProvisioningTargetOption {
  adapterType: ProvisioningAdapterType
  capabilities: string[]
  description?: string
  displayName: string
  health: ProvisioningTargetHealth
  id: string
  maturity: ProvisioningTargetMaturity
  ref: string
}

export interface HostSoulReleaseOption {
  descriptorPath: string
  id: string
  name: string
  releaseRef: string
  source: 'official'
}

export interface HostOptionsSummary {
  access: { mode: string, status: string }
  auth: { mode: string, status: string }
  provisioningTargets: HostProvisioningTargetOption[]
  provisioningTargetSourceError?: string
  soulReleases: HostSoulReleaseOption[]
  soulSourceErrors?: string[]
}

export interface HostOperator {
  email: string
  roles: string[]
  subject: string
}

export interface HostApiClient {
  createAssignment: (input: CreateHostAssignmentInput) => Promise<CreateHostAssignmentResult>
  getOptions: () => Promise<HostOptionsSummary>
  getOperator: () => Promise<HostOperator | null>
  listAssignments: () => Promise<HostAssignmentSummary[]>
}

export interface HostApiEnv {
  AIWORKER_HOST_API_URL?: string
}

export class HostApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(input: { code: string, status: number }) {
    super(`Host API request failed: ${input.code}`)
    this.name = 'HostApiError'
    this.code = input.code
    this.status = input.status
  }
}

interface CreateHostApiClientOptions {
  baseUrl?: string
  fetch?: typeof fetch
}

interface ListAssignmentsResponse {
  assignments: HostAssignmentSummary[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorCodeFromBody(body: unknown, status: number): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string' && body.error.code.length > 0)
    return body.error.code
  return `HTTP_${status}`
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  }
  catch {
    if (!response.ok)
      return null
    throw new Error('Host API response was not valid JSON')
  }
}

async function requestJson<T>(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init)
  const body = await readJson(response)
  if (!response.ok)
    throw new HostApiError({ code: errorCodeFromBody(body, response.status), status: response.status })
  return body as T
}

export function hostApiBaseUrl(env: HostApiEnv = {}): string {
  return (env.AIWORKER_HOST_API_URL ?? '').replace(/\/+$/, '')
}

export function createHostApiClient(options: CreateHostApiClientOptions = {}): HostApiClient {
  const baseUrl = (options.baseUrl ?? hostApiBaseUrl()).replace(/\/+$/, '')
  const fetchImpl = options.fetch ?? fetch
  const assignmentsUrl = `${baseUrl}/api/host/assignments`
  const optionsUrl = `${baseUrl}/api/host/options`
  const operatorUrl = `${baseUrl}/api/auth/me`

  return {
    async createAssignment(input) {
      return requestJson<CreateHostAssignmentResult>(fetchImpl, assignmentsUrl, {
        body: JSON.stringify({
          ...(input.adapterRuntimeControlBaseUrl
            ? { adapterRuntimeControlBaseUrl: input.adapterRuntimeControlBaseUrl }
            : {}),
          assignedEmail: input.assignedEmail,
          provisioningTarget: input.provisioningTarget,
          soulReleaseRef: input.soulReleaseRef,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    },
    async getOptions() {
      return requestJson<HostOptionsSummary>(fetchImpl, optionsUrl)
    },
    async getOperator() {
      const response = await fetchImpl(operatorUrl)
      if (response.status === 401)
        return null
      const body = await readJson(response)
      if (!response.ok)
        throw new HostApiError({ code: errorCodeFromBody(body, response.status), status: response.status })
      const user = isRecord(body) && isRecord(body.user) ? body.user : null
      if (!user || typeof user.email !== 'string')
        return null
      return {
        email: user.email,
        roles: Array.isArray(user.roles) ? user.roles.filter((role): role is string => typeof role === 'string') : [],
        subject: typeof user.subject === 'string' ? user.subject : '',
      }
    },
    async listAssignments() {
      const result = await requestJson<ListAssignmentsResponse>(fetchImpl, assignmentsUrl)
      return result.assignments
    },
  }
}
