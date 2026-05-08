import type {
  BrainCapabilitiesManifest,
  CapabilityValidationIssue,
  CapabilityValidationStatus,
  McpDescriptorManifest,
  PolicyManifest,
  SkillMetadata,
} from '@zonease/aiworker-shared'

import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

import { NATIVE_PROJECT_SKILL_TARGETS } from '@zonease/aiworker-fs-layout'
import {
  brainCapabilitiesManifestSchema,
  policyManifestSchema,
  secretRefSchema,
  skillMetadataSchema,
} from '@zonease/aiworker-shared'
import { parse as parseYaml } from 'yaml'

import {
  builtinToolsetRisk,
  isBuiltinCapabilityPack,
  isBuiltinToolset,
} from './catalog'

export interface CapabilityDoctorCheck {
  id: 'brain-capabilities' | 'fallback-brain-skills' | 'native-skills' | 'policy'
  issues: CapabilityValidationIssue[]
  label: string
  path: string
  status: CapabilityValidationStatus
}

export interface CapabilityDoctorReport {
  checks: CapabilityDoctorCheck[]
  root: string
  status: CapabilityValidationStatus
}

interface SafeParseIssue {
  message: string
  path: Array<number | string>
}

interface SafeParser<T> {
  safeParse: (value: unknown) =>
    | { data: T, success: true }
    | { error: { issues: SafeParseIssue[] }, success: false }
}

interface ParsedJson<T> {
  data?: T
  issues: CapabilityValidationIssue[]
}

interface ParsedSkill {
  metadata?: Record<string, unknown>
  rawIssue?: CapabilityValidationIssue
}

const HIGH_RISK_PATTERN = /(?:^|[.*-])(?:write|delete|remove|deploy|publish|shell|git|exec|run|restart|stop|scale|database|db)(?:[.*-]|$)/i

export async function validateCapabilityProject(root: string): Promise<CapabilityDoctorReport> {
  const policy = await validatePolicy(path.join(root, 'policy.json'))
  const brainCapabilities = await validateBrainCapabilities(path.join(root, 'brain-capabilities.json'), policy.data)
  const projectRoot = path.basename(path.resolve(root)) === '.aiworker'
    ? path.dirname(path.resolve(root))
    : path.resolve(root)
  const nativeSkills = await validateNativeSkills(projectRoot)
  const fallbackBrainSkills = await validateFallbackBrainSkills(root)

  const checks: CapabilityDoctorCheck[] = [
    toCheck('policy', 'policy.json', path.join(root, 'policy.json'), policy.issues),
    toCheck('brain-capabilities', 'brain-capabilities.json', path.join(root, 'brain-capabilities.json'), brainCapabilities.issues),
    toCheck('native-skills', 'native executor project skills', projectRoot, nativeSkills.issues),
  ]
  if (fallbackBrainSkills.issues.length > 0)
    checks.push(toCheck('fallback-brain-skills', '.aiworker/skills fallback', path.join(root, 'skills'), fallbackBrainSkills.issues))

  return {
    checks,
    root,
    status: rollupStatus(checks.map(check => check.status)),
  }
}

async function validateBrainCapabilities(filePath: string, policy?: PolicyManifest): Promise<ParsedJson<BrainCapabilitiesManifest>> {
  const parsed = await readJsonFile(filePath, brainCapabilitiesManifestSchema, 'brain-capabilities.json')
  if (!parsed.data)
    return parsed

  const issues = [...parsed.issues]
  collectToolsetIssues(parsed.data, policy, issues)
  collectCapabilityPackIssues(parsed.data, policy, issues)
  collectMcpIssues(parsed.data.mcp, issues)
  return { data: parsed.data, issues }
}

async function validatePolicy(filePath: string): Promise<ParsedJson<PolicyManifest>> {
  const parsed = await readJsonFile(filePath, policyManifestSchema, 'policy.json')
  if (!parsed.data)
    return parsed

  const issues = [...parsed.issues]
  if (!parsed.data.toolPolicy) {
    issues.push(issue('warning', 'policy.tool_policy_missing', 'policy.json does not define toolPolicy; capability gating will fall back to runtime defaults.', 'toolPolicy'))
  }
  else {
    for (const [index, rule] of parsed.data.toolPolicy.rules.entries()) {
      if (rule.action === 'auto' && HIGH_RISK_PATTERN.test(rule.pattern)) {
        issues.push(issue(
          'warning',
          'policy.high_risk_auto_rule',
          `toolPolicy rule "${rule.pattern}" auto-approves a high-risk pattern.`,
          `toolPolicy.rules.${index}`,
        ))
      }
    }
  }

  return { data: parsed.data, issues }
}

