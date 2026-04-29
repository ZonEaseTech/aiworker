export type AdminServingSurface = 'fleet' | 'worker'

export interface AdminServingSafetyInput {
  surface: AdminServingSurface
  host: string
  serveWeb: boolean
  externalAuthAcknowledged?: boolean
}

/**
 * Return true when a bind/request address is limited to local loopback.
 */
export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address)
    return false
  if (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address === 'localhost')
    return true
  if (address.startsWith('127.'))
    return true
  return false
}

export function parseAdminExternalAuthAcknowledgement(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

/**
 * Fail closed when an admin bundle would be served on a non-loopback bind.
 *
 * This protects only the static `/admin/*` surface. Operators still need an
 * external auth layer for gateway `/ws` and worker management APIs in public
 * deployments.
 */
export function assertAdminServingIsSafe(args: AdminServingSafetyInput): void {
  if (!args.serveWeb)
    return
  if (isLoopbackAddress(args.host))
    return
  if (args.externalAuthAcknowledged === true)
    return

  throw new Error(
    `[${args.surface}] refusing to serve /admin/* on non-loopback host="${args.host}" without external-auth acknowledgement.\n`
    + '\n'
    + 'Public admin UI must be protected before traffic reaches AIWorker.\n'
    + '\n'
    + 'Fix one of these ways:\n'
    + '  1. Bind the service to 127.0.0.1 and put Caddy/Cloudflare Access/IP allowlist/basic-auth in front;\n'
    + '  2. Disable admin static serving with --no-serve-web;\n'
    + '  3. Confirm an external auth layer protects /admin/*, /ws, and /api/*, then set AIWORKER_ADMIN_EXTERNAL_AUTH=1.',
  )
}
