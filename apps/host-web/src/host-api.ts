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
  revokedAt?: null | string
  serverRef: string
  soulReleaseRef: string
  status: AssignmentStatus
  workerId: null | string
  workbenchUrl: null | string
}

export interface CreateHostAssignmentInput {
  assignedEmail: string
  serverRef: string
  soulReleaseRef: string
}

export interface CreateHostAssignmentResult {
  aisshCommand?: string
  assignment: HostAssignmentSummary
  provisionCommand: string
}

export interface HostServerOption {
  host?: string
  id: string
  name?: string
  notes?: string
  source: 'aissh'
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
  servers: HostServerOption[]
  soulReleases: HostSoulReleaseOption[]
  serverSourceError?: string
  soulSourceErrors?: string[]
}

export interface HostApiClient {
  createAssignment: (input: CreateHostAssignmentInput) => Promise<CreateHostAssignmentResult>
  getOptions: () => Promise<HostOptionsSummary>
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

  return {
    async createAssignment(input) {
      return requestJson<CreateHostAssignmentResult>(fetchImpl, assignmentsUrl, {
        body: JSON.stringify({
          assignedEmail: input.assignedEmail,
          serverRef: input.serverRef,
          soulReleaseRef: input.soulReleaseRef,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    },
    async getOptions() {
      return requestJson<HostOptionsSummary>(fetchImpl, optionsUrl)
    },
    async listAssignments() {
      const result = await requestJson<ListAssignmentsResponse>(fetchImpl, assignmentsUrl)
      return result.assignments
    },
  }
}
