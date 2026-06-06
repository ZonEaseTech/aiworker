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

  it('uses explicit management endpoint and API indicator for token and API URLs', async () => {
    const explicitConfig = loadLogtoM2MConfigText([
      fakeEnvText,
      'LOGTO_MANAGEMENT_ENDPOINT=https://explicit-tenant.logto.app',
      'LOGTO_MANAGEMENT_API_INDICATOR=https://explicit-tenant.logto.app/api/',
    ].join('\n'))
    const calls: { body: string, method: string, url: string }[] = []
    const result = await ensureLogtoProofApplication({
      config: explicitConfig,
      fetch: async (input, init) => {
        const url = input.toString()
        calls.push({
          body: init?.body?.toString() ?? '',
          method: init?.method ?? 'GET',
          url,
        })
        if (url === 'https://explicit-tenant.logto.app/oidc/token')
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (url === 'https://explicit-tenant.logto.app/api/applications?page=1&page_size=100') {
          if (init?.method === 'GET')
            return Response.json(lookupPage([]))
        }
        if (url === 'https://explicit-tenant.logto.app/api/applications')
          return Response.json({ id: 'web-app-id', type: 'Traditional' })
        if (url === 'https://explicit-tenant.logto.app/api/applications/web-app-id/secrets')
          return Response.json([{ value: 'explicit-secret' }])

        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(explicitConfig).toMatchObject({
      managementApiIndicator: 'https://explicit-tenant.logto.app/api',
      managementEndpoint: 'https://explicit-tenant.logto.app/',
    })
    expect(result).toMatchObject({ clientSecret: 'explicit-secret' })
    expect(calls.map(call => call.url)).toEqual([
      'https://explicit-tenant.logto.app/oidc/token',
      'https://explicit-tenant.logto.app/api/applications?page=1&page_size=100',
      'https://explicit-tenant.logto.app/api/applications',
      'https://explicit-tenant.logto.app/api/applications/web-app-id/secrets',
    ])
    expect(new URLSearchParams(calls[0]?.body).get('resource')).toBe('https://explicit-tenant.logto.app/api')
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

  it('prefers secrets endpoint value over deprecated create response secret', async () => {
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

        if (url === 'https://zonease-test.logto.app/api/applications?page=1&page_size=100') {
          if (init?.method === 'GET')
            return Response.json(lookupPage([]))
        }
        if (url === 'https://zonease-test.logto.app/api/applications')
          return Response.json({ id: 'web-app-id', secret: 'deprecated-create-secret', type: 'Traditional' })

        if (url === 'https://zonease-test.logto.app/api/applications/web-app-id/secrets')
          return Response.json([{ value: 'secrets-endpoint-secret' }])

        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual({
      clientId: 'web-app-id',
      clientSecret: 'secrets-endpoint-secret',
      redirectUri: 'http://localhost:54145/auth/callback',
    })
    expect(redactLogtoProofApplication(result)).toEqual({
      clientId: 'web-app-id',
      clientSecret: '[REDACTED]',
      redirectUri: 'http://localhost:54145/auth/callback',
    })
    expect(JSON.stringify(redactLogtoProofApplication(result))).not.toContain('secrets-endpoint-secret')
    expect(JSON.stringify(redactLogtoProofApplication(result))).not.toContain('deprecated-create-secret')
    expect(JSON.stringify(redactLogtoProofApplication(result))).not.toContain('m2m-secret')
    expect(calls.map(call => call.url)).toContain('https://zonease-test.logto.app/api/applications/web-app-id/secrets')

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

  it('uses deprecated create response secret only when secrets endpoint has no value', async () => {
    const cases: [string, Response][] = [
      ['empty secrets', Response.json([])],
      ['failed secrets', new Response('secret-service-body', { status: 500 })],
    ]

    for (const [name, secretsResponse] of cases) {
      const calls: string[] = []
      const result = await ensureLogtoProofApplication({
        config: tenantConfig,
        fetch: async (input, init) => {
          const url = input.toString()
          calls.push(url)
          if (url.endsWith('/oidc/token'))
            return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
          if (isApplicationsPath(url) && init?.method === 'GET')
            return Response.json(lookupPage([]))
          if (isApplicationsPath(url) && init?.method === 'POST')
            return Response.json({ id: 'web-app-id', secret: 'deprecated-create-secret', type: 'Traditional' })
          if (url.endsWith('/api/applications/web-app-id/secrets'))
            return secretsResponse.clone()

          return new Response('not found', { status: 404 })
        },
        hostBrowserBaseUrl: 'http://localhost:54145',
      })

      expect(result, name).toEqual({
        clientId: 'web-app-id',
        clientSecret: 'deprecated-create-secret',
        redirectUri: 'http://localhost:54145/auth/callback',
      })
      expect(calls, name).toContain('https://zonease-test.logto.app/api/applications/web-app-id/secrets')
      expect(JSON.stringify(redactLogtoProofApplication(result)), name).not.toContain('deprecated-create-secret')
      expect(JSON.stringify(redactLogtoProofApplication(result)), name).not.toContain('secret-service-body')
    }
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

  it('follows official Logto Link header pagination before updating existing proof app', async () => {
    const calls: { method: string, url: string }[] = []
    const result = await ensureLogtoProofApplication({
      config: tenantConfig,
      fetch: async (input, init) => {
        const url = input.toString()
        const parsed = new URL(url)
        const method = init?.method ?? 'GET'
        calls.push({ method, url })
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (isApplicationsPath(url) && method === 'GET') {
          const page = parsed.searchParams.get('page')
          const pageSize = parsed.searchParams.get('page_size')
          if (page === '1' && pageSize === '100') {
            return officialApplicationsList(
              [{ id: 'other-app-id', name: 'Other App' }],
              {
                link: '<https://zonease-test.logto.app/api/applications?page=2&page_size=100>; rel="next"',
                totalNumber: 2,
              },
            )
          }
          if (page === '2' && pageSize === '100') {
            return officialApplicationsList(
              [{ id: 'web-app-id', name: 'AIWorker Local Auth Proof' }],
              { totalNumber: 2 },
            )
          }
        }
        if (url === 'https://zonease-test.logto.app/api/applications/web-app-id' && method === 'PATCH')
          return Response.json({ id: 'web-app-id' })
        if (url === 'https://zonease-test.logto.app/api/applications/web-app-id/secrets')
          return Response.json([{ value: 'existing-secret' }])
        if (isApplicationsPath(url) && method === 'POST')
          return Response.json({ id: 'duplicate-web-app-id', type: 'Traditional' })

        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual({
      clientId: 'web-app-id',
      clientSecret: 'existing-secret',
      redirectUri: 'http://localhost:54145/auth/callback',
    })
    expect(calls).toContainEqual({
      method: 'GET',
      url: 'https://zonease-test.logto.app/api/applications?page=1&page_size=100',
    })
    expect(calls).toContainEqual({
      method: 'GET',
      url: 'https://zonease-test.logto.app/api/applications?page=2&page_size=100',
    })
    expect(calls).toContainEqual({
      method: 'PATCH',
      url: 'https://zonease-test.logto.app/api/applications/web-app-id',
    })
    expect(calls.some(call => call.method === 'POST' && call.url.includes('/api/applications'))).toBe(false)
  })

  it('creates proof app when official Logto list headers show the first page is exhausted', async () => {
    const calls: { method: string, url: string }[] = []
    const result = await ensureLogtoProofApplication({
      config: tenantConfig,
      fetch: async (input, init) => {
        const url = input.toString()
        const method = init?.method ?? 'GET'
        calls.push({ method, url })
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (isApplicationsPath(url) && method === 'GET')
          return officialApplicationsList([{ id: 'other-app-id', name: 'Other App' }], { totalNumber: 1 })
        if (isApplicationsPath(url) && method === 'POST')
          return Response.json({ id: 'web-app-id', type: 'Traditional' })
        if (url === 'https://zonease-test.logto.app/api/applications/web-app-id/secrets')
          return Response.json([{ value: 'created-secret' }])

        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual({
      clientId: 'web-app-id',
      clientSecret: 'created-secret',
      redirectUri: 'http://localhost:54145/auth/callback',
    })
    expect(calls).toContainEqual({
      method: 'GET',
      url: 'https://zonease-test.logto.app/api/applications?page=1&page_size=100',
    })
    expect(calls).toContainEqual({
      method: 'POST',
      url: 'https://zonease-test.logto.app/api/applications',
    })
  })

  it('fails closed for official array body when pagination metadata is missing', async () => {
    let createCalls = 0
    const result = await ensureLogtoProofApplication({
      config: tenantConfig,
      fetch: async (input, init) => {
        const url = input.toString()
        const method = init?.method ?? 'GET'
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (isApplicationsPath(url) && method === 'GET')
          return Response.json([{ id: 'other-app-id', name: 'Other App' }])
        if (isApplicationsPath(url) && method === 'POST') {
          createCalls += 1
          return Response.json({ id: 'duplicate-web-app-id', type: 'Traditional' })
        }

        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual(manualFallback('lookup', 'invalid_response', 'invalid_lookup_response'))
    expect(createCalls).toBe(0)
    expect(JSON.stringify(result)).not.toContain('management-token')
    expect(JSON.stringify(result)).not.toContain('duplicate-web-app-id')
  })

  it('scans paginated lookup before updating existing proof app', async () => {
    const calls: { method: string, url: string }[] = []
    const result = await ensureLogtoProofApplication({
      config: tenantConfig,
      fetch: async (input, init) => {
        const url = input.toString()
        const parsed = new URL(url)
        const method = init?.method ?? 'GET'
        calls.push({ method, url })
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (parsed.pathname === '/api/applications' && method === 'GET') {
          const page = parsed.searchParams.get('page') ?? '1'
          if (page === '1') {
            return Response.json({
              data: [{ id: 'other-app-id', name: 'Other App' }],
              page: 1,
              page_size: 1,
              total: 2,
            })
          }
          if (page === '2') {
            return Response.json({
              data: [{ id: 'web-app-id', name: 'AIWorker Local Auth Proof' }],
              page: 2,
              page_size: 1,
              total: 2,
            })
          }
        }
        if (url === 'https://zonease-test.logto.app/api/applications/web-app-id' && method === 'PATCH')
          return Response.json({ id: 'web-app-id' })
        if (url === 'https://zonease-test.logto.app/api/applications/web-app-id/secrets')
          return Response.json([{ value: 'existing-secret' }])
        if (parsed.pathname === '/api/applications' && method === 'POST')
          return Response.json({ id: 'duplicate-web-app-id', type: 'Traditional' })

        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual({
      clientId: 'web-app-id',
      clientSecret: 'existing-secret',
      redirectUri: 'http://localhost:54145/auth/callback',
    })
    expect(calls).toContainEqual({
      method: 'GET',
      url: 'https://zonease-test.logto.app/api/applications?page=2&page_size=100',
    })
    expect(calls).toContainEqual({
      method: 'PATCH',
      url: 'https://zonease-test.logto.app/api/applications/web-app-id',
    })
    expect(calls.some(call => call.method === 'POST' && call.url.includes('/api/applications'))).toBe(false)
  })

  it('updates an existing proof app from lookup before reading secrets', async () => {
    const calls: { method: string, url: string }[] = []
    const result = await ensureLogtoProofApplication({
      config: tenantConfig,
      fetch: async (input, init) => {
        const url = input.toString()
        const method = init?.method ?? 'GET'
        calls.push({ method, url })
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (url === 'https://zonease-test.logto.app/api/applications?page=1&page_size=100' && method === 'GET') {
          return Response.json({
            data: [{ id: 'web-app-id', name: 'AIWorker Local Auth Proof' }],
            page: 1,
            pageSize: 20,
            totalCount: 1,
          })
        }
        if (url === 'https://zonease-test.logto.app/api/applications/web-app-id' && method === 'PATCH')
          return Response.json({ id: 'web-app-id' })
        if (url === 'https://zonease-test.logto.app/api/applications/web-app-id/secrets')
          return Response.json([{ value: 'existing-secret' }])

        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual({
      clientId: 'web-app-id',
      clientSecret: 'existing-secret',
      redirectUri: 'http://localhost:54145/auth/callback',
    })
    expect(calls).toContainEqual({
      method: 'PATCH',
      url: 'https://zonease-test.logto.app/api/applications/web-app-id',
    })
    expect(calls).toContainEqual({
      method: 'GET',
      url: 'https://zonease-test.logto.app/api/applications/web-app-id/secrets',
    })
    expect(calls.some(call => call.method === 'POST' && call.url.includes('/api/applications'))).toBe(false)
  })

  it('fails closed on malformed lookup response without creating duplicate app', async () => {
    const cases: [string, unknown][] = [
      ['null lookup', null],
      ['malformed object lookup', { unexpected: true }],
      ['bare array lookup', []],
      ['invalid array element lookup', [{ id: 42, name: 'AIWorker Local Auth Proof' }]],
    ]

    for (const [name, lookupBody] of cases) {
      let createCalls = 0
      const result = await ensureLogtoProofApplication({
        config: tenantConfig,
        fetch: async (input, init) => {
          const url = input.toString()
          if (url.endsWith('/oidc/token'))
            return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
          if (isApplicationsPath(url) && init?.method === 'GET')
            return Response.json(lookupBody)
          if (isApplicationsPath(url) && init?.method === 'POST') {
            createCalls += 1
            return Response.json({ id: 'duplicate-web-app-id', type: 'Traditional' })
          }

          return new Response('not found', { status: 404 })
        },
        hostBrowserBaseUrl: 'http://localhost:54145',
      })

      expect(result, name).toEqual(manualFallback('lookup', 'invalid_response', 'invalid_lookup_response'))
      expect(createCalls, name).toBe(0)
      expect(JSON.stringify(result), name).not.toContain('management-token')
      expect(JSON.stringify(result), name).not.toContain('duplicate-web-app-id')
    }
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
        if (isApplicationsPath(url) && init?.method === 'GET')
          return Response.json(lookupPage([]))
        return new Response('server-response-secret', { status: 500 })
      }],
      ['update 500', 'update', async (input, init) => {
        const url = input.toString()
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (isApplicationsPath(url) && init?.method === 'GET')
          return Response.json(lookupPage([{ id: 'web-app-id', name: 'AIWorker Local Auth Proof' }]))
        return new Response('server-response-secret', { status: 500 })
      }],
      ['secret-read 500', 'secret-read', async (input, init) => {
        const url = input.toString()
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (isApplicationsPath(url) && init?.method === 'GET')
          return Response.json(lookupPage([]))
        if (isApplicationsPath(url) && init?.method === 'POST')
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

  it('returns safe manual fallback when token endpoint responds with JSON null', async () => {
    const result = await ensureLogtoProofApplication({
      config: tenantConfig,
      fetch: async input => input.toString().endsWith('/oidc/token')
        ? Response.json(null)
        : new Response('unexpected', { status: 500 }),
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual(manualFallback('token', 'invalid_response', 'invalid_management_api_response'))
    expect(JSON.stringify(result)).not.toContain('m2m-secret')
    expect(JSON.stringify(result)).not.toContain('management-token')
  })

  it('uses deprecated create response secret when secrets endpoint only returns empty value', async () => {
    const result = await ensureLogtoProofApplication({
      config: tenantConfig,
      fetch: async (input, init) => {
        const url = input.toString()
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (isApplicationsPath(url) && init?.method === 'GET')
          return Response.json(lookupPage([]))
        if (isApplicationsPath(url) && init?.method === 'POST')
          return Response.json({ id: 'web-app-id', secret: 'deprecated-create-secret', type: 'Traditional' })
        if (url.endsWith('/api/applications/web-app-id/secrets'))
          return Response.json([{ value: '   ' }])

        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual({
      clientId: 'web-app-id',
      clientSecret: 'deprecated-create-secret',
      redirectUri: 'http://localhost:54145/auth/callback',
    })
    expect(JSON.stringify(redactLogtoProofApplication(result))).not.toContain('deprecated-create-secret')
  })

  it('returns manual fallback when secrets endpoint value is empty and no create fallback exists', async () => {
    const result = await ensureLogtoProofApplication({
      config: tenantConfig,
      fetch: async (input, init) => {
        const url = input.toString()
        if (url.endsWith('/oidc/token'))
          return Response.json({ access_token: 'management-token', token_type: 'Bearer' })
        if (isApplicationsPath(url) && init?.method === 'GET')
          return Response.json(lookupPage([]))
        if (isApplicationsPath(url) && init?.method === 'POST')
          return Response.json({ id: 'web-app-id', type: 'Traditional' })
        if (url.endsWith('/api/applications/web-app-id/secrets'))
          return Response.json([{ value: '' }])

        return new Response('not found', { status: 404 })
      },
      hostBrowserBaseUrl: 'http://localhost:54145',
    })

    expect(result).toEqual(manualFallback('secret-read', 'invalid_response', 'missing_application_secret'))
    expect(JSON.stringify(result)).not.toContain('m2m-secret')
    expect(JSON.stringify(result)).not.toContain('web-app-id')
  })

  function officialApplicationsList(
    data: unknown[],
    input: { link?: string, totalNumber?: number } = {},
  ) {
    const headers = new Headers()
    if (input.link)
      headers.set('Link', input.link)
    if (typeof input.totalNumber === 'number')
      headers.set('Total-Number', String(input.totalNumber))

    return Response.json(data, { headers })
  }

  function isApplicationsPath(url: string) {
    return new URL(url).pathname === '/api/applications'
  }

  function lookupPage(
    data: unknown[],
    input: { page?: number, pageSize?: number, total?: number } = {},
  ) {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    return {
      data,
      page,
      page_size: pageSize,
      total: input.total ?? data.length,
    }
  }

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
