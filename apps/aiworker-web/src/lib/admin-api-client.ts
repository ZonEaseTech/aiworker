import type { AdminApiErrorPayload, AdminRemediation } from '@/lib/admin-remediation'
import { adminRemediation, isAdminApiErrorPayload } from '@/lib/admin-remediation'

const adminTokenStorageKey = 'AIWORKER_WEB_ADMIN_TOKEN'

export interface AdminTokenStorageState {
  location: 'local' | 'session' | null
  stored: boolean
}

export class AdminApiError extends Error {
  remediation: AdminRemediation
  status: number

  constructor(status: number, remediation: AdminRemediation) {
    super(`${remediation.code}: ${remediation.title}`)
    this.name = 'AdminApiError'
    this.remediation = remediation
    this.status = status
  }
}

export function adminMutationHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'x-aiworker-admin-action': '1',
  }
  const readHeaders = adminReadHeaders()
  if ('authorization' in readHeaders)
    headers.authorization = readHeaders.authorization
  return headers
}

export function adminReadHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = readStoredAdminToken()
  if (token)
    headers.authorization = `Bearer ${token}`
  return headers
}

export async function readAdminApiError(response: Response): Promise<AdminApiError> {
  const payload = await response.json().catch(() => null) as AdminApiErrorPayload | null
  if (isAdminApiErrorPayload(payload))
    return new AdminApiError(response.status, payload.remediation)
  return new AdminApiError(response.status, adminRemediation('unknown_admin_error'))
}

export function readAdminTokenStorageState(): AdminTokenStorageState {
  try {
    if (globalThis.localStorage?.getItem(adminTokenStorageKey)?.trim())
      return { location: 'local', stored: true }
    if (globalThis.sessionStorage?.getItem(adminTokenStorageKey)?.trim())
      return { location: 'session', stored: true }
  }
  catch {}

  return { location: null, stored: false }
}

export function saveAdminToken(token: string, persist: boolean): AdminTokenStorageState {
  const normalized = token.trim()
  if (!normalized) {
    clearAdminToken()
    return readAdminTokenStorageState()
  }

  try {
    if (persist) {
      globalThis.localStorage?.setItem(adminTokenStorageKey, normalized)
      globalThis.sessionStorage?.removeItem(adminTokenStorageKey)
    }
    else {
      globalThis.sessionStorage?.setItem(adminTokenStorageKey, normalized)
      globalThis.localStorage?.removeItem(adminTokenStorageKey)
    }
  }
  catch {}

  return readAdminTokenStorageState()
}

export function clearAdminToken(): AdminTokenStorageState {
  try {
    globalThis.localStorage?.removeItem(adminTokenStorageKey)
    globalThis.sessionStorage?.removeItem(adminTokenStorageKey)
  }
  catch {}

  return readAdminTokenStorageState()
}

export function readStoredAdminToken(): string {
  try {
    return globalThis.localStorage?.getItem(adminTokenStorageKey)?.trim()
      || globalThis.sessionStorage?.getItem(adminTokenStorageKey)?.trim()
      || ''
  }
  catch {
    return ''
  }
}
