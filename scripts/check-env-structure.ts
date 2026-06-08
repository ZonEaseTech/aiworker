import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

export interface EnvStructurePair {
  actualPath: string
  expectedPath: string
}

export interface EnvStructureLine {
  line: number
  raw: string
  signature: string
}

export interface EnvStructureComparison {
  issues: string[]
  ok: boolean
}

export interface EnvStructureCheckResult {
  status: 0 | 1
  stderr: string
  stdout: string
}

export function defaultEnvStructurePairs(): EnvStructurePair[] {
  return [
    { actualPath: '.env', expectedPath: '.env.example' },
    { actualPath: 'packages/worker-daemon/.env', expectedPath: 'packages/worker-daemon/.env.example' },
  ]
}

const assignmentPattern = /^\s*([a-z_]\w*)\s*=/i

function inlineComment(raw: string, valueStart: number): string {
  let quote: '"' | '\'' | null = null
  let escaped = false

  for (let index = valueStart; index < raw.length; index += 1) {
    const char = raw[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (quote) {
      if (char === quote)
        quote = null
      continue
    }

    if (char === '"' || char === '\'') {
      quote = char
      continue
    }

    if (char === '#' && (index === valueStart || /\s/.test(raw[index - 1] ?? '')))
      return raw.slice(index)
  }

  return ''
}

function signatureForLine(raw: string): string {
  if (/^\s*$/.test(raw))
    return 'blank:'

  if (/^\s*#/.test(raw))
    return `comment:${raw}`

  const assignment = raw.match(assignmentPattern)
  if (!assignment)
    return `other:${raw}`

  const valueStart = assignment[0].length
  const comment = inlineComment(raw, valueStart)
  return comment ? `env:${assignment[1]} ${comment}` : `env:${assignment[1]}`
}

function assignmentValue(raw: string): { key: string, value: string } | null {
  const assignment = raw.match(assignmentPattern)
  if (!assignment)
    return null

  return {
    key: assignment[1],
    value: raw.slice(assignment[0].length),
  }
}

export function normalizeEnvStructure(source: string): EnvStructureLine[] {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((raw, index) => ({
      line: index + 1,
      raw,
      signature: signatureForLine(raw),
    }))
}

export function compareEnvStructure(expected: string, actual: string): EnvStructureComparison {
  const expectedLines = normalizeEnvStructure(expected)
  const actualLines = normalizeEnvStructure(actual)
  const issues: string[] = []
  const lineCount = Math.max(expectedLines.length, actualLines.length)

  for (let index = 0; index < lineCount; index += 1) {
    const expectedLine = expectedLines[index]
    const actualLine = actualLines[index]
    const line = index + 1

    if (!expectedLine) {
      issues.push(`line ${line}: expected end of file, got ${actualLine!.signature}`)
      continue
    }

    if (!actualLine) {
      issues.push(`line ${line}: expected ${expectedLine.signature}, got end of file`)
      continue
    }

    if (expectedLine.signature !== actualLine.signature)
      issues.push(`line ${line}: expected ${expectedLine.signature}, got ${actualLine.signature}`)
  }

  return {
    issues,
    ok: issues.length === 0,
  }
}

export function syncEnvStructure(expected: string, actual: string): string {
  const values = new Map<string, string>()
  for (const line of actual.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    const assignment = assignmentValue(line)
    if (assignment)
      values.set(assignment.key, assignment.value)
  }

  return expected
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => {
      const assignment = assignmentValue(line)
      if (!assignment)
        return line
      return `${assignment.key}=${values.get(assignment.key) ?? assignment.value}`
    })
    .join('\n')
}

export function runEnvStructureCheck(options: {
  actualPath?: string
  cwd?: string
  expectedPath?: string
  write?: boolean
} = {}): EnvStructureCheckResult {
  const cwd = options.cwd ?? process.cwd()
  const expectedPath = resolve(cwd, options.expectedPath ?? '.env.example')
  const actualPath = resolve(cwd, options.actualPath ?? '.env')

  if (!existsSync(expectedPath)) {
    return {
      status: 1,
      stderr: `[env:check] missing .env.example at ${expectedPath}\n`,
      stdout: '',
    }
  }

  const expected = readFileSync(expectedPath, 'utf8')

  if (!existsSync(actualPath)) {
    if (options.write) {
      mkdirSync(dirname(actualPath), { recursive: true })
      writeFileSync(actualPath, expected)
      return {
        status: 0,
        stderr: '',
        stdout: `[env:check] created .env from .env.example (${expectedPath} -> ${actualPath})\n`,
      }
    }

    return {
      status: 1,
      stderr: `[env:check] missing .env at ${actualPath}; copy .env.example to .env and fill values without changing comments or keys.\n`,
      stdout: '',
    }
  }

  const actual = readFileSync(actualPath, 'utf8')
  const comparison = compareEnvStructure(expected, actual)

  if (comparison.ok) {
    return {
      status: 0,
      stderr: '',
      stdout: `[env:check] env structure ok (${expectedPath} <-> ${actualPath})\n`,
    }
  }

  if (options.write) {
    writeFileSync(actualPath, syncEnvStructure(expected, actual))
    return {
      status: 0,
      stderr: '',
      stdout: `[env:check] synced .env structure from .env.example (${expectedPath} -> ${actualPath})\n`,
    }
  }

  return {
    status: 1,
    stderr: [
      `[env:check] .env structure differs from .env.example`,
      ...comparison.issues.slice(0, 50),
      ...(comparison.issues.length > 50 ? [`... ${comparison.issues.length - 50} more issue(s)`] : []),
      'Only values may differ; comments, blank lines, variable names, and order must match.',
      '',
    ].join('\n'),
    stdout: '',
  }
}

export function runEnvStructureChecks(options: {
  cwd?: string
  pairs?: EnvStructurePair[]
  write?: boolean
} = {}): EnvStructureCheckResult {
  const cwd = options.cwd ?? process.cwd()
  const pairs = options.pairs ?? defaultEnvStructurePairs()
  const stdout: string[] = []
  const stderr: string[] = []
  let status: 0 | 1 = 0

  for (const pair of pairs) {
    const result = runEnvStructureCheck({
      actualPath: pair.actualPath,
      cwd,
      expectedPath: pair.expectedPath,
      write: options.write,
    })
    if (result.stdout)
      stdout.push(result.stdout)
    if (result.stderr)
      stderr.push(result.stderr)
    if (result.status !== 0)
      status = 1
  }

  return {
    status,
    stderr: stderr.join(''),
    stdout: stdout.join(''),
  }
}

function cliArgs(argv: string[]): { positional: string[], write: boolean } {
  const positional: string[] = []
  let write = false

  for (const arg of argv) {
    if (arg === '--write' || arg === '--fix') {
      write = true
      continue
    }
    positional.push(arg)
  }

  return {
    positional,
    write,
  }
}

if (import.meta.main) {
  const args = cliArgs(process.argv.slice(2))
  const result = args.positional.length === 0
    ? runEnvStructureChecks({ write: args.write })
    : runEnvStructureCheck({
        actualPath: args.positional[1],
        expectedPath: args.positional[0],
        write: args.write,
      })
  if (result.stdout)
    process.stdout.write(result.stdout)
  if (result.stderr)
    process.stderr.write(result.stderr)
  process.exit(result.status)
}
