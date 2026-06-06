import { describe, expect, it } from 'bun:test'

import {
  loadLogtoM2MConfigFile,
  ensureLogtoProofApplication,
  loadLogtoM2MConfigText,
  redactLogtoConfigForOutput,
} from './logto-app-config'

describe('logto proof app config', () => {
  const fakeEnvText = [
    'LOGTO_M2M_APP_ID=m2m-id',
    'LOGTO_M2M_APP_SECRET=m2m-secret',
    'LOGTO_ISSUER=https://auth.zonease.org/oidc',
    'LOGTO_ENDPOINT=https://auth.zonease.org/',
  ].join('\n')

  it('loads M2M config without exposing secrets in redacted output', () => {
    const config = loadLogtoM2MConfigText(fakeEnvText)

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

  it('loads M2M config through an injectable tmp/.logto reader', async () => {
    const readPaths: string[] = []
    const defaultConfig = await loadLogtoM2MConfigFile({
      readText: async path => {
        readPaths.push(path)
        return fakeEnvText
      },
    })
    const explicitConfig = await loadLogtoM2MConfigFile({
      configPath: 'fake/tmp/.logto',
      readText: async path => {
        readPaths.push(path)
        return fakeEnvText
      },
    })

    expect(readPaths).toEqual(['tmp/.logto', 'fake/tmp/.logto'])
    expect(defaultConfig).toEqual(explicitConfig)
    expect(JSON.stringify(redactLogtoConfigForOutput(defaultConfig))).not.toContain('m2m-secret')
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

  it('returns manual configuration for Management API failures without exposing secrets', async () => {
    const cases: [string, Parameters<typeof ensureLogtoProofApplication>[0]['fetch']][] = [
      ['token 500', async input => input.toString().endsWith('/oidc/token')
        ? new Response('failed', { status: 500 })
        : new Response('unexpected', { status: 500 })],
      ['lookup 500', async input => input.toString().endsWith('/oidc/token')
        ? Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        : new Response('failed', { status: 500 })],
      ['create 500', async (input, init) => {
        const url = input.toString()
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (url.endsWith('/api/applications') && init?.method === 'GET')
          return Response.json([])
        return new Response('failed', { status: 500 })
      }],
      ['update 500', async (input, init) => {
        const url = input.toString()
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (url.endsWith('/api/applications') && init?.method === 'GET')
          return Response.json([{ id: 'web-app-id', name: 'AIWorker Local Auth Proof' }])
        return new Response('failed', { status: 500 })
      }],
      ['secret-read 500', async (input, init) => {
        const url = input.toString()
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (url.endsWith('/api/applications') && init?.method === 'GET')
          return Response.json([])
        if (url.endsWith('/api/applications') && init?.method === 'POST')
          return Response.json({ id: 'web-app-id', type: 'Traditional' })
        return new Response('failed', { status: 500 })
      }],
    ]

    for (const [name, fetch] of cases) {
      const result = await ensureLogtoProofApplication({
        config: {
          endpoint: 'https://auth.zonease.org/',
          issuer: 'https://auth.zonease.org/oidc',
          m2mAppId: 'm2m-id',
          m2mAppSecret: 'm2m-secret',
        },
        fetch,
        hostBrowserBaseUrl: 'http://localhost:54145',
      })

      expect(result, name).toEqual({
        manualConfiguration: {
          applicationType: 'Traditional',
          issuer: 'https://auth.zonease.org/oidc',
          postLogoutRedirectUri: 'http://localhost:54145/host',
          redirectUri: 'http://localhost:54145/auth/callback',
        },
      })
      expect(JSON.stringify(result), name).not.toContain('m2m-secret')
      expect(JSON.stringify(result), name).not.toContain('web-secret')
    }
  })
})
