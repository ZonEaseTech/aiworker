import { describe, expect, it } from 'bun:test'

import {
  ensureLogtoProofApplication,
  loadLogtoM2MConfigFile,
  loadLogtoM2MConfigText,
  redactLogtoConfigForOutput,
  redactLogtoProofApplication,
} from './logto-app-config'
import type { ManualLogtoConfiguration } from './logto-app-config'

type LogtoFetch = NonNullable<Parameters<typeof ensureLogtoProofApplication>[0]['fetch']>
type ManualConfiguration = ManualLogtoConfiguration['manualConfiguration']

describe('logto proof app config', () => {
  const fakeEnvText = [
    'LOGTO_M2M_APP_ID=m2m-id',
    'LOGTO_M2M_APP_SECRET=m2m-secret',
    'LOGTO_ISSUER=https://auth.zonease.org/oidc',
    'LOGTO_ENDPOINT=https://auth.zonease.org/',
  ].join('\n')
  const tenantEnvText = [
    fakeEnvText,
    'LOGTO_TENANT_ID=zonease-test',
  ].join('\n')
  const baseConfig = {
    endpoint: 'https://auth.zonease.org/',
    issuer: 'https://auth.zonease.org/oidc',
    m2mAppId: 'm2m-id',
    m2mAppSecret: 'm2m-secret',
  }
  const tenantConfig = {
    ...baseConfig,
    managementApiIndicator: 'https://zonease-test.logto.app/api',
    managementEndpoint: 'https://zonease-test.logto.app/',
    tenantId: 'zonease-test',
  }

  it('loads M2M config without exposing secrets in redacted output', () => {
    const config = loadLogtoM2MConfigText(fakeEnvText)

    expect(config).toEqual(baseConfig)
    expect(redactLogtoConfigForOutput(config)).toEqual({
      ...baseConfig,
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

  it('derives Logto Cloud management endpoint and API indicator from tenant id', () => {
    const config = loadLogtoM2MConfigText(tenantEnvText)

    expect(config).toEqual(tenantConfig)
    expect(redactLogtoConfigForOutput(config)).toEqual({
      ...tenantConfig,
      m2mAppSecret: '[REDACTED]',
    })
  })

  it('does not call Management API through a custom login endpoint without management config', async () => {
    let fetchCalls = 0
    const result = await ensureLogtoProofApplication({
      config: baseConfig,
      fetch: async () => {
        fetchCalls += 1
        return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(fetchCalls).toBe(0)
    expect(result).toEqual(manualFallback('configuration', 'not_configured', 'missing_management_api_config'))
    expect(JSON.stringify(result)).not.toContain('m2m-secret')
  })

  it('creates a Traditional app through the default tenant endpoint and uses create response secret', async () => {
    const calls: { body: string, hasAuthorization: boolean, method: string, url: string }[] = []
    const result = await ensureLogtoProofApplication({
      config: tenantConfig,
      fetch: async (input, init) => {
        const url = input.toString()
        const headers = new Headers(init?.headers)
        calls.push({
          body: init?.body?.toString() ?? '',
          hasAuthorization: headers.has('authorization'),
          method: init?.method ?? 'GET',
          url,
        })
        if (url === 'https://zonease-test.logto.app/oidc/token')
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })

        if (url === 'https://zonease-test.logto.app/api/applications') {
          if (init?.method === 'GET')
            return Response.json([])

          return Response.json({ id: 'web-app-id', secret: 'web-secret', type: 'Traditional' })
        }

        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual({
      clientId: 'web-app-id',
      clientSecret: 'web-secret',
      redirectUri: 'http://localhost:54145/auth/callback',
    })
    expect(redactLogtoProofApplication(result)).toEqual({
      clientId: 'web-app-id',
      clientSecret: '[REDACTED]',
      redirectUri: 'http://localhost:54145/auth/callback',
    })
    expect(JSON.stringify(redactLogtoProofApplication(result))).not.toContain('web-secret')
    expect(JSON.stringify(redactLogtoProofApplication(result))).not.toContain('m2m-secret')
    expect(calls.map(call => call.url)).not.toContain('https://zonease-test.logto.app/api/applications/web-app-id/secrets')

    const tokenCall = calls.find(call => call.url === 'https://zonease-test.logto.app/oidc/token')
    expect(tokenCall).toMatchObject({
      hasAuthorization: true,
      method: 'POST',
    })
    const tokenBody = new URLSearchParams(tokenCall?.body)
    expect(tokenBody.get('grant_type')).toBe('client_credentials')
    expect(tokenBody.get('resource')).toBe('https://zonease-test.logto.app/api')
    expect(tokenBody.get('scope')).toBe('all')
    expect(JSON.stringify(calls)).not.toContain('m2m-secret')

    const createCall = calls.find(call =>
      call.url === 'https://zonease-test.logto.app/api/applications' && call.method === 'POST'
    )
    expect(JSON.parse(createCall?.body ?? '{}')).toMatchObject({
      oidcClientMetadata: {
        postLogoutRedirectUris: ['http://localhost:54145/host'],
        redirectUris: ['http://localhost:54145/auth/callback'],
      },
      type: 'Traditional',
    })
  })

  it('returns a manual configuration requirement when Management API is forbidden', async () => {
    const result = await ensureLogtoProofApplication({
      config: tenantConfig,
      fetch: async input => input.toString().endsWith('/oidc/token')
        ? Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        : new Response('forbidden', { status: 403 }),
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual(manualFallback('lookup', 403, 'management_api_request_failed'))
  })

  it('returns manual configuration for Management API failures without exposing secrets', async () => {
    const cases: [string, ManualConfiguration['stage'], LogtoFetch][] = [
      ['token 500', 'token', async input => input.toString().endsWith('/oidc/token')
        ? new Response('server-response-secret', { status: 500 })
        : new Response('unexpected', { status: 500 })],
      ['lookup 500', 'lookup', async input => input.toString().endsWith('/oidc/token')
        ? Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        : new Response('server-response-secret', { status: 500 })],
      ['create 500', 'create', async (input, init) => {
        const url = input.toString()
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (url.endsWith('/api/applications') && init?.method === 'GET')
          return Response.json([])
        return new Response('server-response-secret', { status: 500 })
      }],
      ['update 500', 'update', async (input, init) => {
        const url = input.toString()
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (url.endsWith('/api/applications') && init?.method === 'GET')
          return Response.json([{ id: 'web-app-id', name: 'AIWorker Local Auth Proof' }])
        return new Response('server-response-secret', { status: 500 })
      }],
      ['secret-read 500', 'secret-read', async (input, init) => {
        const url = input.toString()
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (url.endsWith('/api/applications') && init?.method === 'GET')
          return Response.json([])
        if (url.endsWith('/api/applications') && init?.method === 'POST')
          return Response.json({ id: 'web-app-id', type: 'Traditional' })
        return new Response('server-response-secret', { status: 500 })
      }],
    ]

    for (const [name, stage, fetch] of cases) {
      const result = await ensureLogtoProofApplication({
        config: tenantConfig,
        fetch,
        hostBrowserBaseUrl: 'http://localhost:54145',
      })

      expect(result, name).toEqual(manualFallback(stage, 500, 'management_api_request_failed'))
      expect(JSON.stringify(result), name).not.toContain('m2m-secret')
      expect(JSON.stringify(result), name).not.toContain('web-secret')
      expect(JSON.stringify(result), name).not.toContain('management-token')
      expect(JSON.stringify(result), name).not.toContain('server-response-secret')
    }
  })

  function manualFallback(
    stage: ManualConfiguration['stage'],
    status: ManualConfiguration['status'],
    reason: string,
  ): ManualLogtoConfiguration {
    return {
      manualConfiguration: {
        appName: 'AIWorker Local Auth Proof',
        applicationType: 'Traditional',
        issuer: 'https://auth.zonease.org/oidc',
        postLogoutRedirectUri: 'http://localhost:54145/host',
        reason,
        redirectUri: 'http://localhost:54145/auth/callback',
        stage,
        status,
      },
    }
  }
})
