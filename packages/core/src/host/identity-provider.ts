import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

export type HostAuthProviderKind = 'local-bearer' | 'logto'
export type HostAuthMethod = 'local-bearer' | 'logto'

export interface HostIdentityGrant {
  action: string
  kind: string
  target: string
}

export interface HostIdentity {
  authMethod: HostAuthMethod
  grants: readonly HostIdentityGrant[]
  operatorId: string
  providerId: string
  subject: string
}

export interface HostAuthInput {
  authorization?: string | null
}

export type HostAuthResult
  = | { identity: HostIdentity, status: 'authenticated' }
    | { status: 'anonymous' }
    | { reason: string, status: 'denied' }

export interface HostAuthProvider {
  authenticate: (input: HostAuthInput) => HostAuthResult
  id: string
  kind: HostAuthProviderKind
}

export interface LocalBearerAuthProviderOptions {
  operatorId?: string
  token?: string | null
}

export function createLocalBearerAuthProvider(options: LocalBearerAuthProviderOptions = {}): HostAuthProvider {
  const token = options.token ?? null
  const operatorId = options.operatorId ?? 'operator-local'
  return {
    authenticate(input) {
      if (!token)
        return { status: 'anonymous' }
      const expected = `Bearer ${token}`
      if (!timingSafeEqualText(input.authorization ?? '', expected))
        return { reason: 'Missing or invalid local bearer token.', status: 'denied' }
      return {
        identity: {
          authMethod: 'local-bearer',
          grants: [
            { action: 'access', kind: 'host', target: 'api/local' },
          ],
          operatorId,
          providerId: 'local-bearer',
          subject: `local:${operatorId}`,
        },
        status: 'authenticated',
      }
    },
    id: 'local-bearer',
    kind: 'local-bearer',
  }
}

function timingSafeEqualText(actual: string, expected: string): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
