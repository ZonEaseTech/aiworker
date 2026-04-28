export type WebBundleScope = 'fleet' | 'worker'

const ADMIN_BASEPATH = '/admin'

export function resolveWebRouterBasepath(
  scope: WebBundleScope,
  pathname = globalThis.location?.pathname ?? `${ADMIN_BASEPATH}/`,
): string {
  const devBasepath = `/${scope}`
  if (pathname === devBasepath || pathname.startsWith(`${devBasepath}/`))
    return devBasepath
  return ADMIN_BASEPATH
}
