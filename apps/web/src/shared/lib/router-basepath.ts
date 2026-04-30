import { WORKER_ID_PATTERN } from '@zonease/aiworker-shared'

export type WebBundleScope = 'fleet' | 'worker'

const ADMIN_BASEPATH = '/admin'

export function resolveWebRouterBasepath(
  scope: WebBundleScope,
  pathname = globalThis.location?.pathname ?? `${ADMIN_BASEPATH}/`,
): string {
  const devBasepath = `/${scope}`
  if (pathname === devBasepath || pathname.startsWith(`${devBasepath}/`))
    return devBasepath
  if (scope === 'worker') {
    const match = /^\/w\/([^/]+)(?:\/|$)/.exec(pathname)
    if (match && WORKER_ID_PATTERN.test(match[1]!))
      return `/w/${match[1]!}`
  }
  return ADMIN_BASEPATH
}