function collectToolsetIssues(
  manifest: Pick<BrainCapabilitiesManifest, 'defaultToolsets'>,
  policy: PolicyManifest | undefined,
  issues: CapabilityValidationIssue[],
): void {
  const seen = new Set<string>()
  for (const [index, id] of manifest.defaultToolsets.entries()) {
    if (seen.has(id)) {
      issues.push(issue('error', 'brain-capabilities.toolsets.duplicate_default', `defaultToolsets contains duplicate toolset "${id}".`, `defaultToolsets.${index}`))
      continue
    }
    seen.add(id)

    if (!isBuiltinToolset(id)) {
      issues.push(issue('error', 'brain-capabilities.toolsets.unknown_default', `defaultToolsets references unknown toolset "${id}".`, `defaultToolsets.${index}`))
      continue
    }

    const risk = builtinToolsetRisk(id)
    if (risk === 'high' && policy?.risk.highRiskRequiresApproval !== true) {
      issues.push(issue(
        'error',
        'brain-capabilities.toolsets.high_risk_without_approval',
        `High-risk toolset "${id}" requires policy.risk.highRiskRequiresApproval=true.`,
        `defaultToolsets.${index}`,
      ))
    }
  }

  if (manifest.defaultToolsets.length === 0)
    issues.push(issue('warning', 'brain-capabilities.toolsets.empty_defaults', 'No default toolsets are enabled.', 'defaultToolsets'))
}

function collectCapabilityPackIssues(
  manifest: Pick<BrainCapabilitiesManifest, 'packs' | 'soul'>,
  policy: PolicyManifest | undefined,
  issues: CapabilityValidationIssue[],
): void {
  const seen = new Set<string>()
  const policySoul = policy?.soul?.preset
  if (policySoul && manifest.soul && manifest.soul !== policySoul) {
    issues.push(issue(
      'error',
      'brain-capabilities.packs.soul_mismatch',
      `brain-capabilities.json soul "${manifest.soul}" does not match policy soul "${policySoul}".`,
      'soul',
    ))
  }

  for (const [index, pack] of manifest.packs.entries()) {
    if (seen.has(pack.id)) {
      issues.push(issue('error', 'brain-capabilities.packs.duplicate', `Capability pack "${pack.id}" is listed more than once.`, `packs.${index}`))
      continue
    }
    seen.add(pack.id)

    if (!isBuiltinCapabilityPack(pack.id)) {
      issues.push(issue('error', 'brain-capabilities.packs.unknown', `Unknown capability pack "${pack.id}".`, `packs.${index}.id`))
    }
  }

  if (manifest.packs.length === 0)
    issues.push(issue('warning', 'brain-capabilities.packs.empty', 'No capability packs are declared.', 'packs'))
}

function collectMcpIssues(
  manifest: McpDescriptorManifest,
  issues: CapabilityValidationIssue[],
): void {
  for (const [serverName, server] of Object.entries(manifest.servers)) {
    const basePath = `servers.${serverName}`
    collectSecretIssues(server, basePath, issues)

    if (server.disabled === true)
      continue

    if (server.transport === 'stdio' && !server.command) {
      issues.push(issue('error', 'mcp.stdio_missing_command', `MCP server "${serverName}" uses stdio but has no command.`, basePath))
    }
    if ((server.transport === 'streamable-http' || server.transport === 'sse') && !server.url) {
      issues.push(issue('error', 'mcp.http_missing_url', `MCP server "${serverName}" uses ${server.transport} but has no url.`, basePath))
    }
    if (!server.command && !server.url) {
      issues.push(issue(
        'warning',
        'mcp.declared_only',
        `MCP server "${serverName}" has no command or url; doctor can only validate its declared tool descriptors.`,
        basePath,
      ))
    }
  }
}

