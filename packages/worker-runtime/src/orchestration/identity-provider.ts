import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

export type WorkerApiAuthProviderKind = 'local-bearer' | 'logto'
export type WorkerApiAuthMethod = 'local-bearer' | 'logto'

export interface WorkerApiIdentityGrant {
  action: string
  kind: string
  target: string
}

export interface WorkerApiIdentity {
  authMethod: WorkerApiAuthMethod
  grants: readonly WorkerApiIdentityGrant[]
  operatorId: string
  providerId: string
  subject: string
}

export interface WorkerApiAuthInput {
  authorization?: string | null
}

export type WorkerApiAuthResult
  = | { identity: WorkerApiIdentity, status: 'authenticated' }
    | { status: 'anonymous' }
    | { reason: string, status: 'denied' }

export interface WorkerApiAuthProvider {
  authenticate: (input: WorkerApiAuthInput) => WorkerApiAuthResult
  id: string
  kind: WorkerApiAuthProviderKind
}

export interface LocalBearerAuthProviderOptions {
  operatorId?: string
  token?: string | null
}

export function createLocalBearerAuthProvider(options: LocalBearerAuthProviderOptions = {}): WorkerApiAuthProvider {
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
            { action: 'access', kind: 'host', target: 'api/broker' },
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
