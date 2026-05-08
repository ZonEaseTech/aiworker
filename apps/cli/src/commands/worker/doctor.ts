import type { ScopeManifest } from '@zonease/aiworker-shared'

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { NATIVE_PROJECT_SKILL_TARGETS, resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import { createBuiltinSoulRegistry, parseScopeManifestJson } from '@zonease/aiworker-shared'

import { validateCapabilityProject } from '../../capabilities/validation'
import { planNativeSkillProjectionSync } from './native-skill-projections'

const BUILTIN_SOUL_REGISTRY = createBuiltinSoulRegistry()

interface ScopeManifestStatus {
  status: 'ok' | 'missing' | 'malformed' | 'unknown-soul' | 'kind-mismatch'
  manifest?: ScopeManifest
  message?: string
  issues: string[]
}

interface GatewayEnrollmentStatus {
  displayName?: string
  envFile: string
  gatewayUrl?: string
  hasEnvFile: boolean
}

function parseDotenvAssignment(rawLine: string): { key: string, value: string } | null {
  const line = rawLine.trim()
  if (!line || line.startsWith('#'))
    return null
  const eq = line.indexOf('=')
  if (eq <= 0)
    return null
  const key = line.slice(0, eq).trim()
  let value = line.slice(eq + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
    value = value.slice(1, -1)
  return { key, value }
}

function inspectGatewayEnrollment(home: string): GatewayEnrollmentStatus {
  const envFile = path.join(home, '.env')
  if (!existsSync(envFile))
    return { envFile, hasEnvFile: false }

  const values: Record<string, string> = {}
  try {
    const text = readFileSync(envFile, 'utf8')
    for (const line of text.split('\n')) {
      const assignment = parseDotenvAssignment(line)
      if (assignment)
        values[assignment.key] = assignment.value
    }
  }
  catch {
    return { envFile, hasEnvFile: false }
  }

  const gatewayUrl = values.AIWORKER_GATEWAY_URL?.trim()
  const displayName = values.AIWORKER_DISPLAY_NAME?.trim()
  return {
    ...(displayName ? { displayName } : {}),
    envFile,
    ...(gatewayUrl ? { gatewayUrl } : {}),
    hasEnvFile: true,
  }
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

/**
 * TODO-015: detect a fresh-init project so we can suppress info-level
 * "X.empty" noise that fires on every `aiworker init` default. Scope is
 * intentionally narrow — `runDoctor` is about brain capability validation,
 * so fresh = scope.json exists (init ran) AND no executor-native/fallback
 * skill files exist yet. Executor overlay / schedule fresh-detection is
 * handled separately in their own commands.
 */
export function detectFreshInitDefaults(root: string): boolean {
  const exists = (sub: string) => existsSync(path.join(root, sub))
  if (!exists('scope.json'))
    return false
  if (hasAnySkillEntrypoint(path.join(root, 'skills')))
    return false
  const projectRoot = path.basename(path.resolve(root)) === '.aiworker'
    ? path.dirname(path.resolve(root))
    : path.resolve(root)
  for (const target of NATIVE_PROJECT_SKILL_TARGETS) {
    if (hasAnySkillEntrypoint(path.join(projectRoot, ...target.directory.split('/'))))
      return false
  }
  return true
}

function hasAnySkillEntrypoint(dir: string): boolean {
  if (!existsSync(dir))
    return false
  let entries: string[]
  try {
    entries = readdirSync(dir)
  }
  catch {
    return false
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    try {
      const stats = statSync(fullPath)
      if (stats.isFile() && entry === 'SKILL.md')
        return true
      if (stats.isDirectory() && hasAnySkillEntrypoint(fullPath))
        return true
    }
    catch {
      continue
    }
  }
  return false
}

interface DoctorRollup {
  pass: number
  info: number
  warn: number
  fail: number
}

interface NativeSkillProjectionDoctorSummary {
  attention: number
  desiredCount: number
  manifestExists: boolean
  manifestPath: string
  summary: Awaited<ReturnType<typeof planNativeSkillProjectionSync>>['summary']
}

function tallyRollup(rollup: DoctorRollup, severity: string): void {
  if (severity === 'error')
    rollup.fail += 1
  else if (severity === 'warning')
    rollup.warn += 1
  else
    rollup.info += 1
}

function tallyGatewayEnrollment(rollup: DoctorRollup, status: GatewayEnrollmentStatus): void {
  if (!status.hasEnvFile || status.gatewayUrl === undefined || status.displayName === undefined)
    rollup.info += 1
}

function tallyNativeSkillProjection(rollup: DoctorRollup, summary: NativeSkillProjectionDoctorSummary | null): void {
  if (summary === null)
    return
  if (!summary.manifestExists)
    rollup.warn += 1
  rollup.warn += summary.attention
}

function printGatewayEnrollment(status: GatewayEnrollmentStatus): void {
  process.stdout.write('  Gateway enrollment:\n')
  if (!status.hasEnvFile) {
    process.stdout.write(`    INFO    worker-local .env not found at ${status.envFile}\n`)
    process.stdout.write('      Run `aiworker init --soul <preset>` first; gateway enrollment is optional.\n')
    return
  }
  if (status.gatewayUrl === undefined) {
    process.stdout.write('    INFO    standalone mode (AIWORKER_GATEWAY_URL is not set)\n')
    process.stdout.write('      Optional gateway enrollment:\n')
    process.stdout.write('        aiworker env gateway-url wss://your-gateway.example/\n')
    process.stdout.write('        aiworker env display-name my-laptop\n')
    return
  }

  process.stdout.write('    PASS    AIWORKER_GATEWAY_URL is set\n')
  if (status.displayName === undefined) {
    process.stdout.write('    INFO    AIWORKER_DISPLAY_NAME is not set; fleet will fall back to hostname / worker id.\n')
    process.stdout.write('      Set it with: aiworker env display-name <name>\n')
  }
  else {
    process.stdout.write('    PASS    AIWORKER_DISPLAY_NAME is set\n')
  }
}

export async function runDoctor(): Promise<number> {
  const scope = resolveAiworkerScope()
  const root = scope.scope === 'project' && scope.projectRoot
    ? path.join(scope.projectRoot, '.aiworker')
    : scope.home

  const report = await validateCapabilityProject(root)
  const scopeManifest = inspectScopeManifest(root)
  const gatewayEnrollment = inspectGatewayEnrollment(scope.home)
  const nativeSkillProjection = scope.scope === 'project' && scope.projectRoot
    ? await inspectNativeSkillProjection(scope.projectRoot)
    : null
  const freshInit = detectFreshInitDefaults(root)

  // TODO-015: build rollup before printing so the summary line can lead.
  // Fresh-init mode silences `*.empty` info noise at the source instead of
  // printing first and asking operators to ignore.
  const rollup: DoctorRollup = { pass: 0, info: 0, warn: 0, fail: 0 }
  for (const check of report.checks) {
    if (check.status === 'pass')
      rollup.pass += 1
    else if (check.status === 'fail')
      rollup.fail += 1
    else
      rollup.warn += 1
    for (const item of check.issues) {
      if (freshInit && item.severity === 'info' && item.code.endsWith('.empty'))
        continue
      tallyRollup(rollup, item.severity)
    }
  }
  tallyGatewayEnrollment(rollup, gatewayEnrollment)
  tallyNativeSkillProjection(rollup, nativeSkillProjection)

  const summaryStatus = rollup.fail > 0 ? 'FAIL' : rollup.warn > 0 ? 'WARN' : 'OK'
  const freshSuffix = freshInit ? ' (fresh-init defaults; expected to be sparse)' : ''
  process.stdout.write(`[aiworker doctor] ${summaryStatus} — ${report.checks.length} checks; ${rollup.pass} PASS · ${rollup.info} info · ${rollup.warn} WARN · ${rollup.fail} FAIL${freshSuffix}\n`)
  process.stdout.write('[aiworker doctor] Project Brain capability validation\n')
  process.stdout.write(`Scope : ${scope.scope}\n`)
  process.stdout.write(`Root  : ${report.root}\n`)
  process.stdout.write(`Status: ${formatStatus(report.status)}\n`)
  printGatewayEnrollment(gatewayEnrollment)

  if (scope.scope === 'project' && scope.projectRoot) {
    process.stdout.write('  Brain identity:\n')
    for (const file of ['SOUL.md', 'USER.md', 'MEMORY.md'] as const) {
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

    printNativeSkillProjection(nativeSkillProjection)

    process.stdout.write('  Brain runtime: run `aiworker brain status` for Project Brain memory/fallback skill counts and native executor skill targets.\n')
  }

  for (const check of report.checks) {
    process.stdout.write(`  ${formatStatus(check.status).padEnd(7)} ${check.label}\n`)
    for (const item of check.issues) {
      // TODO-015: silence info-level `*.empty` noise on fresh-init defaults
      // (e.g. `brain-skills.empty`). Operators with a freshly-initialized
      // project shouldn't have to scan past INFO lines they didn't trigger.
      if (freshInit && item.severity === 'info' && item.code.endsWith('.empty'))
        continue
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

async function inspectNativeSkillProjection(projectRoot: string): Promise<NativeSkillProjectionDoctorSummary> {
  const plan = await planNativeSkillProjectionSync({ mode: 'dry-run', projectRoot })
  const attention = plan.summary.missing
    + plan.summary.outdated
    + plan.summary.drifted
    + plan.summary.deprecated
    + plan.summary.removed
    + plan.summary.orphaned
  return {
    attention,
    desiredCount: plan.desiredCount,
    manifestExists: plan.manifestExists,
    manifestPath: plan.manifestPath,
    summary: plan.summary,
  }
}

function printNativeSkillProjection(summary: NativeSkillProjectionDoctorSummary | null): void {
  if (summary === null)
    return
  const status = summary.attention === 0 && summary.manifestExists ? 'PASS' : 'WARN'
  process.stdout.write('  Native skill projection:\n')
  process.stdout.write(`    ${status.padEnd(7)} ${summary.desiredCount} desired managed projection target(s)\n`)
  process.stdout.write(`      manifest : ${summary.manifestExists ? summary.manifestPath : `${summary.manifestPath} (missing)`}\n`)
  process.stdout.write(`      summary  : active=${summary.summary.active}, missing=${summary.summary.missing}, outdated=${summary.summary.outdated}, drifted=${summary.summary.drifted}, deprecated=${summary.summary.deprecated}, removed=${summary.summary.removed}, orphaned=${summary.summary.orphaned}\n`)
  if (!summary.manifestExists || summary.attention > 0)
    process.stdout.write('      run      : aiworker brain skills sync-native --dry-run\n')
}
