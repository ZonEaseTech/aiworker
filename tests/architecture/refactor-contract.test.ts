import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..')

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('destructive refactor contract bootstrap', () => {
  test('canonical docs are promoted as the only architecture authority set', () => {
    const canonicalDocs = [
      'docs/architecture.md',
      'docs/protocol.md',
      'docs/runtime.md',
      'docs/soul-authoring.md',
      'docs/testing.md',
    ]

    for (const path of canonicalDocs) {
      expect(existsSync(join(repoRoot, path)), `${path} should exist`).toBe(true)
    }

    const architecture = readRepoFile('docs/architecture.md')
    expect(architecture).toContain('Host is shell / locator / mount / bridge')
    expect(architecture).toContain('CLI-first')
    expect(architecture).toContain('descriptor-only')
    expect(architecture).toContain('packages/core and packages/shared disappear')
  })

  test('root workspace includes runnable apps, packages, and Soul Apps', () => {
    const rootPackage = JSON.parse(readRepoFile('package.json')) as {
      workspaces?: string[]
    }

    expect(rootPackage.workspaces).toEqual(
      expect.arrayContaining(['apps/*', 'packages/*', 'souls/*']),
    )
  })

  test('AGENTS.md is a short bootstrap and does not preserve old authority', () => {
    const agents = readRepoFile('AGENTS.md')
    const lineCount = agents.trim().split(/\r?\n/).length

    expect(lineCount).toBeLessThanOrEqual(90)
    expect(agents).toContain('canonical docs')
    expect(agents).toContain('Superpowers')
    expect(agents).toContain('Host is shell / locator / mount / bridge')
    expect(agents).not.toContain('docs/plan')
    expect(agents).not.toContain('docs/task')
    expect(agents).not.toContain('aiworker-host-dev')
    expect(agents).not.toContain('aiworker-soul-app-dev')
    expect(agents).not.toContain('PMA requirement')
  })

  test('runtime contract keeps session lifecycle separate from invocation state', () => {
    const runtime = readRepoFile('docs/runtime.md')

    expect(runtime).toContain('session lifecycle: active | archived | deleted')
    expect(runtime).toContain('execution/process state belongs to engine_invocations')
    expect(runtime).toContain('POST /api/sessions/:sessionId/invocations')
  })

  test('protocol and authoring contracts stay descriptor-only and native-MCP based', () => {
    const protocol = readRepoFile('docs/protocol.md')
    const authoring = readRepoFile('docs/soul-authoring.md')

    expect(protocol).toContain('dist/soul.descriptor.json')
    expect(protocol).toContain('router-mode="search"')
    expect(protocol).not.toContain('host-adapter')
    expect(protocol).not.toContain('source exports')

    expect(authoring).toContain('souls/*')
    expect(authoring).toContain('soul.config.ts')
    expect(authoring).toContain('author-owned native MCP files may contain literal secrets')
  })

  test('package guardrails reject broad replacement buckets', () => {
    expect(existsSync(join(repoRoot, 'packages/core-v2'))).toBe(false)
    expect(existsSync(join(repoRoot, 'packages/shared-v2'))).toBe(false)
  })
})