async function validateNativeSkills(projectRoot: string): Promise<ParsedJson<SkillMetadata[]>> {
  const issues: CapabilityValidationIssue[] = []
  const data: SkillMetadata[] = []
  let count = 0

  for (const target of NATIVE_PROJECT_SKILL_TARGETS) {
    const dirPath = path.join(projectRoot, ...target.directory.split('/'))
    const parsed = await validateSkillDirectory(dirPath, {
      displayRoot: target.directory,
      empty: 'ignore',
      missing: 'ignore',
    })
    issues.push(...parsed.issues)
    data.push(...parsed.data ?? [])
    count += parsed.count
  }

  if (count === 0) {
    issues.push(issue(
      'info',
      'native-skills.empty',
      `No native executor project skill files found. Default init writes skills to ${NATIVE_PROJECT_SKILL_TARGETS.map(target => `${target.directory}/<name>/SKILL.md`).join(' and ')}.`,
      'executor-native-skills',
    ))
  }

  return { data, issues }
}

async function validateFallbackBrainSkills(root: string): Promise<ParsedJson<SkillMetadata[]>> {
  const parsed = await validateSkillDirectory(path.join(root, 'skills'), {
    displayRoot: '.aiworker/skills',
    empty: 'ignore',
    missing: 'ignore',
  })
  if (parsed.count === 0)
    return parsed

  return {
    data: parsed.data,
    issues: [
      issue(
        'warning',
        'brain-skills.fallback_present',
        '.aiworker/skills contains fallback prompt-skill files. Native executor project skills are the default for Codex and Claude Code.',
        '.aiworker/skills/',
      ),
      ...parsed.issues,
    ],
  }
}

interface SkillDirectoryValidationOptions {
  displayRoot: string
  empty: 'ignore' | 'info'
  missing: 'error' | 'ignore'
}

interface ParsedSkills extends ParsedJson<SkillMetadata[]> {
  count: number
}

async function validateSkillDirectory(dirPath: string, options: SkillDirectoryValidationOptions): Promise<ParsedSkills> {
  const issues: CapabilityValidationIssue[] = []
  try {
    await access(dirPath)
  }
  catch {
    if (options.missing === 'ignore')
      return { count: 0, data: [], issues: [] }
    return {
      count: 0,
      issues: [
        issue('error', 'skills.dir_missing', `${options.displayRoot}/ directory is missing.`, options.displayRoot),
      ],
    }
  }

  const glob = new Bun.Glob('**/SKILL.md')
  const parsedSkills: SkillMetadata[] = []
  const seenNames = new Map<string, string>()
  let count = 0

  for await (const relative of glob.scan({ cwd: dirPath })) {
    count += 1
    const filePath = path.join(dirPath, relative)
    const raw = await readFile(filePath, 'utf8')
    const parsed = parseSkillFile(raw, `${options.displayRoot}/${relative}`)
    if (parsed.rawIssue) {
      issues.push(parsed.rawIssue)
      continue
    }

    const result = skillMetadataSchema.safeParse(parsed.metadata)
    if (!result.success) {
      issues.push(...zodIssues(result.error.issues, `${options.displayRoot}/${relative}`))
      continue
    }

    if (result.data.version && !/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(result.data.version)) {
      issues.push(issue(
        'warning',
        'skills.version_format',
        `Skill "${result.data.name}" version "${result.data.version}" is not semver-like.`,
        `${options.displayRoot}/${relative}.version`,
      ))
    }

    const existing = seenNames.get(result.data.name)
    if (existing) {
      issues.push(issue(
        'error',
        'skills.duplicate_name',
        `Skill name "${result.data.name}" is duplicated by ${existing} and ${relative}.`,
        `${options.displayRoot}/${relative}.name`,
      ))
    }
    seenNames.set(result.data.name, relative)
    parsedSkills.push(result.data)
  }

  if (count === 0 && options.empty === 'info') {
    issues.push(issue(
      'info',
      'skills.empty',
      `No skill files configured yet (${options.displayRoot}/ is empty).`,
      `${options.displayRoot}/`,
    ))
  }

  return { count, data: parsedSkills, issues }
}

