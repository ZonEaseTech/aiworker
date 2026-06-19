import type { AdminAuthBootstrapStatus, AdminRemediationCode } from '@/lib/admin-remediation'
import { AdminApiError, adminReadHeaders } from '@/lib/admin-api-client'

const authRequiredCodes: ReadonlySet<AdminRemediationCode> = new Set([
  'admin_auth_required',
  'admin_auth_misconfigured',
  'admin_token_required',
])

/**
 * 判断一个失败是否代表"会话失效/需要登录"。控制面不可用等错误不算，避免误跳转登录。
 */
export function isAuthRequiredError(error: unknown): boolean {
  return error instanceof AdminApiError
    && (error.status === 401 || error.status === 403)
    && authRequiredCodes.has(error.remediation.code)
}

/**
 * 会话在使用中过期时整页跳转到登录，并带上当前位置作为 returnTo。
 * 对齐 Next.js middleware 在请求时重定向未登录用户的行为。返回是否已触发跳转。
 */
export function redirectToLoginIfAuthRequired(error: unknown, loginUrl = '/login'): boolean {
  if (!isAuthRequiredError(error))
    return false
  const location = globalThis.location
  if (!location)
    return false
  location.href = appendReturnTo(loginUrl, location)
  return true
}

export interface AdminSessionStatus {
  auth: AdminAuthBootstrapStatus
  authorized: boolean
}

export type AuthGateState
  = | { kind: 'authorized' }
    | { kind: 'login-required', loginUrl: string, userEmail?: string }
    | { kind: 'misconfigured' }

/**
 * 把 `/api/auth/session` 的结果翻译成门禁状态。
 *
 * 关键：只信 `/api/auth/session`（永远 200、不依赖控制面）的 `authorized`/`loginRequired`，
 * 不要用 `/api/admin-data` 的 bootstrap——后者在控制面宕机时会把任何失败标成 `locked`，
 * 会把"控制面不可用"误判成"请登录"。local 模式（loginRequired=false）永远放行，
 * 以保留无 Logto 的本地 fixture 预览。
 */
export function resolveAuthGateState(status: AdminSessionStatus): AuthGateState {
  if (status.authorized || !status.auth.loginRequired)
    return { kind: 'authorized' }
  if (status.auth.mode === 'misconfigured')
    return { kind: 'misconfigured' }
  return {
    kind: 'login-required',
    loginUrl: status.auth.loginUrl,
    ...(status.auth.userEmail ? { userEmail: status.auth.userEmail } : {}),
  }
}

export async function fetchAdminSessionStatus(signal?: AbortSignal): Promise<AdminSessionStatus> {
  const response = await fetch('/api/auth/session', { headers: adminReadHeaders(), signal })
  if (!response.ok)
    throw new Error(`admin session status request failed (${response.status})`)
  return await response.json() as AdminSessionStatus
}

/**
 * 在登录 URL 上附带当前位置作为 returnTo（仅取同源 pathname+search，host 不可注入）。
 * 服务端 `safeReturnTo` 会再次白名单校验并丢弃 `/login`/`/callback`/`/logout` 等路径。
 */
export function appendReturnTo(loginUrl: string, location: Location | undefined = globalThis.location): string {
  if (!location)
    return loginUrl
  const url = new URL(loginUrl, location.origin)
  const returnTo = `${location.pathname}${location.search}`
  if (returnTo && returnTo !== '/')
    url.searchParams.set('returnTo', returnTo)
  return `${url.pathname}${url.search}`
}
