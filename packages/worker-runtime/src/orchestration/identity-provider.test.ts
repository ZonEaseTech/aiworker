import { describe, expect, it } from 'bun:test'

import { createLocalBearerAuthProvider } from './identity-provider'

describe('Host identity provider', () => {
  it('authenticates local bearer requests into stable operator identity', () => {
    const provider = createLocalBearerAuthProvider({ token: 'local-token-123456' })

    expect(provider.authenticate({ authorization: 'Bearer local-token-123456' })).toMatchObject({
      identity: {
        authMethod: 'local-bearer',
        grants: [
          { action: 'access', kind: 'host', target: 'api/broker' },
        ],
        operatorId: 'operator-local',
        providerId: 'local-bearer',
        subject: 'local:operator-local',
      },
      status: 'authenticated',
    })
  })

  it('denies invalid bearer requests with constant contract shape', () => {
    const provider = createLocalBearerAuthProvider({ token: 'local-token-123456' })

    expect(provider.authenticate({ authorization: '' })).toMatchObject({
      reason: 'Missing or invalid local bearer token.',
      status: 'denied',
    })
    expect(provider.authenticate({ authorization: 'Bearer wrong-token' })).toMatchObject({
      reason: 'Missing or invalid local bearer token.',
      status: 'denied',
    })
  })

  it('keeps local daemon open when no token is configured', () => {
    const provider = createLocalBearerAuthProvider()

    expect(provider.authenticate({ authorization: null })).toEqual({ status: 'anonymous' })
  })
})
