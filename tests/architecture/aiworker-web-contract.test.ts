import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const appRoot = 'apps/aiworker-web'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

function readJson<T>(path: string): T {
  return JSON.parse(read(path)) as T
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    const stat = statSync(path)

    if (stat.isDirectory())
      return entry === 'dist' || entry === 'node_modules' ? [] : sourceFiles(path)

    if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(path))
      return []

    return /\.(?:ts|tsx|css|json|html|md)$/.test(path) ? [path] : []
  })
}

describe('AIWorker Web admin surface contract', () => {
  test('package is private Vite + React SPA with Bun release server, not Next.js', () => {
    const pkg = readJson<{
      private?: boolean
      scripts: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }>(`${appRoot}/package.json`)
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }

    expect(pkg.private).toBe(true)
    expect(deps.next).toBeUndefined()
    expect(deps.vite).toBeDefined()
    expect(deps.react).toBeDefined()
    expect(deps['react-router']).toBeDefined()
    expect(pkg.scripts['build:server']).toContain('bun build --compile')
    expect(pkg.scripts['build:release']).toContain('build:server')
  })

  test('shadcn config follows aiworker-next radix-mira baseline while staying app-local', () => {
    const components = readJson<{
      style: string
      rsc: boolean
      tailwind: { css: string, baseColor: string, cssVariables: boolean }
      iconLibrary: string
      menuColor: string
      menuAccent: string
      aliases: Record<string, string>
    }>(`${appRoot}/components.json`)

    expect(components.style).toBe('radix-mira')
    expect(components.rsc).toBe(false)
    expect(components.tailwind.css).toBe('src/index.css')
    expect(components.tailwind.baseColor).toBe('zinc')
    expect(components.tailwind.cssVariables).toBe(true)
    expect(components.iconLibrary).toBe('phosphor')
    expect(components.menuColor).toBe('inverted')
    expect(components.menuAccent).toBe('bold')
    expect(components.aliases.ui).toBe('@/components/ui')
    expect(components.aliases.utils).toBe('@/lib/utils')
  })

  test('theme tokens match aiworker-next shadcn token decisions', () => {
    const css = read(`${appRoot}/src/index.css`)
    const requiredTokens = [
      '@import "shadcn/tailwind.css"',
      '@import "@fontsource-variable/jetbrains-mono"',
      '"Noto Sans Mono CJK SC"',
      '"PingFang SC"',
      '"Microsoft YaHei"',
      '--primary: oklch(0.491 0.27 292.581)',
      '--ring: oklch(0.58 0.015 286.067)',
      '--sidebar-ring: oklch(0.58 0.015 286.067)',
      '--radius: 0.625rem',
      '--success-soft: oklch(0.95 0.04 150)',
      '--success-text: oklch(0.52 0.15 150)',
      '--warning-soft: oklch(0.96 0.05 75)',
      '--warning-text: oklch(0.54 0.13 75)',
      '--info-soft: oklch(0.95 0.04 250)',
      '@apply font-mono',
    ]

    for (const token of requiredTokens)
      expect(css).toContain(token)
  })

  test('custom status badges reuse the aiworker-next semantic variants', () => {
    const badge = read(`${appRoot}/src/components/ui/badge.tsx`)

    expect(badge).toMatch(/success:\s+['"]border-transparent bg-success-soft text-success-text['"]/)
    expect(badge).toMatch(/warning:\s+['"]border-transparent bg-warning-soft text-warning-text['"]/)
    expect(badge).toMatch(/info:\s+['"]border-transparent bg-info-soft text-info['"]/)
  })

  test('admin UI stays inside the thin Paseo distribution boundary', () => {
    const combined = sourceFiles(appRoot)
      .map(path => `${path}\n${read(path)}`)
      .join('\n---\n')

    for (const forbidden of [
      '@zonease/aiworker-ui',
      'packages/ui',
      'apps/worker-web',
      'worker-daemon',
      'engine-bridge',
      'engine-projection',
      'POST /api/sessions/:sessionId/invocations',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'sk-',
      'next/',
    ]) {
      expect(combined).not.toContain(forbidden)
    }

    expect(combined).toContain('secret://providers/codex/default')
    expect(combined).toContain('No runtime proxy')
    expect(combined).toContain('AIWorker 不读取 session')
  })

  test('admin data enters the UI through a redacted data source boundary', () => {
    const data = read(`${appRoot}/src/lib/admin-data.ts`)
    const app = read(`${appRoot}/src/App.tsx`)
    const assignmentsPage = read(`${appRoot}/src/pages/assignments-page.tsx`)

    expect(data).toContain('export interface AdminDataSource')
    expect(data).toContain('export interface AdminConsoleData')
    expect(data).toMatch(/export type SecretReference = `secret:\/\/\$\{string\}`/)
    expect(data).toContain('export const fixtureAdminDataSource')
    expect(data).toContain('export function assertRedactedAdminConsoleData')
    expect(data).toContain('export function loadAdminConsoleData')
    expect(data).toContain('return assertRedactedAdminConsoleData(source.loadAdminConsoleData())')
    expect(app).not.toContain('adminConsoleData')
    expect(assignmentsPage).toContain('adminConsoleData')
    expect(app).not.toMatch(/import\s+\{[^}]*\bassignments\b[^}]*\}\s+from ['"]@\/lib\/admin-data['"]/)
  })

  test('route shell stays thin and page modules own screen composition', () => {
    const app = read(`${appRoot}/src/App.tsx`)

    expect(app.split('\n').length).toBeLessThanOrEqual(50)
    for (const page of [
      'assignments-page',
      'audit-page',
      'dashboard-page',
      'environments-page',
      'provisioning-page',
      'souls-page',
    ]) {
      expect(read(`${appRoot}/src/pages/${page}.tsx`)).toContain('export function')
      expect(app).toContain(`@/pages/${page}`)
    }
  })
})
