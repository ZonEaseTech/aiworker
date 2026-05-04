import type { ScopeManifest } from '@zonease/aiworker-shared'

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import { createBuiltinSoulRegistry, parseScopeManifestJson } from '@zonease/aiworker-shared'

import { validateCapabilityProject } from '../../capabilities/validation'

const BUILTIN_SOUL_REGISTRY = createBuiltinSoulRegistry()

interface ScopeManifestStatus {
  status: 'ok' | 'missing' | 'malformed' | 'unknown-soul' | 'kind-mismatch'
  manifest?: ScopeManifest
  message?: string
  issues: string[]
}

function inspectScopeManifest(root: string): ScopeManifestStatus {
  const scopePath = path.join(root, 'scope.json')
  if (!existsSync(scopePath))
    return { status: 'missing', issues: [] }

  let raw: string
  try {
    raw = readFileSync(scopePath, 'utf8')
  }
  catch (err) {
    return {
      issues: [],
      message: err instanceof Error ? err.message : String(err),
      status: 'malformed',
    }
  }

  const parsed = parseScopeManifestJson(raw)
  if (parsed.status === 'malformed') {
    return {
      issues: [],
      message: parsed.error,
      status: 'malformed',
    }
  }

  const issues: string[] = []
  const manifest = parsed.manifest
  const soul = BUILTIN_SOUL_REGISTRY.get(manifest.primarySoul)
  if (soul === undefined) {
    issues.push(`primarySoul "${manifest.primarySoul}" is not a built-in Soul (use \`aiworker soul list\`).`)
    return { issues, manifest, status: 'unknown-soul' }
  }
  if (!soul.supportedScopeKinds.includes(manifest.kind)) {
    issues.push(
      `kind "${manifest.kind}" is not in Soul "${soul.manifest.id}" supportedScopeKinds (${soul.supportedScopeKinds.join(', ')}).`,
    )
    return { issues, manifest, status: 'kind-mismatch' }
  }
  return { issues, manifest, status: 'ok' }
}

function formatScopeStatusLabel(status: ScopeManifestStatus['status']): string {
  switch (status) {
    case 'ok':
      return 'PASS'
    case 'missing':
      return 'WARN'
    case 'malformed':
    case 'unknown-soul':
    case 'kind-mismatch':
      return 'FAIL'
  }
}

function formatScopeArtifactRoots(manifest: ScopeManifest): string {
  if (!manifest.artifactRoots || manifest.artifactRoots.length === 0)
    return '<none declared>'
  return manifest.artifactRoots.map(root => root.path).join(', ')
}

export async function runDoctor(): Promise<number> {
  const scope = resolveAiworkerScope()
  const root = scope.scope === 'project' && scope.projectRoot
    ? path.join(scope.projectRoot, '.aiworker')
    : scope.home

  const report = await validateCapabilityProject(root)
  const scopeManifest = inspectScopeManifest(root)

  process.stdout.write('[aiworker doctor] Project Brain capability validation\n')
  process.stdout.write(`Scope : ${scope.scope}\n`)
  process.stdout.write(`Root  : ${report.root}\n`)
  process.stdout.write(`Status: ${formatStatus(report.status)}\n`)

  if (scope.scope === 'project' && scope.projectRoot) {
    process.stdout.write('  Brain identity:\n')
    for (const file of ['AGENT.md', 'SOUL.md', 'USER.md', 'MEMORY.md'] as const) {
      const exists = existsSync(path.join(root, file))
      process.stdout.write(`    ${(exists ? 'PASS' : 'WARN').padEnd(7)} ${file}\n`)
    }

    process.stdout.write('  Scope manifest:\n')
    const label = formatScopeStatusLabel(scopeManifest.status)
    if (scopeManifest.status === 'ok' && scopeManifest.manifest) {
      const m = scopeManifest.manifest
      process.stdout.write(`    ${label.padEnd(7)} scope.json\n`)
      process.stdout.write(`      kind         : ${m.kind}\n`)
      process.stdout.write(`      primary soul : ${m.primarySoul}\n`)
      process.stdout.write(`      privacy      : ${m.privacy ?? '<unset>'}\n`)
      process.stdout.write(`      retention    : ${m.retention ?? '<unset>'}\n`)
      process.stdout.write(`      approval     : ${m.approval ?? '<unset>'}\n`)
      process.stdout.write(`      artifactRoots: ${formatScopeArtifactRoots(m)}\n`)
    }
    else if (scopeManifest.status === 'missing') {
      process.stdout.write(`    ${label.padEnd(7)} scope.json (no business-scope manifest declared; run \`aiworker init --soul <preset>\` or write \`.aiworker/scope.json\` by hand)\n`)
    }
    else {
      const reason = scopeManifest.message ?? scopeManifest.issues.join('; ')
      process.stdout.write(`    ${label.padEnd(7)} scope.json — ${scopeManifest.status}: ${reason}\n`)
    }

    process.stdout.write('  Brain runtime: run `aiworker brain status` for live skill / memory counts and write target.\n')
  }

  for (const check of report.checks) {
    process.stdout.write(`  ${formatStatus(check.status).padEnd(7)} ${check.label}\n`)
    for (const item of check.issues) {
      const location = item.path ? ` ${item.path}` : ''
      process.stdout.write(`    - [${item.severity}] ${item.code}${location}: ${item.message}\n`)
    }
  }

  if (scopeManifest.status === 'malformed' || scopeManifest.status === 'unknown-soul' || scopeManifest.status === 'kind-mismatch')
    return 1
  return report.status === 'fail' ? 1 : 0
}

function formatStatus(status: string): string {
  return status.toUpperCase()
}
