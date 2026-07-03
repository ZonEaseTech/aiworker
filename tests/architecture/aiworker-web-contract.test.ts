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
    expect(pkg.scripts['build:server']).toContain('bun build --target=bun')
    expect(pkg.scripts['build:server']).toContain('dist-server/server.js')
    expect(pkg.scripts['build:server']).not.toContain('--compile')
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
    const browserSource = sourceFiles(`${appRoot}/src`)
      .filter(path => !path.endsWith('/admin-api.ts') && !path.endsWith('/server.ts') && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
      .map(path => read(path))
      .join('\n')

    expect(data).toContain('export interface AdminDataSource')
    expect(data).toContain('export interface AdminConsoleData')
    expect(data).toMatch(/export type SecretReference = `secret:\/\/\$\{string\}`/)
    expect(data).toContain('@zonease/aiworker-control/control-plane')
    expect(data).not.toContain('LocalFileControlPlaneStore')
    expect(browserSource).not.toMatch(/from ['"]@zonease\/aiworker-control['"]/)
    expect(browserSource).not.toMatch(/import\(['"]@zonease\/aiworker-control['"]\)/)
    expect(data).toContain('export function mapControlPlaneSnapshotToAdminConsoleData')
    expect(data).toContain('export function createAdminDataSourceFromControlPlaneSnapshot')
    expect(data).toContain('export const fixtureAdminDataSource')
    expect(data).toContain('export function assertRedactedAdminConsoleData')
    expect(data).toContain('export function loadAdminConsoleData')
    expect(data).toContain('return assertRedactedAdminConsoleData(source.loadAdminConsoleData())')
    expect(data).not.toContain('saveAdminConsoleData')
    expect(data).not.toContain('appendReceipt(')
    expect(data).not.toContain('appendAuditEvent(')
    expect(app).not.toContain('adminConsoleData')
    // The assignments page owns admin-data access through the redacted live data
    // context (useAdminData seeds from adminConsoleData via assertRedactedAdminConsoleData),
    // rather than importing the fixture symbol directly.
    expect(assignmentsPage).toContain('useAdminData')
    expect(app).not.toMatch(/import\s+\{[^}]*\bassignments\b[^}]*\}\s+from ['"]@\/lib\/admin-data['"]/)
  })

  test('aiworker-control exposes a browser-safe control-plane contract for Web', () => {
    const pkg = readJson<{
      exports: Record<string, { import: string, types: string }>
    }>('packages/aiworker-control/package.json')
    const controlPlaneTypes = read('packages/aiworker-control/src/control-plane.ts')

    expect(pkg.exports['./control-plane']?.types).toBe('./src/control-plane.ts')
    expect(controlPlaneTypes).toContain('export interface ControlPlaneSnapshot')
    expect(controlPlaneTypes).toContain('export interface ProvisionReceipt')
    expect(controlPlaneTypes).toContain('export interface WorkspaceProjectionManifest')
    expect(controlPlaneTypes).not.toContain('node:fs')
    expect(controlPlaneTypes).not.toContain('node:crypto')
    expect(controlPlaneTypes).not.toContain('LocalFileControlPlaneStore')
  })

  test('web source never issues control-plane write calls, only redacted reads and approval appends', () => {
    const combined = sourceFiles(`${appRoot}/src`)
      .map(path => read(path))
      .join('\n')

    for (const forbiddenWrite of [
      '.saveSnapshot(',
      '.appendReceipt(',
      '.appendProjectionManifest(',
    ]) {
      expect(combined).not.toContain(forbiddenWrite)
    }

    expect(combined).toContain('.loadSnapshot(')
    expect(combined).toContain('appendApprovalDecision')
    expect(combined).toContain('approvals.jsonl')
  })

  test('route shell stays thin and page modules own screen composition', () => {
    const app = read(`${appRoot}/src/App.tsx`)

    expect(app.split('\n').length).toBeLessThanOrEqual(50)
    // /assignments 已并入操作台(重定向)，不再是 App 直接路由的页面模块；此清单只列
    // App 真正 import 并挂载的页面模块。
    for (const page of [
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
