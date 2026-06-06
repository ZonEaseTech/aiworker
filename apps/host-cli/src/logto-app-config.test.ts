import { describe, expect, it } from 'bun:test'

import {
  ensureLogtoProofApplication,
  loadLogtoM2MConfigText,
  redactLogtoConfigForOutput,
} from './logto-app-config'

describe('logto proof app config', () => {
  it('loads M2M config without exposing secrets in redacted output', () => {
    const config = loadLogtoM2MConfigText([
      'LOGTO_M2M_APP_ID=m2m-id',
      'LOGTO_M2M_APP_SECRET=m2m-secret',
      'LOGTO_ISSUER=https://auth.zonease.org/oidc',
      'LOGTO_ENDPOINT=https://auth.zonease.org/',
    ].join('\n'))

    expect(config).toEqual({
      endpoint: 'https://auth.zonease.org/',
      issuer: 'https://auth.zonease.org/oidc',
      m2mAppId: 'm2m-id',
      m2mAppSecret: 'm2m-secret',
    })
    expect(redactLogtoConfigForOutput(config)).toEqual({
      endpoint: 'https://auth.zonease.org/',
      issuer: 'https://auth.zonease.org/oidc',
      m2mAppId: 'm2m-id',
      m2mAppSecret: '[REDACTED]',
    })
  })

  it('creates a Traditional app and retrieves its secret when no proof app exists', async () => {
    const calls: { body: string, url: string }[] = []
    const result = await ensureLogtoProofApplication({
      config: {
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
        m2mAppId: 'm2m-id',
        m2mAppSecret: 'm2m-secret',
      },
      fetch: async (input, init) => {
        const url = input.toString()
        calls.push({ body: init?.body?.toString() ?? '', url })
        if (url === 'https://auth.zonease.org/oidc/token')
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })

        if (url === 'https://auth.zonease.org/api/applications') {
          if (init?.method === 'GET')
            return Response.json([])

          return Response.json({ id: 'web-app-id', type: 'Traditional' })
        }

        if (url === 'https://auth.zonease.org/api/applications/web-app-id/secrets')
          return Response.json([{ value: 'web-secret' }])

        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual({
      clientId: 'web-app-id',
      clientSecret: 'web-secret',
      redirectUri: 'http://localhost:54145/auth/callback',
    })
    expect(JSON.stringify(calls)).not.toContain('web-secret')
  })

  it('returns a manual configuration requirement when Management API is forbidden', async () => {
    const result = await ensureLogtoProofApplication({
      config: {
        endpoint: 'https://auth.zonease.org/',
        issuer: 'https://auth.zonease.org/oidc',
        m2mAppId: 'm2m-id',
        m2mAppSecret: 'm2m-secret',
      },
      fetch: async input => input.toString().endsWith('/oidc/token')
        ? Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        : new Response('forbidden', { status: 403 }),
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual({
      manualConfiguration: {
        applicationType: 'Traditional',
        issuer: 'https://auth.zonease.org/oidc',
        postLogoutRedirectUri: 'http://localhost:54145/host',
        redirectUri: 'http://localhost:54145/auth/callback',
      },
    })
  })
})
