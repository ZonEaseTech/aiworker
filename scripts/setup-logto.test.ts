import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'bun:test'

const publicBaseUrl = 'https://20831--main--ben--ben.coder.tbc.5ok.co'
const publicHost = new URL(publicBaseUrl).host
const root = resolve(import.meta.dirname, '..')
const setupLogtoUrl = pathToFileURL(resolve(root, 'scripts/setup-logto.mjs')).href

interface SetupLogtoModule {
  logtoBaseUrl: (rootEnv: Map<string, string>, env?: Record<string, string | undefined>) => string
}

describe('setup-logto defaults', () => {
  test('registers the Coder HTTPS URL as the default Logto callback base', () => {
    const setupScript = readFileSync(resolve(root, 'scripts/setup-logto.mjs'), 'utf8')
    const envExample = readFileSync(resolve(root, '.env.example'), 'utf8')
    const rootReadme = readFileSync(resolve(root, 'README.md'), 'utf8')
    const viteConfig = readFileSync(resolve(root, 'apps/aiworker-web/vite.config.ts'), 'utf8')

    expect(setupScript).toContain(`const DEFAULT_BASE_URL = '${publicBaseUrl}'`)
    expect(setupScript).toContain('const LEGACY_DEFAULT_BASE_URL = \'http://127.0.0.1:20831\'')
    expect(setupScript).toContain('persisted && persisted !== LEGACY_DEFAULT_BASE_URL')
    expect(setupScript).toContain(['redirectUris: [`', '{baseUrl}/callback`]'].join('$'))
    expect(setupScript).not.toContain('const DEFAULT_BASE_URL = \'http://127.0.0.1:20831\'')
    expect(envExample).toContain(`LOGTO_BASE_URL=${publicBaseUrl}`)
    expect(rootReadme).toContain(`${publicBaseUrl}/callback`)
    expect(viteConfig).toContain(`allowedHosts: ['${publicHost}']`)
  })

  test('migrates only the legacy loopback default while preserving explicit choices', async () => {
    const { logtoBaseUrl } = await import(setupLogtoUrl) as SetupLogtoModule

    expect(logtoBaseUrl(new Map())).toBe(publicBaseUrl)
    expect(logtoBaseUrl(new Map([['LOGTO_BASE_URL', 'http://127.0.0.1:20831']]))).toBe(publicBaseUrl)
    expect(logtoBaseUrl(new Map([['LOGTO_BASE_URL', 'https://custom.example.com']]))).toBe('https://custom.example.com')
    expect(logtoBaseUrl(new Map([['LOGTO_BASE_URL', 'https://custom.example.com']]), {
      LOGTO_BASE_URL: 'https://explicit.example.com',
    })).toBe('https://explicit.example.com')
  })
})
