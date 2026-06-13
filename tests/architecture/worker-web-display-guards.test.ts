import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'bun:test'

// B3/B4 employee-facing display guards (the worker-web mirror of the host-* inversion
// guards in inversion-guards.test.ts). The Workbench is the employee's terminal; canon
// (architecture.md:69-70) says an employee starts work "without learning Souls, descriptors,
// MCP, engine targets, or Host". So worker-web user-visible copy must not leak the internal
// architecture / Host control-plane / data-model vocabulary into what an employee reads.
//
// We match forbidden *phrases* (not bare tokens): internal KEY identifiers such as
// `sendInvocation` legitimately contain "invocation", but a rendered VALUE like
// "session invocation" / "会话调用" / "Soul workspace" is an employee-facing leak. Phrases
// with a space / CJK form only occur in value strings, so this avoids the key false-positive
// without an AST parse.

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const localesDir = path.join(repoRoot, 'apps/worker-web/src/features/i18n/locales')

// Forbidden employee-facing phrases (case-insensitive). "Soul" alone is allowed (the app
// catalog legitimately lists "installed Souls"); only the workspace/role/invocation leaks
// are banned.
const FORBIDDEN_DISPLAY_PHRASES = [
  'soul workspace',
  'soul-workspace',
  'soul 工作区',
  'soul ワークスペース',
  'soul-arbeitsbereich',
  'session invocation',
  'an invocation',
  '会话调用',
  'host-owned',
  'local host',
  '本地 host',
  'host settings',
  'host setting',
  '\'operator\'',
  '\'操作者\'',
] as const

function localeFiles(): string[] {
  return readdirSync(localesDir)
    .filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map(name => path.join(localesDir, name))
}

describe('worker-web employee-facing display guards', () => {
  it('B3: locale value copy carries no Host / operator / Soul-Workspace / invocation word roots', () => {
    const offenders: string[] = []
    for (const file of localeFiles()) {
      const lower = readFileSync(file, 'utf8').toLowerCase()
      for (const phrase of FORBIDDEN_DISPLAY_PHRASES) {
        if (lower.includes(phrase))
          offenders.push(`${path.basename(file)} contains forbidden employee-facing phrase "${phrase}"`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('B4: chat composer / timeline components do not hard-code employee-facing English literals', () => {
    // These visible strings used to be hard-coded in the chat components; they must route
    // through the i18n catalog (so a zh-CN employee never sees English mid-chat). Guarding
    // the specific previously-leaked literals keeps the no-literal-string discipline cheap
    // and non-fragile (vs. a blanket JSX-literal ban).
    const chatDir = path.join(repoRoot, 'apps/worker-web/src/worker/studio/chat')
    const bannedLiterals = ['Stop invocation', 'Preparing response', 'Starting invocation']
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        }
        else if ((entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) && !entry.name.includes('.test.')) {
          const body = readFileSync(full, 'utf8')
          for (const literal of bannedLiterals) {
            if (body.includes(`'${literal}'`) || body.includes(`"${literal}"`) || body.includes(`>${literal}<`))
              offenders.push(`${path.relative(repoRoot, full)} hard-codes employee-facing literal "${literal}"`)
          }
        }
      }
    }
    walk(chatDir)
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
