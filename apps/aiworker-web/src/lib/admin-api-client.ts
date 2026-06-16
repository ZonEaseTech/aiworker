export function adminMutationHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'x-aiworker-admin-action': '1',
  }
  const token = readStoredAdminToken()
  if (token)
    headers.authorization = `Bearer ${token}`
  return headers
}

function readStoredAdminToken(): string {
  try {
    return globalThis.localStorage?.getItem('AIWORKER_WEB_ADMIN_TOKEN')?.trim()
      || globalThis.sessionStorage?.getItem('AIWORKER_WEB_ADMIN_TOKEN')?.trim()
      || ''
  }
  catch {
    return ''
  }
}