async function readJsonFile<T>(
  filePath: string,
  schema: SafeParser<T>,
  label: string,
): Promise<ParsedJson<T>> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  }
  catch {
    return {
      issues: [
        issue('error', 'manifest.missing', `${label} is missing.`, label),
      ],
    }
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON'
    return {
      issues: [
        issue('error', 'manifest.invalid_json', `${label} is not valid JSON: ${message}`, label),
      ],
    }
  }

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    return {
      issues: zodIssues(parsed.error.issues, label),
    }
  }

  return { data: parsed.data, issues: [] }
}

function parseSkillFile(raw: string, displayPath: string): ParsedSkill {
  const ext = displayPath.split('.').pop()?.toLowerCase()
  if (ext === 'yaml' || ext === 'yml') {
    try {
      const parsed = parseYaml(raw) as unknown
      if (!isRecord(parsed)) {
        return { rawIssue: issue('error', 'skills.yaml_not_object', 'Skill YAML metadata must be an object.', displayPath) }
      }
      return { metadata: parsed }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'invalid YAML'
      return { rawIssue: issue('error', 'skills.invalid_yaml', `Skill YAML metadata is invalid: ${message}`, displayPath) }
    }
  }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) {
    return {
      rawIssue: issue('error', 'skills.frontmatter_missing', 'Skill markdown requires YAML frontmatter with name and description.', displayPath),
    }
  }
  try {
    const parsed = parseYaml(match[1] ?? '') as unknown
    if (!isRecord(parsed)) {
      return { rawIssue: issue('error', 'skills.frontmatter_not_object', 'Skill frontmatter must be an object.', displayPath) }
    }
    return { metadata: parsed }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'invalid YAML frontmatter'
    return { rawIssue: issue('error', 'skills.invalid_frontmatter', `Skill frontmatter is invalid: ${message}`, displayPath) }
  }
}

function collectSecretIssues(value: unknown, pathValue: string, issues: CapabilityValidationIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSecretIssues(item, `${pathValue}.${index}`, issues))
    return
  }
  if (!isRecord(value))
    return

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${pathValue}.${key}`
    if (key === 'secretRef')
      continue
    if (isSensitiveKey(key)) {
      const parsedRef = secretRefSchema.safeParse(child)
      if (parsedRef.success)
        continue
      if (typeof child === 'string' && child.length === 0) {
        issues.push(issue('warning', 'mcp.empty_secret_value', `Secret-like field "${childPath}" is empty; prefer a secretRef or remove it.`, childPath))
      }
      else {
        issues.push(issue('error', 'mcp.plaintext_secret', `Secret-like field "${childPath}" must use { "secretRef": "..." } instead of plaintext.`, childPath))
      }
      continue
    }
    collectSecretIssues(child, childPath, issues)
  }
}

function isSensitiveKey(key: string): boolean {
  return /token|secret|api[-_]?key|authorization|password|cookie/i.test(key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function zodIssues(issues: SafeParseIssue[], rootPath: string): CapabilityValidationIssue[] {
  return issues.map((item) => {
    const itemPath = item.path.length === 0
      ? rootPath
      : `${rootPath}.${item.path.join('.')}`
    return issue('error', 'manifest.schema_invalid', item.message, itemPath)
  })
}

function toCheck(
  id: CapabilityDoctorCheck['id'],
  label: string,
  filePath: string,
  issues: CapabilityValidationIssue[],
): CapabilityDoctorCheck {
  return {
    id,
    issues,
    label,
    path: filePath,
    status: statusFromIssues(issues),
  }
}

function statusFromIssues(issues: CapabilityValidationIssue[]): CapabilityValidationStatus {
  if (issues.some(item => item.severity === 'error'))
    return 'fail'
  if (issues.some(item => item.severity === 'warning'))
    return 'warn'
  return 'pass'
}

function rollupStatus(statuses: CapabilityValidationStatus[]): CapabilityValidationStatus {
  if (statuses.includes('fail'))
    return 'fail'
  if (statuses.includes('warn'))
    return 'warn'
  if (statuses.includes('pending'))
    return 'pending'
  return 'pass'
}

function issue(
  severity: CapabilityValidationIssue['severity'],
  code: string,
  message: string,
  pathValue?: string,
): CapabilityValidationIssue {
  return pathValue === undefined
    ? { code, message, severity }
    : { code, message, path: pathValue, severity }
}
